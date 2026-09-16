# W4 — adversarial migration + edge review, round 8 (data + edge)

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local only: no `db push`, no `functions deploy`, no secrets set.

Read in full this round: `build/w4-data-edge-report.md`; migrations `00635`, `00636`, `00637`,
`00638`; `supabase/functions/paperwork-upload/{index,core}.ts`,
`_shared/{send-email,sms,invoice-links,invoice-checkout-driver}.ts`,
`resend-webhook/{index,channel-status}.ts`, `sms-inbound/pipeline.ts`;
`packages/notifications/src/{unsubscribe,tokens}.ts`; `packages/supabase/src/hooks/use-invoices.ts`;
`apps/client-portal/src/app/pay/return/[nonce]/route.ts`,
`apps/client-portal/src/components/paperwork/*`, `.../threshold/letterbox.tsx`;
`build/upload-door-spec.md` §5–§9; `build/w4-fix-log-r7.md`; `rulings.md` §3.

**Gate call: `clean = false`.** Zero blocking. **One major.** Fifteen minors, reported per the
brief; none of them holds the gate.

---

## 1. Gates — run this round, pasted

### 1.1 Reset

`pnpm --dir <worktree> supabase:reset` (run with the sandbox disabled: the CLI writes
`~/.supabase/telemetry.json.tmp.*`, which the sandbox denies with EPERM — the same
environment quirk as r7, not a product finding).

```
Seeding data from supabase/seed/people_crm_dev.sql...
Seeding data from supabase/seed/99-local-edge-settings.sql...
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

Ledger head on disk:

```
$ ls supabase/migrations | tail -4
00637_paperwork_upload_door.sql
00638_pay_link_readers_reheaded.sql
20260910152111_create_contact_messages.sql
_pending
```

All four wave migrations replay clean. Numbers 00635–00638 sit above the branch's previous
high-water mark and clear of the reserved 00595–00620 block.

### 1.2 SQL suites — `psql -v ON_ERROR_STOP=1 -f <file>`, on a pristine reset

```
supabase/tests/billing/invoice_links_test.sql EXIT=0
supabase/tests/commercial/design_build_test.sql EXIT=0
supabase/tests/people/w1a_identity_channels_consent_test.sql EXIT=0
supabase/tests/people/w1b_compliance_authority_directory_test.sql EXIT=0
supabase/tests/people/w3_merge_sweep_household_test.sql EXIT=0
supabase/tests/people/w4_channels_touches_paperwork_test.sql EXIT=0
supabase/tests/people/w4_invoice_link_freeze_order_test.sql EXIT=0
supabase/tests/rls/people_directory_scope_test.sql EXIT=0
```

Every suite green. **One thing the round learned the hard way** and records as MINOR-14: an
earlier run of the same eight, against a database this reviewer had written probe rows into,
produced

```
psql:.../w1b_compliance_authority_directory_test.sql:1140: ERROR:  3m expected 21 firm cards, got 24
```

That block asserts an **absolute** count of seeded firm cards rather than a delta, so the suite
is green only on a pristine reset. It is a W1 file and pre-existing; it is named because a
reviewer or a CI job that runs it second will read a false red.

### 1.3 Deno

`deno.lock` absent before and after (`ls deno.lock` → `No such file or directory`).

```
$ deno test --no-check --allow-all \
    --config <worktree>/supabase/functions/deno.json \
    supabase/functions/_shared/ supabase/functions/_tests/ \
    supabase/functions/paperwork-upload/ supabase/functions/resend-webhook/

 ERRORS
./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)
error: (in promise) Error: supabaseKey is required.
    at .../supabase/functions/_tests/stripe-rail.test.ts:34:31

 FAILURES
./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)

FAILED | 803 passed | 1 failed (3s)
```

The one failure is **not this wave's**: `git diff --name-only origin/main...HEAD --
supabase/functions/_tests/stripe-rail.test.ts` is empty, and the file constructs a Supabase
client at module top level from env this run does not set (it belongs to `_tests/run.sh`, which
boots `functions serve` with keys).

`--no-check` is required, and that is MINOR-15: with type-checking on, the run dies before any
test at `supabase/functions/fulfillment-po/core.ts:314` — `encodeBase64(bytes)`, `TS2345`. That
file is also untouched by this branch (empty diff against `origin/main`), so the defect is
pre-existing; it matters here only because the brief's own gate command is the un-`--no-check`
form, which is red for reasons W4 did not cause.

---

## 2. Prior-round findings — re-check

| r7 finding | Status | Evidence |
|---|---|---|
| **BLOCKING-1** — a cancelled Checkout return rotates the pay link (R-BT) | **FIXED** | `_shared/invoice-checkout-driver.ts` `invoiceCheckoutReturnBase` now opens `if (checkout === 'cancelled') { return target.cancelUrl; }` — the minter is never reached on the cancel arm. |
| **MAJOR-1** — a spent nonce rotates again on every replay (R-BT, second leg) | **FIXED** | 00636 claims the nonce atomically: `UPDATE public.invoice_checkout_attempts a SET return_nonce_consumed_at = now() WHERE a.return_nonce = p_nonce AND a.return_nonce_consumed_at IS NULL RETURNING a.id`. A second GET gets no row and the RPC answers `{"state":"spent"}`; `apps/client-portal/src/app/pay/return/[nonce]/route.ts` maps that to a 303 to `/pay/used`. |
| **MAJOR-2** — the firm's page says *current* where the studio's reader says *not on file* (R-BU) | **FIXED** | `resolve_paperwork_link` is rebuilt as `paper → held / unchecked_paper / refused_paper → keys → grouped`, so an inbound-unconfirmed row reads `awaiting_check` and a rejected one reads `refused`; `compliance_state`'s head gained the matching `AND d.rejected_at IS NULL AND NOT (d.inbound AND d.verified_at IS NULL)`. Both readers now name the same paper. |
| **MAJOR-3** — `invalidateInvoiceEffects` nukes the invoice-link cache (R-BV) | **FIXED** | `packages/supabase/src/hooks/use-invoices.ts` opens the helper with `void invoiceId;` and no longer invalidates `['invoice-link', id]`; `useRegenerateInvoiceLink` has no `onSuccess`, so the minted address stays in the cache. The folio test is un-mocked (`invoice-folio-minted-address.test.tsx`). |
| **MAJOR-4** — a paid invoice's receipt link goes silent 30 days after the migration | **FIXED** | The resolver exempts paid invoices from the backfilled expiry: `IF NOT v_dead AND v_invoice.status <> 'paid' AND v_link.expires_at IS NOT NULL AND v_link.expires_at <= now() THEN RETURN NULL; END IF;` |
| **MAJOR-5** — `sms-inbound` authority check omits `draw_certify` (CRM-22) | **FIXED** | `AUTHORITY_SCOPES = { money: ["money","change_order","draw_certify"], selection: ["selections"], schedule: ["schedule"], site_access: ["site_access","key"] }` — all seven DB-side scope values are now reachable. |
| MINOR-1 — `studio_compliance_documents` keeps full member write policies | **OPEN** | `pg_policies` still lists `..._member_insert`, `..._member_update`, `..._member_delete` alongside `..._member_select`. Re-filed as MINOR-8 below. |
| MINOR-2 — report says `letterbox.tsx` "still reads `get_invoice_link`" | **OPEN (stale text)** | Re-filed as MINOR-6. |
| MINOR-3 — report says `flushDeferredMessages` writes no touch | **OPEN (stale text)** | Re-filed as MINOR-5. |
| MINOR-4 — §8's 37-function redeploy set over-inclusive | **OPEN** | Re-filed as MINOR-4. |
| MINOR-5 — report says "ledger head 00637" | **OPEN** | Re-filed as MINOR-1. |
| MINOR-6 — report §6 lists two changed test files | **OPEN** | Re-filed as MINOR-3. |
| MINOR-7 — the rate-limit bucket keys on an address the door cannot trust | **OPEN** | Re-filed as MINOR-9. |
| MINOR-8 — `record_touch` returns NULL instead of raising | **OPEN** | Re-filed as MINOR-10. |
| MINOR-9 — `pnpm db:generate` truncates `database.types.ts` when `SUPABASE_DB_URL` is unset | **OPEN** | Re-filed as MINOR-11. |

No prior finding regressed.

---

## 3. Findings

### MAJOR-1 — the upload door tells a firm with a **live** token that its token is "invalid or expired", and leaves the file behind

`supabase/functions/paperwork-upload/core.ts` — confidence **high**.

`uploadPaperwork` puts the file in the bucket first and records the row second (the spec's order,
§5.2 → §5.3). On the second step it collapses **every** database error into one answer:

```ts
  if (error) {
    // The token can die between the context read and this call — a narrow
    // TOCTOU window the RPC closes by re-verifying. That is a 4xx, not a 500.
    const status = /paperwork_token_invalid/i.test(error.message) ? 403 : 400;
    return { status, body: { error: "invalid or expired token" } };
  }
```

The `403` arm is right. The `400` arm is the problem: it is the *else* of a token test, and it
says "invalid or expired token" about a token the same request verified twice (once through
`paperwork_link_storage_context`, once inside `record_inbound_compliance_document`).

This is reachable with a plain typo. `record_inbound_compliance_document` passes
`p_issued_on` / `p_expires_on` straight through to `studio_compliance_documents`, which carries
`studio_compliance_documents_dates_check`. Reversing the two dates raises **SQLSTATE 23514**
(confirmed against the local database this round). Nothing upstream catches it: `core.ts`
validates only doc-type, label-presence, expiry-presence, MIME and size, and the browser form
(`apps/client-portal/src/components/paperwork/paperwork-upload-form.tsx`) has two bare date
inputs and no ordering check — it renders whatever `answer.error` the door returns, verbatim.
The same funnel swallows `22007` (a malformed date), `22001` (an over-length label) and any
other constraint the RPC can raise.

Two consequences:

1. **The act is unreachable and the reader disagrees with the record.** The firm is told the
   thing it cannot fix ("your token is invalid or expired") about the one thing that is actually
   fine, and is given no way to discover that the dates are the wrong way round. Its only
   recourse is to ask the studio for another link, which will fail identically.
2. **An orphan object is left in `compliance-documents`.** The upload succeeded; the RPC failed;
   nothing calls `.remove(key)`. Every retry lands another copy under a fresh upload id, and the
   bucket has no row pointing at any of them.

**Fix.** Keep the `paperwork_token_invalid` → 403 arm. For anything else: delete the just-uploaded
object (`storage.from("compliance-documents").remove([key])`) and answer with a message that is
true — map the date constraint to "the expiry date must fall after the issue date" and everything
else to a 500 "we could not record that — try again". Cheaper still, validate the ordering in
`core.ts` beside the other field checks, so the common case never reaches the bucket.

---

### Minors (report them, they do not hold the gate)

**MINOR-1 — `w4-data-edge-report.md` §5 says "ledger head `00637`".** The head is `00638`
(`00638_pay_link_readers_reheaded.sql`). Confidence high. Fix: say 00638.

**MINOR-2 — §1's migration table omits `00638` entirely.** It lists 00635/00636/00637 only,
while §4 describes 00638's two re-headed readers at length. A reader working from the table
alone would miss a quarter of the wave's SQL. Confidence high. Fix: add the row.

**MINOR-3 — §6 "Two existing test files this wave had to change" is wrong on both counts.**
Against `origin/main` the **modified** suites are three — `billing/invoice_links_test.sql`,
`commercial/design_build_test.sql`, `rls/people_directory_scope_test.sql` — and the first bullet
names `people/w1b_…_test.sql`, which is *added* on this branch (W1's file), not existing.
Confidence high. Fix: list the three modified suites and say the w1b edit is in-branch.

**MINOR-4 — §8's W7 redeploy set (37 functions) is over-inclusive by one.** Walking the import
graph from the four edited `_shared` modules (`send-email.ts`, `sms.ts`, `invoice-links.ts`,
`invoice-checkout-driver.ts`) plus the three functions whose own code changed gives **36**.
`apns-send` mentions `_shared/send-email.ts` only in a comment (`grep -n "_shared/"
supabase/functions/apns-send/index.ts` → one comment line) and imports none of them. Harmless —
the cost is one redundant deploy — but the number is the checklist W7 works from. Confidence
high. Fix: drop `apns-send`, say 36. (The closure is otherwise correct: both importers of the
newly-edited `invoice-checkout-driver.ts`, `create-checkout-session` and
`invoice-link-checkout`, are already on the list.)

**MINOR-5 — §9 still says "`flushDeferredMessages` writes no out touch".** It does:
`_shared/sms.ts` line ~1225 calls `record_touch` with `p_actor_ref: "sms-dispatch-flush"`,
alongside the one in `sendPartySms` at ~991. Stale since r7. Confidence high.

**MINOR-6 — §4 and §9 still say the client letterbox "still reads `get_invoice_link`".** It does
not; `apps/client-portal/src/components/threshold/letterbox.tsx` was repointed in W4 r2 and its
own header comment records the change ("THE TERMINAL ACT OPENS THE LETTER, NOT AN ADDRESS"). Stale
since r7. Confidence high.

**MINOR-7 — §5's Deno row says "777 passed, 1 failed"; the run is now 803 passed, 1 failed.**
Confidence high.

**MINOR-8 — `studio_compliance_documents` still carries member INSERT/UPDATE/DELETE policies, so
`confirm_inbound_document` / `reject_inbound_document` are not the only doors.** `pg_policies`
lists `studio_compliance_documents_member_{insert,update,delete}`. A member with a PostgREST call
can stamp `verified_at` on an inbound row without any of the four R-AZ pre-checks, or delete a
rejected one. Not a cross-tenant hole (every policy is org-scoped through
`is_active_studio_member`) — which is why it is minor — but the spec's "one door" claim is not
what the table enforces. Confidence high. Fix: narrow the member write policies to
`inbound = false`, or drop them and route studio-side writes through RPCs.

**MINOR-9 — the rate-limit bucket keys on a caller address the door cannot trust, and the
comment claims a refusal it does not make.** `paperwork_link_rate_limit_hit(inet, integer)` is
keyed on the IP `index.ts` derives from `cf-connecting-ip` / the first `x-forwarded-for` hop, and
`withinRateLimit` **allows** the request when `!deps.ip` or when the RPC errors — while 00637's
comment on the function says "the edge function refuses a missing address in production". One of
the two has to move. Confidence high. Fix: correct the comment, and decide explicitly whether a
missing address fails open (as now) or closed.

**MINOR-10 — `record_touch` answers NULL rather than raising when it cannot resolve the org, and
nothing counts the NULLs.** Callers log only `touchError`, so a systematically unattributable
send writes no touch, raises nothing and shows up nowhere. Confidence medium. Fix: count them in
`job_runs`, or log at warn on a NULL return.

**MINOR-11 — `pnpm db:generate` writes a 0-byte `packages/supabase/src/database.types.ts` when
`SUPABASE_DB_URL` is unset.** A landmine for whoever regenerates types next. Confidence high.
Fix: fail the script when the URL is missing.

**MINOR-12 — `other_named` inherits `blocks` from whatever named document happens to be the
studio's current `other_named` paper.** `record_inbound_compliance_document` matches on
`doc_type` alone, and every named document shares the one type, so a re-upload of "Site-specific
safety plan" can inherit the gates of an unrelated "Confined-space permit". The studio corrects
it at confirm time, so nothing ships wrong — but the default is arbitrary. Confidence medium.
Fix: match on `doc_type` **and** `doc_label` for `other_named`.

**MINOR-13 — the r8 note on `issue_agreement_draw_invoice`, recorded as sound, not a defect.**
00638 has it call the revoking minter (`v_pay_token := public.ensure_invoice_link(v_invoice_id)`).
A second call against the same draw cannot revoke an already-emailed address, because the
re-issue is refused first: `IF v_draw.invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM
public.invoices invoice WHERE invoice.id = v_draw.invoice_id AND invoice.status <> 'void') THEN
RAISE EXCEPTION 'the draw "%" is already billed on a live invoice'`. Listed so the next round
does not re-open it.

**MINOR-14 — `w1b_compliance_authority_directory_test.sql` block "3m" asserts an absolute firm-card
count (`expected 21 firm cards, got 24`), so the suite reds on any database that is not a fresh
reset.** W1's file, pre-existing. Confidence high. Fix: assert a delta scoped to the fixture id
space, as the w4 suites do.

**MINOR-15 — the brief's own Deno gate command is red for a pre-existing reason.** With
type-checking on, the run aborts at `supabase/functions/fulfillment-po/core.ts:314`
(`encodeBase64(bytes)`, `TS2345`) before a single test executes. Untouched by this branch.
Confidence high. Fix: repair the `encodeBase64` call (or record `--no-check` as the wave gate).

---

## 4. Checked this round and found sound

Everything the brief named, in its order.

- **The paperwork token is verified before any read.** `index.ts` takes the raw body and hands it
  to `core.ts`; `uploadPaperwork` shape-checks `^[0-9a-f]{64}$` and then resolves the studio and
  firm **from the token** via `paperwork_link_storage_context` — nothing the browser sent is
  consulted for either. The token itself is never stored: `paperwork_link_tokens` holds the
  sha256 hex, and the compare happens inside the definer RPCs on the hash.
- **Expired and revoked tokens refuse.** Both `paperwork_link_storage_context` and
  `record_inbound_compliance_document` re-verify (the RPC closing the TOCTOU window the context
  read opens); a dead token produces `paperwork_token_invalid` → 403.
- **Uploads never overwrite a verified row.** `record_inbound_compliance_document` only ever
  INSERTs; `confirm_inbound_document` is the only writer of `verified_at`, and it runs all four
  R-AZ pre-checks first. The storage write is `upsert: false` on a key whose third segment is a
  fresh `crypto.randomUUID()`, so two uploads never collide.
- **Storage policies stay inside the token's company path, and the key scheme dodges the uuid-cast
  trap.** The bucket is private, 15 MB, `pdf/jpeg/png`; the only policy is read-only for
  `public.is_active_studio_member(NULLIF((storage.foldername(name))[1], '')::uuid)`, and there is
  no INSERT/UPDATE/DELETE policy at all, so the anonymous uploader never touches storage directly —
  the service client writes on its behalf at `{org}/{company}/{upload}/{filename}`, every segment
  a real uuid. Probed directly: the 22P02 `invalid input syntax for type uuid` raised by
  `project-documents` (00170/00430) still raises with 00637's policy dropped — it is pre-existing
  and unrelated — and **00637's policy alone does not raise**.
- **Recipients match R-AC.** `record_inbound_compliance_document` notifies owners + admins + the
  member who minted the link, and no one else.
- **The email rail refuses dead and unsubscribed channels in every branch.** `channelRefusesSend`
  is `status === "dead" || status === "unsubscribed"`, and the r7 fix that moved the lookup out
  of the account-less branch holds: `const channel = (await resolveContactChannel(...)) ?? undefined;`
  runs on every send, while `const recordChannel = options.userId ? undefined : channel;` keeps the
  `notification_log` ref on the account-less path only. Addresses cannot slip past on case: the
  lookup lowercases (`to.trim().toLowerCase()`) and so does the column
  (`normalize_channel_value` → `lower(btrim(...))` for `email`/`ap_email`, applied by
  `normalize_studio_contact_channel_trg` on INSERT **and** UPDATE). `resend-webhook`'s
  `applyChannelStatus` lowercases the provider's address the same way, writes worst-first across
  every row carrying it, never walks a verdict backwards, never writes `active`, and is called on
  the `!logEntry` path too.
- **Unsubscribe tokens cannot cross subjects.** `parseUnsubscribeSubject` returns
  `{kind:'channel'}` only for a subject literally prefixed `channel:`, everything else
  `{kind:'user'}`; a channel token therefore cannot resolve to a profile or the reverse.
  `applyChannelUnsubscribe` scopes its write to `.eq('value', channel.value)` +
  `.in('channel_kind', ['email','ap_email'])` + `.in('status', ['active','bounced'])` and reports
  `scope: 'address'` — it stops the address, and touches no consent row.
- **Touches are written on every send and receive path, and the authority check matches CRM-22.**
  Out: `sendCompliantEmail` on `delivered`, `sendPartySms`, `flushDeferredMessages`. In:
  `recordInboundTouch` plus `recordConsentTouches` (STOP/HELP and the project-chooser pick).
  `AUTHORITY_SCOPES` now covers all seven DB scope values, and `filedDecisionFacts` files a court
  mismatch as `failed_unknown_sender`. `studio_touches`' own CHECK
  (`authority_check = 'n/a' OR decision_class <> 'none'`) is enforced at the table, and RLS is
  SELECT-only for members with no INSERT/UPDATE/DELETE policy — `record_touch` (service_role) is
  the only writer.
- **`record_notice` matches Patina Field.** `record_notice(p_project_id, p_what, p_told)` against
  `RecordNoticeParams { p_project_id, p_what, p_told }` and
  `NoticeRow { id, what, recorded_at, recorded_by, told_names }` in
  `apps/mobile/Capture/Capture/Features/People/PeopleRoomWire.swift` — exact. It gates on
  `is_active_studio_member(project_tenant_org(...))` (R-BD) and stores only refs that resolve to a
  seat on this job or a card in this studio.
- **The `invoice_links` backfill keeps every `/pay` link working.** Ordering is widen-then-empty
  (R-BX): drop NOT NULL → drop the old CHECK → `UPDATE ... SET token = NULL` → add
  `chk_invoice_links_token_frozen CHECK (token IS NULL)`. Every 00574-era producer emits 64-hex,
  so `token_hash` can never be NULL after the backfill and the `SET NOT NULL` is safe on Strata.
  Old plaintext lookup fails closed (`get_invoice_link` returns `token: NULL` unconditionally, and
  the hooks' parser rejects it); the hashed lookup works, proved by
  `supabase/tests/people/w4_invoice_link_freeze_order_test.sql` and the reworked
  `billing/invoice_links_test.sql`. Active links get `now() + 30 days`, dead ones keep
  `COALESCE(revoked_at, created_at)`, and paid invoices are exempt from the expiry (r7 MAJOR-4).
- **`_shared` fan-out enumerated**: 36 functions (see MINOR-4), all of them redeployed in W7.
- **Binding-rule sweep, all clean**: hand-numbered above the branch head and clear of 00595–00620;
  grep-winner bodies grafted verbatim for `resolve_invoice_link`,
  `resolve_invoice_link_for_checkout` and `v_access_grants`; banner + lineage on all four files;
  idempotent replay (proved by the reset); RLS in the same file as the table; explicit grants with
  `REVOKE ... FROM PUBLIC` and anon on the definer RPCs the door needs; every `SECURITY DEFINER`
  pins `search_path`; extension functions schema-qualified; CHECK constraints rather than enums;
  money in cents; `seed/00-legacy-grants.sql` regenerated; `project_tenant_org()` used for every
  tenant resolution; consent stays record-only (R-AY).
- **Edge-rule sweep, all clean**: `paperwork-upload` lives at
  `supabase/functions/paperwork-upload/index.ts` in the neighbours' `Deno.serve` shape;
  `_shared` imports relative; all email through `sendCompliantEmail`; `verify_jwt = false`
  declared in `config.toml` **and** paired with the in-code token check (the
  `sms-inbound`/`comms-mute`/`fulfillment-evidence` precedent); OPTIONS answered 204 with
  `corsHeaders` identical to `fulfillment-evidence`; raw body read before parsing; the service
  client built only after the request is in hand; no call to `_primary_studio_for` anywhere in
  edge code (R-AM); `deno.lock` absent; no secret value printed — names only.

## 5. Gate call

`clean = false` — one major (MAJOR-1). Zero blocking. Fifteen minors reported and not gating.
