# W4 — Adversarial migration + edge review, round 7

Reviewer: separate context. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Scope: `00635_studio_touches_and_channel_refs.sql`, `00636_invoice_link_hardening.sql`, `00637_paperwork_upload_door.sql`, `00638_pay_link_readers_reheaded.sql`; `supabase/functions/paperwork-upload/*`, `_shared/send-email.ts`, `_shared/invoice-links.ts`, `_shared/sms.ts`, `_shared/invoice-checkout-driver*.ts`, `sms-inbound/pipeline.ts`, `packages/notifications/src/{tokens,unsubscribe}.ts`, `packages/supabase/src/hooks/use-invoices.ts`, the folio, `apps/client-portal/src/app/pay/return/[nonce]/route.ts`, Patina Field `SupabasePeopleRoomService.swift`.
Read in full: `w4-data-edge-report.md`, `upload-door-spec.md` §5–§9, `w4-fix-log-r6.md`, `rulings.md` §3.

**Verdict: NOT CLEAN — 1 blocking, 5 major, 9 minor.**

The r6 fix log states plainly: *"`R-BT`, `R-BU` and `R-BV` are NOT in this pass — no finding assigned here names them."* All three are round-6 rulings in `rulings.md` §3 and all three are still unimplemented in the code on the branch. They are therefore live findings, not settled matter.

---

## 1. Gates (all run this round, pasted)

### 1.1 Reset

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
...
Applying migration 00635_studio_touches_and_channel_refs.sql...
Applying migration 00636_invoice_link_hardening.sql...
Applying migration 00637_paperwork_upload_door.sql...
Applying migration 00638_pay_link_readers_reheaded.sql...
Seeding data from supabase/seed/...
Finished supabase db reset on branch main.
EXIT=0
```

(First three attempts died inside the sandbox on `~/.supabase/telemetry.json.tmp` EPERM and then on the docker socket; re-run with the sandbox disabled for that one command. Not a product finding.)

### 1.2 SQL suites — `psql -v ON_ERROR_STOP=1`

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w4_channels_touches_paperwork_test.sql
NOTICE:  block 1 ok — notification_log ref_type accepts studio_contact_channel
NOTICE:  block 2 ok — studio_touches CHECKs bite
NOTICE:  block 3 ok — record_touch resolves the org server-side
NOTICE:  block 4 ok — record_touch returns NULL when unattributable
NOTICE:  block 5 ok — record_notice gated on membership
NOTICE:  block 6 ok — paperwork token hash + company pin
NOTICE:  block 7 ok — resolve_paperwork_link refuses expired / revoked
NOTICE:  block 8 ok — record_inbound_compliance_document never overwrites
NOTICE:  block 9 ok — confirm/reject legs
NOTICE:  block 10 ok — storage policy scoped to the member's org
NOTICE:  block 10b ok — rate limiter
NOTICE:  W4 SQL suite: all blocks passed
EXIT=0

$ psql ... -v ON_ERROR_STOP=1 -f supabase/tests/people/w4_invoice_link_freeze_order_test.sql
NOTICE:  block 1 ok — widen-before-empty: pre-existing plaintext token survives the hash write
NOTICE:  block 2 ok — negative control: freeze CHECK refuses a token rewrite
EXIT=0

$ psql ... -v ON_ERROR_STOP=1 -f supabase/tests/billing/invoice_links_test.sql
EXIT=0

$ psql ... -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
NOTICE:  All W1b assertions passed.
EXIT=0
```

### 1.3 Deno

```
$ deno test --no-check --allow-all \
    --config /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/supabase/functions/deno.json \
    supabase/functions/paperwork-upload supabase/functions/email-channel-status \
    supabase/functions/sms-inbound supabase/functions/_shared/__tests__/invoice-links.test.ts \
    supabase/functions/_shared/__tests__/send-email.test.ts \
    supabase/functions/_shared/__tests__/sms.test.ts supabase/functions/resend-webhook
...
ok | 200 passed | 0 failed (446ms)
```

No `deno.lock` exists anywhere under `supabase/functions` (checked with `find`), so nothing to delete.

### 1.4 Grants regeneration + types

```
$ python3 scripts/generate-legacy-grants.py
GRANTS IN SYNC — supabase/seed/00-legacy-grants.sql matches the live database.
```

`db:generate` is **broken in this worktree** (minor M-9 below): the package script is
`supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/database.types.ts`, and with
`SUPABASE_DB_URL` unset it exits 1 *after* the shell has already truncated
`packages/supabase/src/database.types.ts` to 0 bytes. Restored with `git checkout --`, then
regenerated safely to a temp file with an explicit `--db-url`: **zero diff** against the
committed 38,838-line file. Types are correct; the script is a landmine.

Worktree `git status` is clean apart from the report files under `artifacts/.../build`.

---

## 2. Prior-round findings — re-check

| Round-6 item | Status now | Evidence |
|---|---|---|
| R-BX (widen-before-empty ordering in the `invoice_links` backfill) | **FIXED** | 00636:160-170 writes `token_hash` from the plaintext before the column is emptied; `w4_invoice_link_freeze_order_test.sql` block 1 proves a pre-existing token survives, block 2 is the negative control. |
| R-BY (`/pay` letter fallback + mid-checkout refusals) | **FIXED** | `_shared/invoice-links.ts` `letterFallbackUrl()` → `${base}/?invoice=<id>`; `invoice-reminders` `heldMidPayment`; `invoice-send` returns `409 checkout_in_flight` / `503 checkout_attempt_check_failed`; `expire_stale_invoice_checkout_attempts` gained the 10-day `processing` backstop. |
| R-BW / M-1 (three sentences on the folio link card) | **FIXED** | `invoice-folio.tsx:817` carries all three; the "shown once" sentence at :742. |
| **R-BT** (a cancelled Checkout return must not rotate the link; a spent nonce must not re-rotate) | **OPEN** | See BLOCKING-1 and MAJOR-1. |
| **R-BU** (the firm page and the studio's compliance reader must not disagree) | **OPEN** | See MAJOR-2. |
| **R-BV** (stop invalidating `['invoice-link', id]` on every invoice effect; un-mock the folio test) | **OPEN** | See MAJOR-3. |
| W4 r2 MAJOR-3 (`letterbox.tsx` reading `useInvoiceLink`) | **FIXED** | The component is repointed; the wave report §4/§9 still says otherwise — minor M-2. |

---

## 3. Findings

### BLOCKING-1 — a **cancelled** Stripe Checkout return rotates the pay link and kills the emailed `/pay/<token>` (R-BT)
Confidence: **high** (proved against the live DB).
Files: `supabase/functions/_shared/invoice-checkout-driver-core.ts` (`invoiceCheckoutReturnBase`), `supabase/migrations/00636_invoice_link_hardening.sql` (`resolve_invoice_return_nonce`), `apps/client-portal/src/app/pay/return/[nonce]/route.ts`.

`invoiceCheckoutReturnBase(attempt, target, checkout)` returns `invoiceLinkReturnAddress(origin, nonce, checkout)` for **both** `'success'` and `'cancelled'`, so Stripe's `cancel_url` is the same `/pay/return/<nonce>` hop as `success_url`. `resolve_invoice_return_nonce` in 00636 rotates the invoice link **unconditionally** on every resolution — it does not look at the attempt's outcome. The route calls it on every GET.

Net effect: a client who opens the emailed link, reaches Stripe, and presses **Back / cancel** lands on the return hop, the link rotates, and the token in their inbox is dead. They have no live way back to the invoice they were just about to pay.

Rolled-back probe (transaction, `ROLLBACK`):
```
emailed token resolves before? t
after CANCEL return hop: emailed token still resolves? f
```

R-BT is the ruling that says exactly this must not happen. Fix: gate the rotation on the attempt's terminal state — rotate on `success` only, and send `cancel_url` straight back to `/pay/<token>` (or to the return hop with a `cancelled` marker that resolves without rotating).

---

### MAJOR-1 — a spent return nonce rotates the link again on every replay (R-BT, second leg)
Confidence: **high**.
File: `supabase/migrations/00636_invoice_link_hardening.sql` — `resolve_invoice_return_nonce`.

The function has no "already consumed" branch: a nonce row that has been resolved once resolves again, and each resolution mints a fresh token. A browser back-button, a prefetch, a link-scanner in the client's mail client, or a double-tap therefore rotates the link a second and third time. Combined with BLOCKING-1 this means one accidental re-request is enough to invalidate a token that had just been re-issued. R-BT asks for single-use nonces. Fix: stamp `consumed_at` and return the already-bound target without rotating when it is set.

---

### MAJOR-2 — the firm's own paperwork page says **current** where the studio's reader says **not on file** (R-BU)
Confidence: **high** (proved).
File: `supabase/migrations/00637_paperwork_upload_door.sql` — `resolve_paperwork_link` vs. the re-headed `compliance_state`.

`compliance_state` was re-headed in 00637 to exclude rejected rows **and** unverified inbound rows. `resolve_paperwork_link` computes each row's `state` from `expires_on`/`blocks` alone and carries the "is it checked yet" fact in a *separate* `awaiting_check` boolean. An inbound document that has been uploaded but not yet confirmed therefore reads `state = 'current'` on the firm's page while the studio side reads `not_on_file`.

Probe:
```
FIRM PAGE:  [{"doc_type": "coi", "state": "current", "expires_on": "2027-01-31", "awaiting_check": true}]
STUDIO compliance_state = not_on_file
```

R-BU is the ruling that the two faces must agree. This is the classic "a reader disagreeing with the record" major. Fix: fold `awaiting_check` into the state the firm sees — an unconfirmed upload should read as *received, not yet checked*, never as `current`.

---

### MAJOR-3 — `invalidateInvoiceEffects` still nukes the invoice-link cache, and the folio test still mocks it away (R-BV)
Confidence: **high**.
Files: `packages/supabase/src/hooks/use-invoices.ts:386-411` (line **393**), `apps/designer-portal/src/components/document/accounts/__tests__/invoice-folio.test.tsx`.

```ts
// use-invoices.ts:393
queryClient.invalidateQueries({ queryKey: ['invoice-link', invoiceId] });
```

R-BV rules this line out: `get_invoice_link` now always returns `token: NULL`, so any invalidation refetches a tokenless row and wipes the one-time token that `useRegenerateInvoiceLink` had just written with `setQueryData(['invoice-link', invoiceId], link)` (:1449). Four callers pass `invoiceId` into `invalidateInvoiceEffects` — `useIssueInvoice`, `useRecordPayment`, `useSendInvoice`, `useVoidInvoice` — so recording a payment or sending the invoice while the folio is open blanks the just-minted link out from under the designer, and the folio's `clientInvoiceUrl` (derived from `invoiceLink?.token`, cache only, no component state) goes empty. R-BV's second clause — un-mock `@patina/supabase` in the folio test so this is actually covered — is also unmet: the test still carries `jest.mock('@patina/supabase', ...)` with `useInvoiceLink: () => ({ data: mockInvoiceLink })`, which cannot observe the invalidation at all.

---

### MAJOR-4 — a paid invoice's receipt link goes silent 30 days after the migration
Confidence: **high** (proved).
File: `supabase/migrations/00636_invoice_link_hardening.sql` — the backfill and `resolve_invoice_link`.

The backfill stamps `expires_at = <migration time> + 30 days` for every *active* link, including links on invoices that are already **paid**. `resolve_invoice_link` then refuses them. The paid-invoice receipt view is reached through the same `/pay/<token>` address, so on day 31 every client who tries to re-open the receipt they were emailed gets a dead link, with nothing on the invoice to re-mint from (`ensure_invoice_link` is service-role only and the studio-side regenerate is a designer act).

Probe:
```
paid invoice, link 31 days old -> NULL (DeadLink)
```

This is not a token-security matter — the invoice is settled and the document is the client's own receipt. Either exempt paid invoices from the expiry test in `resolve_invoice_link` (serve the receipt view, refuse the checkout view), or do not stamp an expiry on links whose invoice is already `paid`.

Note the ordering interaction: `resolve_invoice_link` tests expiry **below** the `v_dead` branch, so a revoked link still reports revoked rather than expired. That part is right; it is only the paid case that is wrong.

---

### MAJOR-5 — `sms-inbound` authority check omits `draw_certify`, so a certify-scoped reply is filed as unauthorised (CRM-22)
Confidence: **medium-high**.
File: `supabase/functions/sms-inbound/pipeline.ts` — `AUTHORITY_SCOPES`.

```ts
const AUTHORITY_SCOPES = {
  money: ["money", "change_order"],
  selection: ["selections"],
  schedule: ["schedule"],
  site_access: ["site_access", "key"],
};
```

`draw_certify` is a real authority value in the W1b authority model and is the one that matters for the draw rail W4 itself touches (`issue_agreement_draw_invoice`). A party holding `draw_certify` who texts back a money-class approval falls through `authorityVerdictFor` as *not authorised*: the decision is filed with the wrong verdict and the studio sees "no authority on file" for someone who has it. CRM-22 asks the inbound authority check to match the authority record. Fix: add `draw_certify` to the `money` scope list (or give it its own class if the panel deck means it to stand alone).

---

### MINOR-1 — `studio_compliance_documents` still carries full member write policies + table grants, so `confirm_inbound_document` / `reject_inbound_document` are not the only doors
Confidence: high. Pre-existing from 00623; W4 adds the reject columns onto it.

```
studio_compliance_documents_member_insert  INSERT  {authenticated}  WITH CHECK is_active_studio_member(organization_id)
studio_compliance_documents_member_update  UPDATE  {authenticated}  USING/CHECK is_active_studio_member(organization_id)
studio_compliance_documents_member_delete  DELETE  {authenticated}  USING is_active_studio_member(organization_id)
authenticated | DELETE / INSERT / SELECT / UPDATE
```

`assert_compliance_holder_trg` fires on `holder_id, holder_type, organization_id, superseded_by, doc_type, expires_on, blocks` — **not** on `verified_at` / `rejected_at`. A studio member can therefore stamp `verified_at` through PostgREST without R-AZ's four pre-checks, and can `DELETE` an inbound or rejected row, against §7's "no document row is ever deleted by this door" and the reject trail's retention promise. Everything stays inside the member's own org (`is_active_studio_member(organization_id)` on every policy), so this is not a tenancy hole and not a gate-holder — but the guarantees §7 states are enforced by convention, not by the database.

### MINOR-2 — report §4 and §9 say `letterbox.tsx` "still reads `get_invoice_link`"
Stale. The component was repointed in W4 r2 (MAJOR-3 of that round) and no longer calls the hook. Accuracy of the wave's own report file.

### MINOR-3 — report §9 says `flushDeferredMessages` does not write a touch
It does. `_shared/sms.ts` writes an out touch in `flushDeferredMessages` as well as in `sendPartySms`. The owed/not-done list is wrong in the safe direction, but wrong.

### MINOR-4 — report §8's W7 redeploy set (37 functions) is over-inclusive by one
The computed `_shared` fan-out is 34 importers (`grep -rl "_shared/<file>" supabase/functions --include=index.ts` across every edited `_shared` file, de-duplicated). The report lists 37: the extra `paperwork-upload` and `resend-webhook` changed in their own right and belong on the list; `apns-send` imports none of the edited `_shared` files. Redeploying it is harmless, but the list should say why each name is on it.

Enumerated importers of the edited `_shared` files (the set that must redeploy in W7):
`send-email.ts` → 26 functions; `sms.ts` → 7; `invoice-links.ts` → 5; `invoice-checkout-driver.ts` / `-core.ts` → 3; union after de-dup = 34, plus `paperwork-upload` (new) and `resend-webhook` (edited) = 36.

### MINOR-5 — report §5 says "ledger head 00637"
The head is **00638** (`00638_pay_link_readers_reheaded.sql`, 697 lines, on the branch and applied by the reset above).

### MINOR-6 — report §6 lists two changed test files
Three changed: `supabase/tests/people/w4_channels_touches_paperwork_test.sql`, `supabase/tests/people/w4_invoice_link_freeze_order_test.sql` (added in r6 for R-BX) and the deno `_shared/__tests__/sms.test.ts` additions.

### MINOR-7 — `paperwork_link_rate_limit_hit(inet, int)` takes an `inet` the edge function never has a trustworthy value for
`paperwork-upload` passes the `x-forwarded-for` head. That is attacker-controlled, so the limiter is per-claimed-address, not per-caller. It still caps a naive flood and the token gate is the real control, so this does not hold the gate — but the comment in 00637 describing it as a rate limit "per caller" overstates what it does.

### MINOR-8 — `record_touch` returns NULL rather than raising when the org cannot be resolved
Correct by design (E13 says a touch must never fail a send), and the SQL suite covers it — but nothing counts the NULLs, so a systematic attribution failure would be silent. A `job_runs` counter or a `NOTICE` would make it visible. Naming/observability only.

### MINOR-9 — `pnpm db:generate` truncates `packages/supabase/src/database.types.ts` to 0 bytes when `SUPABASE_DB_URL` is unset
The script redirects before it fails, so the failure destroys the committed file. Hit in this review and repaired with `git checkout --`. Not W4's doing, but W4 is the wave whose gate list names `db:generate`, so the gate as written is unsafe to run. Write to a temp file and move on success.

---

## 4. What was checked and found sound

- **Token verification before any read.** `paperwork-upload/core.ts` reads the raw body, validates the token's shape, and every DB read goes through `paperwork_link_storage_context` / `record_inbound_compliance_document`, both of which match on `sha256(token)` hex. No plaintext comparison, no read before the hash.
- **Expired / revoked refuse.** `resolve_paperwork_link` and the write path both test `expires_at` and `revoked_at`. SQL block 7.
- **Uploads never overwrite a verified row.** `record_inbound_compliance_document` always `INSERT`s; storage upload uses `upsert: false` and a `crypto.randomUUID()` segment in the key. SQL block 8.
- **Storage policy scoped to the token's company path.** `compliance_documents_member_read` uses `public.is_active_studio_member(NULLIF((storage.foldername(name))[1], '')::uuid)`; the key is `${org}/${company}/${uuid}/${filename}`, so segment 1 is always a real uuid — the uuid-cast trap (`22P02`) is avoided, and the `NULLIF` covers the empty-prefix case. No other storage policy on the instance is bucket-agnostic, so the new private bucket leaks nothing.
- **Recipients per R-AC.** `record_inbound_compliance_document` notifies owners + admins + the minter, de-duplicated.
- **The email rail refuses dead/unsubscribed channels in every branch.** `resolveContactChannel` now runs on *every* send (`send-email.ts:438`), not just the account-less branch, and `channelRefusesSend` covers `dead` and `unsubscribed`. `recordChannel = options.userId ? undefined : channel` keeps CRM-12's log shape.
- **Unsubscribe tokens cannot cross subjects.** `parseUnsubscribeSubject` splits on the `channel:` prefix; a profile-id subject cannot address a channel row and vice-versa; `applyChannelUnsubscribe` is bounded by `.in('status', ['active','bounced'])` and reports `scope: 'address'`.
- **Touches on every send/receive path.** `sendCompliantEmail` writes one on `delivered` with a `studioRow`; `sms.ts` writes on both `sendPartySms` and `flushDeferredMessages`; `sms-inbound` writes `recordInboundTouch` / `recordConsentTouches` across all 12 call sites.
- **`record_notice` matches Patina Field.** `RecordNoticeParams(p_project_id, p_what, p_told)` and `NoticeRow(id, what, recorded_at, recorded_by, told_names)` in `PeopleRoomWire.swift` line up exactly with the RPC's argument list and `RETURNS TABLE`, and the Swift call uses `.single()` against a one-row return.
- **The `invoice_links` backfill keeps emailed `/pay` links working.** Hash written before the plaintext is nulled (R-BX order); every 00574-era token is 64-hex so `token_hash` is never NULL at `SET NOT NULL`; old plaintext lookups fail closed (`get_invoice_link` returns `token: NULL` and no live reader queries the plaintext column); hashed lookups resolve. Proved by `w4_invoice_link_freeze_order_test.sql` and by grepping every caller.
- **Tenant resolution (R-BD).** Every new function resolves the org through `project_tenant_org()` / `studio_contact_org()` server-side; none takes an org from the caller.
- **R-AM.** No edge code calls `_primary_studio_for`; `paperwork-upload` builds its service client only after the token check.
- **Consent stays record-only (R-AY).** Nothing in 00635/00637 writes a consent decision.
- **Migration hygiene.** 00635–00638 are hand-numbered above the branch head and clear of the reserved 00595–00620 band; each carries a banner + lineage; each is idempotent on re-run (the reset replays clean); RLS lives in the same file as its table; grants are explicit with `REVOKE ... FROM PUBLIC`; no `anon` execute on any definer RPC (see the grants matrix — every new definer function is `anon = f`); every `SECURITY DEFINER` pins `search_path`; extension functions are schema-qualified; CHECK constraints rather than enums; money in cents; `00-legacy-grants.sql` regenerated and in sync.

---

## 5. Gate call

`clean = false`. One blocking (BLOCKING-1) and five majors (MAJOR-1 … MAJOR-5). The nine minors are reported per the brief and do not hold the gate.
