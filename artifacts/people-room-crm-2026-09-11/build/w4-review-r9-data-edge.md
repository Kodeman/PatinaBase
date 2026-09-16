# W4 review — round 9 — data + edge

Adversarial migration + edge review of wave 4 on branch `build/people-room-crm-2026-09-11`,
worktree `.codex/worktrees/agent-people-build`. Read in full: `w4-data-edge-report.md`,
`upload-door-spec.md` §1–§10, migrations `00635`–`00638`, the RPCs they define, the
`paperwork-upload` function, every changed `_shared` module, and the prior fix log
`w4-fix-log-r8.md`. Every ruling in `rulings.md` §3 is treated as settled and is not a finding.

**Verdict: NOT clean — 1 blocking, 1 major, 10 minor.**

No prod call of any kind: no `db push`, no `functions deploy`, no `secrets set`. No server was
started, so no port was taken. All work against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

---

## 1. Prior findings (r8) — all four verified fixed

| r8 id | Where | State |
|---|---|---|
| `MAJOR-1` (data+edge) / `F3` (QA) — every write failure blamed the token, and left an orphan | `supabase/functions/paperwork-upload/core.ts` | **FIXED.** `discardUpload` is defined at 151 and called at 306, ahead of all three RPC-error arms (403 token / 400 `REVERSED_DATES_MESSAGE` / 500 "we could not record that"). The pre-bucket reversed-date check is present. One arm still leaks — see `m-5`, which is a new, narrower finding, not a regression of this one |
| `F1` (QA) / `MAJOR-1` (code) — the row's sentence did not move with the send | `paperwork-model.ts`, `paperwork-sheet.tsx` | **FIXED.** `receivedReading` defined in the model and applied three times in the sheet |
| `F2` (QA) — a pre-hydration click degraded into a GET that dropped the file | `paperwork-upload-form.tsx` | **FIXED.** `method="post"` (162) + `encType="multipart/form-data"` (163), no `action` |
| `MAJOR-2` (code) — the bounce band read the link cache as it stood before the send | `use-invoices.ts` | **FIXED.** `invalidateInvoiceLinkFact` defined at 442, called at 1048 (`useIssueInvoice`) and 1162 (`useSendInvoice`) |

Nothing from r8 is open.

---

## 2. BLOCKING-1 — the receipt letter revokes the payer's link inside the Stripe return window

**`supabase/migrations/00636_invoice_link_hardening.sql`** × **`supabase/functions/stripe-webhook/index.ts:472`**.
Severity **blocking**, confidence **high** — proven live, both orderings, on a freshly reset DB.

Under 00574, `ensure_invoice_link` returned the link that already existed and revoked nothing:

```sql
SELECT token INTO v_token FROM invoice_links WHERE invoice_id = p_invoice_id AND status = 'active';
IF FOUND THEN RETURN v_token; END IF;
```

Under 00636 the same function **revokes the active link and mints a replacement**:

```sql
UPDATE invoice_links SET status = 'revoked', revoked_at = now()
 WHERE invoice_id = p_invoice_id AND status = 'active';
```

00636 anticipated this and guards it — but only while a Checkout is *in flight*:

```sql
IF EXISTS (SELECT 1 FROM invoice_checkout_attempts
            WHERE invoice_id = p_invoice_id
              AND state IN ('claimed','session_created','processing'))
THEN RETURN NULL; END IF;
```

The guard is lifted by the very event that triggers the letter. `markSucceeded` calls
`settle_invoice_checkout_payment`, which sets `invoice_payments.status = 'succeeded'`; the
AFTER trigger `sync_invoice_checkout_attempt` (00428 §9) immediately mirrors that onto the
attempt as `state = 'succeeded'`. Only then does `stripe-webhook` run
`sendSuccessSideEffects`, whose first act is:

```ts
const portalUrl =
  (await ensureInvoiceLinkUrl(admin, CLIENT_PORTAL_URL, invoice.id)) ??
  letterFallbackUrl(CLIENT_PORTAL_URL, invoice.id);
```

So by the time the receipt letter asks for an address, the guard no longer holds, and the link the
payer is standing on is revoked. Meanwhile `resolve_invoice_return_nonce` selects the link the
attempt was claimed against with `AND l.status <> 'revoked' AND l.created_at <= a.created_at` —
which the revoked old link fails and the fresh mint also fails.

**Ordering B — the webhook wins (the payer is sent to `/pay/dead` after paying).** Live, across
real transactions (`now()` frozen inside one transaction masks this, which is why the first probe
showed nothing):

```
=== invoice 'b0000000-0000-0000-0000-00000000e142'
=== L1 (the address in the letter the client holds) '71cb1df1-2e79-4cdb-a6c5-96ddc3e9a1c5'
 step1_guard_while_in_flight
------------------------------
 <NULL: in-flight guard held>

=== settle_invoice_checkout_payment has fired; sync trigger left the attempt succeeded
 step2_receipt_letter_minted_a_new_address
-------------------------------------------
 t

 is_the_address_the_payer_is_standing_on | status
-----------------------------------------+---------
 t                                       | revoked
 f                                       | active

   step3_payer_returns_from_stripe
-------------------------------------
 <NULL  ->  route 303s to /pay/dead>

 step4_payer_refreshes
-----------------------
 {"state": "spent"}
```

The nonce is consumed by the claim `UPDATE` *before* the link lookup, so the failure is permanent:
the payer's first return lands on `/pay/dead`, and every retry thereafter lands on `/pay/used`,
whose sentence — *"the address this nonce already minted is still live"* — is false, because
nothing was ever minted.

**Ordering A — the browser wins (the page dies under the payer seconds later).** This one is not a
race at all; it happens on every successful payment where the redirect beats the webhook:

```
=== CASE A: the browser wins the race and returns first
 step1_payer_landed_on_pay_slash    dd09471edc31...
 step2_that_address_opens_now                     t
=== then the webhook receipt letter runs
 step3_receipt_minted_a_different_address         t
 step4_the_payer_refreshes_and_the_page_still_opens  f

 status  | payers_link
---------+-------------
 revoked | t
 active  | f
```

Either way a client who has just paid is shown the dead sheet. The money and the record are
correct; the page the payer is looking at is not. Two further consequences of the same statement:
`ensureInvoiceLinkUrl` is called *before* `resolveRecipient`, so even when no receipt goes out the
old address is still revoked and the replacement is discarded; and the same call sits on the
failure path (`sendFailureSideEffects`, line 575), where a declined card likewise kills the
`/pay/<token>` the client is about to retry from.

The same statement also means every previously-mailed `/pay/<token>` for an invoice dies each time
any letter goes out. That part reads as deliberate rotation-per-letter; the return window does not.

Note the guard's own comment already states the intent this misses — *"A Checkout in flight owns
the address it is standing on: regenerating under it would kill the payer's own page
mid-payment"*. The window it does not cover is the one between settlement and the payer's return.

**Repro:** `$TMPDIR/w4r9/race2.sql` and `race3.sql`, run with
`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f <file>`
(no `--single-transaction`; both files clean up after themselves).

---

## 3. MAJOR-1 — an `other_named` confirm supersedes by type, not by name

**`supabase/migrations/00637_paperwork_upload_door.sql`**, `confirm_inbound_document` and
`record_inbound_compliance_document`. Severity **major**, confidence **high** — proven live on
seeded data with no setup of my own.

`resolve_paperwork_link` keys an `other_named` document by its label —
`group_key = 'other_named:' || lower(doc_label)` — so the firm's page treats *Resale certificate*
and *Safety plan* as two separate things it owes. The confirm does not:

```sql
SELECT d.id, d.expires_on, d.blocks INTO v_old, v_old_expires, v_old_blocks
  FROM public.studio_compliance_documents d
 WHERE d.holder_id = v_doc.holder_id
   AND d.organization_id = v_doc.organization_id
   AND d.doc_type = v_doc.doc_type        -- no doc_label leg
   AND d.id <> v_doc.id
   AND d.verified_at IS NOT NULL
   AND d.superseded_by IS NULL
 ORDER BY d.verified_at DESC
 LIMIT 1;
```

`record_inbound_compliance_document` inherits `blocks` the same way, also on `doc_type` alone. The
function's own comment claims the narrower rule — *"only onto a currently verified paper of the
SAME type on the SAME holder"* — and spec §5.5 is what the label grouping implements, so the code
and both its own comment and the page disagree.

**Face 1 — the wrong paper is silently retired.** Seeded firm `d0e2…0011` holds one verified
`other_named`, *Resale certificate*. The firm sends a *Safety plan* through the door and a member
opens it:

```
=== firm d0e2…0011 already holds ONE verified other_named: "Resale certificate"
=== the firm now sends a DIFFERENT named paper, "Safety plan", through the door
 member_confirmed_the_safety_plan
----------------------------------
 t

=== the studio book afterwards — the Resale certificate has been RETIRED by a Safety plan
     doc_label      | verified | retired
--------------------+----------+---------
 Resale certificate | t        | t
 Safety plan        | t        | f

=== and what the firm's own page says it still owes
           group_key            | on_file
--------------------------------+---------
 other_named:resale certificate | f
 other_named:safety plan        | t
```

The studio's book and the firm's page now disagree about a document neither of them touched, and
any gate the retired paper held (`compliance_state` reads `superseded_by IS NULL`) silently
vanishes.

**Face 2 — the act becomes inert.** When the mis-picked predecessor holds a gate the new paper
does not, the R-AZ pre-check fires against a document that has nothing to do with it:

```
=== a studio member opens the new Safety plan
ERROR:  compliance_confirm_drops_a_gate
HINT:  The paper it retires blocks more than this one does.
CONTEXT:  PL/pgSQL function confirm_inbound_document(uuid) line 75 at RAISE
```

The firm's document can then never be confirmed, only refused — exactly the outcome D-8 says the
pre-check exists to prevent. A second upload fails identically.

The fix is a `doc_label` leg on the predicate for `doc_type = 'other_named'` (case-folded, to match
`resolve_paperwork_link`'s `lower(doc_label)`), in both functions.

---

## 4. Minor findings

None of these hold the gate.

| id | Where | Finding | Confidence |
|---|---|---|---|
| `m-1` | report §8 | The redeploy set lists **37** functions; the true closure is **36**. `apns-send` names `_shared/send-email.ts` only in comments (lines 29 and 335) and imports nothing from it. The set is otherwise exactly right — a harmless extra redeploy. §8's prose also omits `_shared/invoice-checkout-driver.ts` from the changed modules it closed over (its importers are already in the set anyway) | high |
| `m-2` | report §9 | *"`flushDeferredMessages` writes no out touch."* It does — `supabase/functions/_shared/sms.ts:1225`, inside `flushDeferredMessages`, with its own error log at 1236. Stale since an earlier round | high |
| `m-3` | report §9 | *"The `/paperwork/[token]` page (spec §3) … portal work, W6."* It exists on this branch at `apps/client-portal/src/app/paperwork/[token]`, landed in `36148de9b` | high |
| `m-4` | report §5 | The Deno gate row reads *"777 passed, 1 failed"*. Today, on a clean reset: `_tests` alone is **345 passed / 0 failed**, and the whole `supabase/functions` tree (101 files) is **1537 passed / 0 failed / 1 ignored**, both excluding the pre-existing red `_tests/stripe-rail.test.ts`. The row understates the wave's own coverage | high |
| `m-5` | `paperwork-upload/core.ts:287` | `return { status: 500, body: { error: \`upload failed: ${uploadError.message}\` } };` hands the raw storage error to an unauthenticated caller. Every *other* arm in the same function was rewritten in r8 precisely to stop doing this (`console.error` for the studio, a plain sentence for the firm). This arm was missed | high |
| `m-6` | `paperwork-upload/core.ts:172` | `withinRateLimit` returns `true` when `deps.ip` is null, so an address-less request is unbucketed. 00637's `paperwork_link_rate_limit_hit` comment says the edge function *"refuses a missing address in production"*. One of the two is wrong; `index.ts:38` documents the permissive behaviour, so the SQL comment is the stale one | high |
| `m-7` | 00637, `compliance_documents_member_read` | The policy casts `(storage.foldername(name))[1]::uuid` with no uuid-shape guard. It is correctly gated by `bucket_id = 'compliance-documents'` and the door only ever writes `{org}/{company}/{uuid}/{file}`, so this is latent; but a hand-placed object whose first segment is not a uuid raises 22P02 for every member listing that bucket — the same shape as the `project-documents` 22P02 already on the books | medium |
| `m-8` | 00637 | `confirm_inbound_document` and `reject_inbound_document` do not require `inbound = true`, so an active member can stamp `verified_at` / `rejected_at` on a studio-authored row that never came through the door. Same tenant, membership-gated, so no isolation hole — but the two functions are named for a door they do not check | medium |
| `m-9` | 00635, `record_notice` | `v_refs` and `v_names` come from two separate `array_agg(… ORDER BY t.name)` over the same subquery. With duplicate display names the sort is not guaranteed stable, so index *i* of one array need not correspond to index *i* of the other. Harmless as written — nothing zips them, `notified_refs` is stored and `told_names` only displayed — but the pairing is not the invariant the code reads as | low |
| `m-10` | `paperwork-upload/index.ts:22` | The OPTIONS response carries no `Access-Control-Allow-Methods`. POST is a CORS-safelisted method, so the preflight still passes and nothing is broken; noted only because six neighbours (`invoice-link-checkout`, `designer-invite`, `workspace-member-invite`, `confirm-scan-bundle`, `fulfillment-status`, `qbo-export`) do declare it | low |

---

## 5. What was checked and found sound

Recorded so a later round does not re-derive it.

- **Token verified before any read.** `handlePaperwork` rate-limits first, then dispatches on
  Content-Type; both the `context` action and the multipart upload pass the raw 64-hex token to a
  `service_role`-only SECURITY DEFINER RPC that compares `token_hash = invoice/paperwork hash(p_token)`.
  A bad token yields `{valid:false}` / `403`, never a partial read. `resolve_paperwork_link`,
  `record_inbound_compliance_document` and `paperwork_link_storage_context` each re-verify
  independently — the door does not trust its own earlier check.
- **Uploads never overwrite a verified row.** `upsert: false` on the storage write, and the key
  carries a fresh `crypto.randomUUID()` per attempt, so no two uploads can collide. A confirmed row
  is reached only through `confirm_inbound_document`, which returns early and idempotently when
  `verified_at IS NOT NULL`.
- **Storage policy.** Exactly one policy on the bucket, SELECT only, bucket-gated, org-gated by
  `is_active_studio_member`. No INSERT/UPDATE/DELETE policy, so only the service-role door writes.
  Bucket is private, capped at 15 MB, MIME-restricted to `{application/pdf,image/jpeg,image/png}`.
- **Key scheme avoids the uuid-cast trap** for every key this door writes (`{org}/{company}/{uuid}/{file}`);
  the residual latent case is `m-7`.
- **Grants.** No `anon` and no `PUBLIC` EXECUTE on any of the wave's 18 functions. The definer RPCs
  that carry the token (`resolve_paperwork_link`, `record_inbound_compliance_document`,
  `paperwork_link_storage_context`, `paperwork_link_rate_limit_hit`, `record_touch`,
  `resolve_invoice_link*`, `resolve_invoice_return_nonce`, `ensure_invoice_link`,
  `invoice_link_is_live`, `invoice_link_token_hash`) are `service_role` only; the member-facing ones
  (`mint_paperwork_link`, `revoke_paperwork_link`, `confirm_inbound_document`,
  `reject_inbound_document`, `record_notice`, `get_invoice_link`, `regenerate_invoice_link`) add
  `authenticated` and gate on `is_active_studio_member` inside. Every SECURITY DEFINER pins
  `search_path`.
- **`invoice_links` backfill keeps every `/pay` link working.** The widen-then-empty order is
  correct (`DROP NOT NULL` + `DROP CONSTRAINT chk_invoice_links_token` *before* `UPDATE … SET token = NULL`),
  the plaintext is hashed first, and an address mailed before the migration still resolves by hash.
  The stored hash is useless as a bearer; an unknown token stays silent. Expiry is tested below the
  `v_dead` branch and exempts `paid`, so an expired-but-paid link serves a receipt and opens no
  Checkout, while expired-and-owing and revoked are both silent.
- **`00638` grafts are verbatim.** `issue_agreement_draw_invoice` and
  `get_client_commercial_document_bundle` differ from their 00578 heads only in the two named
  statements (`v_pay_token := public.ensure_invoice_link(v_invoice_id);` and `'payToken', NULL::text`),
  confirmed by programmatic diff. Grep-winner lineage checked for every re-headed function in
  00635–00638.
- **Tenant isolation** proven on `studio_touches`, `paperwork_link_tokens` and `v_access_grants`
  with a genuine stranger (`cf100000-0000-4000-8000-000000000001`); `authenticated` cannot INSERT a
  touch directly.
- **`record_notice` matches the Patina Field wire.** `RecordNoticeParams` (`p_project_id`,
  `p_what`, `p_told`) and `NoticeRow` (`id`, `what`, `recorded_at`, `recorded_by`, `told_names`) in
  `PeopleRoomWire.swift` / `SupabasePeopleRoomService.swift` line up with the RPC signature.
  `project_tenant_org()` is used for the tenant resolution (R-BD).
- **The email rail refuses dead/unsubscribed channels in every branch.** `resolveContactChannel`
  runs for all callers, not only account-less ones; `channelRefusesSend` gates before the send;
  `CHANNEL_STATUS_RANK` never walks a status back. `resend-webhook`'s `writeChannelStatus` fires on
  the no-log-row path, on bounce and on complaint. Unsubscribe tokens cannot cross subjects —
  `parseUnsubscribeSubject` requires the `channel:` prefix and `applyChannelUnsubscribe` only moves
  rows out of `['active','bounced']` sharing the same `value`.
- **`verify_jwt = false`** is declared for `paperwork-upload` in `supabase/config.toml:564–565`, and
  the in-code token check is the authority, matching the `sms-inbound` / `comms-mute` /
  `fulfillment-evidence` precedent. `_primary_studio_for` is not called from any edge code.
  `_shared` imports are relative.

---

## 6. Gates

All run on this worktree after a clean `pnpm --dir … supabase:reset`.

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
…
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f <each>
PASS  supabase/tests/billing/invoice_links_test.sql
PASS  supabase/tests/commercial/design_build_test.sql
PASS  supabase/tests/people/w1a_identity_channels_consent_test.sql
PASS  supabase/tests/people/w1b_compliance_authority_directory_test.sql
PASS  supabase/tests/people/w3_merge_sweep_household_test.sql
PASS  supabase/tests/people/w4_channels_touches_paperwork_test.sql
PASS  supabase/tests/people/w4_invoice_link_freeze_order_test.sql
PASS  supabase/tests/rls/people_directory_scope_test.sql
```

> Recorded because it cost a cycle: run against a database carrying my own earlier probe rows,
> `w1b` fails with `3m expected 21 firm cards, got 24`. That is probe residue, not a wave defect —
> after the reset above it is green. Any round that probes `studio_compliance_documents` must reset
> before trusting `w1b`.

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json supabase/functions/_tests   # minus stripe-rail
ok | 345 passed | 0 failed (1s)

$ deno test --no-check --allow-all --config supabase/functions/deno.json <all 101 *.test.ts, minus stripe-rail>
ok | 1537 passed | 0 failed | 1 ignored (6s)

$ ls supabase/functions/deno.lock
"supabase/functions/deno.lock": No such file or directory (os error 2)
```

`_tests/stripe-rail.test.ts` is the single red file, failing at import with
`error: (in promise) Error: supabaseKey is required.` before any assertion. It needs a live
`functions serve` plus keys, is untouched by this branch (`git diff origin/main...HEAD` on that path
is empty), and its last commit is `5cddbe157`, well before this program.

```
$ supabase gen types typescript --db-url … --schema public   # vs packages/supabase/src/database.types.ts
only difference: the graphql_public block (the repo's db:generate passes --schema public,graphql_public)
→ generated types are in sync; nothing owed

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2831 replayed statements
$ git status --porcelain -- supabase/seed/00-legacy-grants.sql
(empty — already regenerated and committed)
```

Probe results quoted in §2 and §3 above are from `$TMPDIR/w4r9/race2.sql`, `race3.sql` and
`supersede3.sql`, each run against the reset database.

---

## 7. Migration hygiene

Checked and clean: hand-numbered `00635`–`00638`, all above the branch high-water mark and clear of
the reserved `00595`–`00620` block; banner + lineage on every file; idempotent; RLS declared in the
same file as its table; explicit grants with `REVOKE … FROM PUBLIC, anon`; every SECURITY DEFINER
pins `search_path`; `extensions.gen_random_bytes` schema-qualified; CHECK constraints rather than
enums throughout (`studio_touches`' six named CHECKs, the reject columns on
`studio_compliance_documents`, `chk_invoice_links_token_frozen` / `_token_hash`); money in cents.
