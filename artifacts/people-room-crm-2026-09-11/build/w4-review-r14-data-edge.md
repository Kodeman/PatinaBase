# W4 — data + edge adversarial review, round 14

Branch `build/people-room-crm-2026-09-11` · worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build` ·
local DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

**Verdict: CLEAN — 0 blocking, 0 major, 13 minor.**

Everything held this round. The paperwork door verifies its token before it
reads anything, refuses expired and revoked tokens on both the read and the
write leg, never touches a verified row, and hands out only the token's own
company path. The `invoice_links` backfill keeps every `/pay/<token>` address
in a client's inbox working while the plaintext column is frozen NULL, so a
legacy plaintext lookup fails closed. Every finding below is a MINOR: four are
inaccuracies in the wave's own report, four in `upload-door-spec.md`, and five
are small defensive gaps in code that no shipped path can reach today. Per the
brief, minors never hold the gate.

---

## 1. Re-check of every r13 finding

`w4-fix-log-r13.md` claims one fix (MAJOR-1) and dismisses F-2.

| r13 | Claim | r14 status |
|---|---|---|
| **MAJOR-1** | A killing Resend verdict landed on `studio_contact_channels` but never on `profiles.email_suppressed`, so an account-holding recipient kept getting mail after a hard bounce. | **FIXED, verified.** `supabase/functions/resend-webhook/channel-status.ts` now exports `normalizeChannelAddress`, `isSuppressingStatus` and `suppressProfilesForAddress`, and `writeChannelStatus` in `resend-webhook/index.ts` calls the mirror from all three branches (orphan, bounce, complaint). Covered by `supabase/functions/_tests/email-channel-status.test.ts`; the suite is green. |
| **F-2** | designer-portal OTP failure dismissed as a local-stack restart artifact. | **Accepted.** Not reproducible; no product path implicated. |
| m-1 | Report §5 says "ledger head `00637`". | **OPEN** → r14 MIN-1 |
| m-2 | Report §7 says "Eight blocks"; the suite has 16. | **OPEN** → r14 MIN-2 |
| m-3 | Report §8 lists `apns-send` in the W7 redeploy set. | **OPEN** → r14 MIN-3 |
| m-4 | Report §8's basis line omits `invoice-checkout-driver.ts`. | **OPEN** → r14 MIN-4 |
| m-5 | Storage policy casts `(storage.foldername(name))[1]::uuid` unguarded. | **OPEN, now CONFIRMED by probe** → r14 MIN-5 |
| m-6 | Spec §8 claims the storage policy keys on `(organization_id, company_id)`. | **OPEN** → r14 MIN-6 |
| m-7 | `withinRateLimit` lets a NULL RPC answer through. | **OPEN** → r14 MIN-8 |
| m-8 | Spec §8's rate-limit table shape. | **OPEN** → r14 MIN-7 |
| m-9 | `resolveContactChannel` returns `null` on a query error, so the suppression gate fails open. | **OPEN** → r14 MIN-9 |
| a11y | AX-10 `matched`. | **OPEN** → r14 MIN-13 |

No r13 finding regressed. No previously-fixed behaviour came undone.

---

## 2. The brief's explicit check list

| Check | Result | Evidence |
|---|---|---|
| Paperwork token verified before any read | **PASS** | `resolve_paperwork_link` / `paperwork_link_storage_context` / `record_inbound_compliance_document` each shape-check `^[0-9a-f]{64}$` and look the row up by `token_hash = encode(extensions.digest(p_token,'sha256'),'hex')` — an indexed equality on a 256-bit digest, the same discipline as `field_link_tokens` (00283) and `fulfillment_evidence_upload_tokens` (00364). Edge side reads the raw body once (`req.text()` / `req.formData()`) before parsing. Probe Q1. |
| Expired / revoked refuse | **PASS** | Probe Q1: expired and revoked refuse on the read leg *and* on the storage-context leg, and a revoked token's write is refused with `paperwork_token_invalid`. |
| Uploads never overwrite a verified row | **PASS** | `record_inbound_compliance_document` only ever INSERTs. Probe Q2: after an inbound upload of the same `doc_type`, the verified row keeps its `file_path`, its `verified_at`, and a NULL `superseded_by`; the new row is `inbound=true, verified_at IS NULL`. |
| Storage policies allow only the token's company path | **PASS (org-level)** | Probe Q3/Q4: the context RPC returns the token's own org+company; studio A cannot read B's folder and vice versa; `anon` reads nothing. The policy gates on segment 1 (org), not segment 2 — see MIN-6; that is narrower than the spec's sentence but is not a hole, because a token can only ever produce a key under its own company. |
| Key scheme avoids the uuid-cast trap | **PASS in practice** | Every segment the policy casts is a real uuid, and the only writer is the edge function's service-role client. The cast is nevertheless unguarded — MIN-5, confirmed reachable only by an out-of-band write. |
| Recipients per R-AC | **PASS** | `record_inbound_compliance_document` notifies owners/admins of the holding studio UNION `v_row.created_by`. |
| Email rail refuses dead/unsubscribed in every branch | **PASS** | `resolveContactChannel` is now called unconditionally (not `options.userId ? undefined : …`), and `channelRefusesSend(status)` gates every send. Fails open only when the lookup itself errors — MIN-9. |
| Unsubscribe tokens cannot cross subjects | **PASS** | `parseUnsubscribeSubject` returns `{kind:'channel'}` only for a `channel:`-prefixed subject; `applyChannelUnsubscribe` narrows by `value` + `.in('channel_kind',['email','ap_email'])` + `.in('status',['active','bounced'])`. A profile token cannot address a channel and vice versa. |
| Touches insert on every send/receive path | **PASS** | Out: `send-email.ts` on `result.state === "delivered"` with a resolved `studioRow`. In: `sms-inbound/pipeline.ts` `recordInboundTouch` / `recordConsentTouches`. Probe Q6/Q7. |
| `authority_check` matches CRM-22 | **PASS** | CHECK is `IN ('n/a','passed','failed_no_authority','failed_unknown_sender')` plus `authority_check = 'n/a' OR decision_class <> 'none'`; `authorityVerdictFor` maps a read failure to `failed_no_authority` and a court mismatch to `failed_unknown_sender`. |
| `record_notice` matches the Patina Field signature | **PASS** | `RETURNS TABLE (id, what, recorded_at, recorded_by, told_names)`. Probe Q8: a stranger id is dropped, two seats sharing a display name are both kept. Probe Q9: cross-tenant refused. |
| `invoice_links` backfill keeps every `/pay` link working | **PASS** | Probe Q5: `resolve_invoice_link` and `resolve_invoice_link_for_checkout` both resolve the raw token; `invoice_links.token` is NULL for every row (frozen by `chk_invoice_links_token_frozen`) so a plaintext lookup returns nothing; the hashed row exists; expiry closes both readers. The migration order is proven by `supabase/tests/people/w4_invoice_link_freeze_order_test.sql` (hash → widen → null → CHECK → NOT NULL → unique index). |
| Every `_shared` importer enumerated | **PASS** | Changed `_shared` files: `send-email.ts`, `invoice-links.ts`, `invoice-checkout-driver.ts`, `sms.ts` (+ their tests) and `packages/notifications/{tokens,unsubscribe}.ts`. The §8 set of 37 covers every importer; it is over-inclusive by one (MIN-3) and its stated basis is incomplete (MIN-4). |

Settled and not findings: every ruling in `artifacts/people-room-crm-2026-09-11/rulings.md` §3 (R-A … R-CB).

---

## 3. Findings

All thirteen are **minor**. None holds the gate.

### MIN-1 — report §5 names the wrong ledger head *(minor, high)*
`build/w4-data-edge-report.md` §5 says the ledger head is `00637`. The branch
head is `00638_pay_link_readers_reheaded.sql`.
**Fix:** change §5 to `00638`.

### MIN-2 — report §7 undercounts the test blocks *(minor, high)*
§7 says "Eight blocks". `supabase/tests/people/w4_channels_touches_paperwork_test.sql`
carries 16.
**Fix:** say sixteen, or drop the count.

### MIN-3 — `apns-send` is in the W7 redeploy set but imports nothing changed *(minor, high)*
`grep -n "_shared/" supabase/functions/apns-send/index.ts` finds only a comment
mentioning `_shared/send-email.ts`; there is no import. Redeploying it is
harmless, but the set is meant to be the exact fan-out.
**Fix:** drop `apns-send` from §8, or footnote it as a deliberate belt-and-braces.

### MIN-4 — report §8's basis line omits `invoice-checkout-driver.ts` *(minor, high)*
The changed `_shared` files are `send-email.ts`, `invoice-links.ts`,
`invoice-checkout-driver.ts` and `sms.ts`. §8 names the first, second and
fourth.
**Fix:** add `invoice-checkout-driver.ts` to the basis sentence.

### MIN-5 — the storage policy's `::uuid` cast is unguarded *(minor, high — CONFIRMED)*
`00637_paperwork_upload_door.sql` §4:
```sql
USING (bucket_id = 'compliance-documents'
       AND public.is_active_studio_member(
             NULLIF((storage.foldername(name))[1], '')::uuid))
```
Probe Q4b inserts `compliance-documents/legacy/loose.pdf` and then reads the
bucket as an active studio member: the scan raises `22P02
invalid_text_representation` and **every** member of **every** studio loses the
whole bucket, not just that row. This is exactly the `project-documents`
failure the migration's own comment cites. It is not reachable today — the only
writer is the edge function's service-role client, whose key is always
`<org uuid>/<company uuid>/<upload uuid>/<filename>` — so the guard is a
convention, not a constraint. Reported as minor because it fails closed (denies
reads, never grants them) and no shipped path can trigger it.
**Fix:** guard the cast, e.g.
`AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'` before the cast, or wrap
it in a `STRICT`/`IMMUTABLE` safe-cast helper.

### MIN-6 — spec §8 claims a two-segment storage policy *(minor, high)*
`upload-door-spec.md` §8 line 134 says the `storage.objects` policies are
"keyed on `(organization_id, company_id)` path segments, studio-member
read/write". Shipped: one SELECT policy keyed on segment 1 only, and no write
policy at all for members.
**Fix:** amend §8 to "keyed on the organization segment; member SELECT only,
writes service-role".

### MIN-7 — spec §8 / §4 describe the wrong rate-limit table *(minor, high)*
Spec line 39 and line 132 say `paperwork_link_rate_limits` has
`ip_address inet primary key`. Shipped: `bucket_key text` primary key, with
`paperwork_link_rate_limit_hit(p_ip, p_token, …)` walking the
ip → link → tok → anon ladder. The shipped shape is the better one (it covers a
tokenless caller and a proxied IP); the spec is stale.
**Fix:** rewrite the spec's two sentences to the `bucket_key` shape.

### MIN-8 — `withinRateLimit` lets a NULL answer through *(minor, medium)*
`supabase/functions/paperwork-upload/core.ts`:
```ts
if (error) { console.error(...); return false; }
return data !== false;
```
An error fails closed, correctly. A `null` — which `paperwork_link_rate_limit_hit`
does not return today, but nothing stops a future body from returning — reads as
"within limit".
**Fix:** `return data === true;`.

### MIN-9 — `resolveContactChannel` fails open on a lookup error *(minor, medium)*
`supabase/functions/_shared/send-email.ts` returns `null` when the
`studio_contact_channels` query errors, and a `null` channel means the
`channelRefusesSend` gate is skipped entirely. The header comment argues the
open posture deliberately (most recipients have no row at all), which is right
for *no row* but wrong for *could not read*. A transient PostgREST failure
therefore mails a hard-bounced or unsubscribed address. The r2 BLOCKING incident
in the same function was this exact swallow.
**Fix:** distinguish "no rows" from "error" — return a sentinel on error and
refuse the send, the way `invoiceLettersMustHold` already fails closed on an
unreadable predicate.

### MIN-10 — spec §5's RPC signature omits `p_doc_label` *(minor, high)*
Spec line 90 writes
`record_inbound_compliance_document(p_token, p_doc_type, p_number, p_issuer, p_issued_on, p_expires_on, p_file_path)`.
Shipped signature inserts `p_doc_label text DEFAULT NULL` after `p_doc_type`,
and the edge function passes it — it is load-bearing for the `other_named`
grouping key.
**Fix:** add `p_doc_label` to the spec's signature.

### MIN-11 — spec §5/§8 call the column `is_inbound`; it ships as `inbound` *(minor, high)*
Spec line 93 (`is_inbound = true`) and line 133 (`is_inbound boolean`) name a
column that does not exist. The shipped column on
`studio_compliance_documents` is `inbound`, and `compliance_state` §1b reads
`d.inbound`.
**Fix:** rename in the spec.

### MIN-12 — spec §8 says members write to the bucket *(minor, high)*
Line 133/134 promise "studio-member read/write" on `compliance-documents`.
Shipped grants members SELECT only; the sole writer is the service-role client.
The shipped posture is the safer one.
**Fix:** amend the spec's access column.

### MIN-13 — a11y AX-10 `matched` *(minor, medium)*
Carried from r13 unchanged; the portal-side contract is unaltered by this
wave's diff.
**Fix:** as recorded in r13.

---

## 4. Considered and NOT reported

- **`record_notice`'s two independently-sorted aggregates.**
  `array_agg(t.ref ORDER BY t.name)` and `array_agg(t.name ORDER BY t.name)`
  run as two separate tuplesorts, so on a duplicate display name the *i*-th ref
  need not belong to the *i*-th name. Chased it: nothing anywhere pairs them by
  index — `notified_refs` lands on the touch row as a set, `told_names` is
  rendered as a list — and the multiset is identical either way. Probe Q8 files
  a notice to two seats both called "Same Name" and both refs and both names
  survive. Not a finding.
- **Token verification is an indexed hash equality, not an in-code
  constant-time `timingSafeEqual`.** Every bearer rail on this branch works
  this way (00283, 00364, 00636, 00637): the raw token is hashed and the digest
  is looked up by index. A 256-bit digest equality is not a practical timing
  oracle, and the precedent rails are the settled shape. Not a finding.
- **`paperwork-upload`'s `corsHeaders` carry no
  `Access-Control-Allow-Methods`.** The door takes only `POST` with
  `multipart/form-data` or `application/json`; `POST` is CORS-safelisted and the
  preflight succeeds without the header in every browser. Matches the
  neighbours. Not a finding.
- **`mint_paperwork_link` puts no upper bound on a caller-chosen
  `p_expires_at`.** R-AD gives the studio the window. Settled.
- **`confirm_inbound_document` does not require `inbound = true`.** Confirming a
  studio-filed paper that was never verified is a legitimate act, not a hole.
- **`record_inbound_compliance_document` inherits `blocks` from prior paper of
  the same type.** The ORDER BY puts verified paper first and excludes rejected
  and superseded rows, so an unchecked upload cannot teach the next one a
  weaker gate.
- **`supabase db reset` fails through `pnpm supabase:reset` with
  `EPERM … /Users/kody/.supabase/telemetry.json.tmp`.** The Supabase CLI aborts
  on a telemetry write outside the Bash sandbox's write allowlist, *before* it
  touches a migration. Re-run outside the sandbox it finishes green (below).
  An environment artifact, not a migration failure, and recorded the same way
  in r10–r13.
- **Two committed objects already sit in `compliance-documents`**
  (`b0000000-…-0001/…/coi-test.pdf`, `…/certificate.png`) from an earlier e2e
  run. Test residue on the shared local stack, not a product fact.

---

## 5. Gates

```
supabase db reset (run from supabase/, outside the Bash sandbox)
  → Finished supabase db reset on branch main.
    {"target":"local","version":"","message":"Reset local database."}

psql -v ON_ERROR_STOP=1
  exit=0 supabase/tests/people/w1a_identity_channels_consent_test.sql
  exit=0 supabase/tests/people/w1b_compliance_authority_directory_test.sql
  exit=0 supabase/tests/people/w3_merge_sweep_household_test.sql
  exit=0 supabase/tests/people/w4_channels_touches_paperwork_test.sql
  exit=0 supabase/tests/people/w4_invoice_link_freeze_order_test.sql
  exit=0 supabase/tests/billing/invoice_links_test.sql
  exit=0 supabase/tests/notifications/00591_notification_log_ref_rls_test.sql

deno test --allow-all --no-check --config supabase/functions/deno.json \
  supabase/functions/_shared/ supabase/functions/paperwork-upload/ \
  supabase/functions/resend-webhook/ \
  supabase/functions/_tests/paperwork-upload.test.ts \
  supabase/functions/_tests/email-channel-status.test.ts
  → ok | 511 passed | 0 failed (2s)

deno.lock at the worktree root: absent
migration ledger tail: 00636, 00637, 00638, 20260910152111_create_contact_messages.sql
```

### r14 probe

`artifacts/people-room-crm-2026-09-11/build/probe714-w4-r14-door-and-pay.sql`
(output alongside as `.out`), run inside `BEGIN … ROLLBACK`:

```
Q1 pass: live resolves; bogus/truncated/uppercased/expired/revoked all refuse
         (write refused: paperwork_token_invalid)
Q2 pass: inbound INSERTs alongside; verified original untouched
Q3 pass: storage context is the token's own org/company
         (fc000000-…-000b/fc200000-…-000b)
Q4 pass: each studio sees only its own folder; anon sees none
Q4b:     CONFIRMED 22P02 — a non-uuid first segment blinds the whole bucket scan
Q5 pass: hashed lookup live, plaintext dead, expiry closes both readers
Q6 pass: org resolved server-side, unknown subject writes nothing
Q7 pass: members read their own touches, never write
Q8 pass: stranger id dropped, both same-named seats kept
         (names={"Same Name","Same Name"}, refs={…000b,…000c})
Q9 pass: cross-tenant notice refused
Q10a pass: cross-tenant confirm refused
Q10b pass: cross-tenant reject refused
Q11 pass: every W4 definer RPC is closed to anon and PUBLIC
Q12 pass: every W4 SECURITY DEFINER pins search_path
ROLLBACK
```

Twelve of twelve pass. Q4b is the deliberate negative: it proves MIN-5 is a
real failure mode and confirms it is unreachable by any shipped writer.
