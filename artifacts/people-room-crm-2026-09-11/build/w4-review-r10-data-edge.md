# W4 — adversarial migration + edge review, round 10

Reviewer: separate context (never the implementer). Scope: data + edge only.
Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (reset for this round; W1–W3 and W5 committed).
Read in full: `build/w4-data-edge-report.md`, `build/w4-fix-log-r9.md`, `build/w4-review-r9-data-edge.md`,
`build/upload-door-spec.md` §5–§10, migrations 00635–00638, and every RPC and edge function they name.
Settled and not findings: every ruling in `rulings.md` §3 (R-A … R-BY).

## Verdict

**NOT clean — 1 blocking, 2 major, 14 minor.**

The r9 BLOCKING-1 fix (24-hour post-finalize guard in `ensure_invoice_link`) is **only half applied**: it
covers link-borne checkout attempts and leaves the signed-in payer rail exactly as it was. A receipt letter
sent after a payer's own checkout still rotates the emailed `/pay/<token>` address and kills the return
nonce; the guest lands on `/pay/dead`, then on `/pay/used` with a sentence that is not true. Proven live on
the reset DB, both orderings. Separately the same guard, where it *does* bite, is not honoured by the two
letter rails, so an account-less payer can be mailed a signed-in-only address; and the anonymous paperwork
door's rate-limit bucket is disabled by one malformed `x-forwarded-for` header.

---

## 1. Prior findings (r9) — fixed / open

| r9 id | Claim | Status now |
|---|---|---|
| BLOCKING-1 | A receipt/failure letter sent while a checkout is in flight rotates the link the payer is holding; the return nonce then resolves to nothing and `/pay/return/<nonce>` is dead | **PARTIALLY FIXED — still open as r10 BLOCKING-1.** `ensure_invoice_link` now refuses for 24h after a finalized attempt, but only `WHERE invoice_link_id IS NOT NULL`. The signed-in payer rail claims with `payer_id` (and, by `chk_invoice_attempt_actor`, `invoice_link_id IS NULL`), so the new leg never fires for it, while `create-checkout-session` still sets `nonceReturnOrigin` whenever `hasLiveInvoiceLink` is true. Reproduced live in both orderings — §2. |
| MAJOR-1 | `confirm_inbound_document` supersedes the wrong `other_named` paper: an unlabelled group key retires a different document type | **FIXED — verified live.** `resolve_paperwork_link`, `record_inbound_compliance_document` and `confirm_inbound_document` all key `other_named` on `'other_named:' || lower(btrim(doc_label))`. Probe: confirming an inbound *Safety plan* for a firm that also holds a *Resale certificate* leaves the certificate `verified_at IS NOT NULL, retired_at IS NULL`. |
| W4R9-1 | Notice-log checkbox (portal face) | Out of data+edge scope; the RPC side (`record_notice`) is correct and matches the Patina Field wire — §5. |
| M-1 | Refused-paper receipt wording (portal face) | Out of data+edge scope. `reject_inbound_document` writes the reason and enqueues exactly one `awaiting_review` agent task; the RPC side is sound. |

Ten r9 minors were re-checked; **m-1 … m-10 are all still open** and are restated in §6 with their current
evidence, together with four new minors.

---

## 2. BLOCKING-1 — the payer rail still rotates the link under the client's feet (confidence: high, proven live)

**Severity: blocking** (a `/pay` link broken, and a letter carrying an address that is dead on arrival).

`00636_invoice_link_hardening.sql`, `ensure_invoice_link`:

```sql
IF EXISTS (
  SELECT 1 FROM invoice_checkout_attempts
  WHERE invoice_id = p_invoice_id
    AND (
      state IN ('claimed','session_created','processing')
      OR (
        invoice_link_id IS NOT NULL                -- <== the whole post-finalize leg
        AND state IN ('succeeded','failed','requires_refund')
        AND COALESCE(finalized_at, updated_at, created_at)
              > now() - interval '24 hours'
      )
    )
) THEN
  RETURN NULL;
END IF;
```

The 24-hour leg is gated on `invoice_link_id IS NOT NULL`. But `00636` also carries

```sql
CONSTRAINT chk_invoice_attempt_actor CHECK ((payer_id IS NOT NULL) <> (invoice_link_id IS NOT NULL))
```

so an attempt is *either* link-borne *or* payer-borne, never both. `create-checkout-session/index.ts` claims
with `actor: { kind: 'payer', payerId: caller.id, … }` — that row has `invoice_link_id IS NULL` — and then
still hands Stripe a return that depends on the link:

```ts
const linkIsLive = await hasLiveInvoiceLink(admin, invoiceId);
…
nonceReturnOrigin: linkIsLive ? CLIENT_PORTAL_URL : null,
```

So for every payer-borne attempt: the in-flight three-state leg holds only while the attempt is
`claimed|session_created|processing`; the moment the Stripe webhook writes `succeeded`, `ensure_invoice_link`
is free again, and the very next letter (`stripe-webhook`'s own receipt, an `invoice-send`, a reminder)
mints a new token and revokes the one the client is holding — the exact failure r9 raised.

### Probe (reset DB, rolled back)

Two orderings, both with a payer-borne attempt and a live link:

*(a) webhook first — the receipt letter runs before the browser returns*

```
receipt_letter_rotated_the_link | t
payers_link_status              | revoked
resolve_invoice_return_nonce    | (null)
```

`/pay/return/<nonce>` → `apps/client-portal/src/app/pay/return/[nonce]/route.ts` 303s to `/pay/dead`. The
nonce is already consumed by that resolve, so the client's retry (back button, prefetch, scanner) lands on
`/pay/used` — "this link was already used" — which is false: it was never used, it was revoked.

*(b) browser first — the client returns, then the receipt ships*

```
payer_got_an_address       | t
page_opens_now             | t
receipt_letter_rotated_again | t
page_still_opens_after     | f
```

*(control — the same scenario with a link-borne attempt, where the fix does bite)*

```
guard_held_letter_fell_back | t
link_status_after           | active
return_state                | rotated
```

The control proves the guard works; the two payer rows prove it is not reached on the rail that actually
carries a signed-in client through Stripe.

**Why this is blocking, not major:** R-BT is explicit that "a return nonce rotates at most once: a repeat
GET of a spent nonce … lands on a readable page … never a dead page", and R-BY is explicit that "a letter
never carries a dead address". Both are violated on the payer rail.

**Fix shape (not prescriptive):** drop `invoice_link_id IS NOT NULL` from the post-finalize leg — the leg
already restricts to finalized states and a 24-hour window, and a payer-borne attempt is exactly as much
reason to hold the address as a link-borne one. If the intent was to avoid holding the address for a payer
who never held a `/pay` link, gate on `nonce_return_origin`/`return_nonce` presence instead of on the actor
column, because that is the fact that decides whether a live link is load-bearing for this attempt.

---

## 3. MAJOR-1 — the letter rails do not honour the new 24-hour leg (confidence: high)

**Severity: major** (a reader disagreeing with the record; an account-less payer sent to a signed-in door).

`invoice-send/index.ts` holds with 409 `checkout_in_flight` only for

```ts
['claimed','session_created','processing']
```

and `invoice-reminders/index.ts` builds `heldInvoiceIds` from exactly the same three states. Neither knows
about the fourth leg 00636 added. So inside 24 hours of a link-borne `failed` or `requires_refund` attempt —
a declined card, the ordinary case — the rail does *not* hold: it proceeds, `ensure_invoice_link` answers
NULL under its own new guard, and `letterPortalUrl` falls back to

```ts
letterFallbackUrl(baseUrl, invoiceId)  // `${baseUrl}/?invoice=<id>`
```

which is the signed-in client-portal door. The population the `/pay/<token>` rail exists for is precisely
the payer with no account; they get a door they cannot open, on the "your payment failed, try again" letter.

This also makes a sentence in the wave's own report false. `w4-data-edge-report.md` §4:

> "The letters do not take the fallback address while the guard stands: they hold (invoice-reminders, invoice-send)."

They hold for three of the four legs of the guard, not for the guard. R-BY's second clause ("the reminder
holds rather than ships … skip an invoice with a live attempt in those three states") was written when the
guard had three legs; adding a fourth leg to the guard without adding it to the two rails is the defect.

**Fix shape:** make one function the single source of "is `ensure_invoice_link` going to refuse for this
invoice" and have both rails ask it, rather than re-listing states in TypeScript in two places.

---

## 4. MAJOR-2 — one malformed header disables the paperwork door's rate limit (confidence: high, proven live)

**Severity: major** (the anonymous door's only abuse control is switchable off by the caller).

`paperwork-upload/core.ts`:

```ts
export async function withinRateLimit(deps: …): Promise<boolean> {
  if (!deps.ip) return true;
  const { data, error } = await deps.supabase.rpc('paperwork_link_rate_limit_hit', {
    p_ip: deps.ip, p_limit: …,
  });
  if (error) return true;      // <== fail-open
  return data === true;
}
```

`paperwork_link_rate_limit_hit(p_ip inet, p_limit integer)` takes `inet`. `callerIp()` reads
`cf-connecting-ip` and then `x-forwarded-for` — both attacker-controlled on a `verify_jwt=false` door — and
passes the string through unvalidated. Live:

```
select paperwork_link_rate_limit_hit('not-an-ip', 20);
ERROR:  22P02: invalid input syntax for type inet: "not-an-ip"

select paperwork_link_rate_limit_hit('1.2.3.4:5678', 20);
ERROR:  22P02: invalid input syntax for type inet: "1.2.3.4:5678"
```

PostgREST returns that as an error, `withinRateLimit` swallows it and returns `true`, and upload-door-spec
§2's bucket ("no more than N attempts per IP per window") is gone for any caller who sends
`x-forwarded-for: nope`. Note `1.2.3.4:5678` is not even adversarial — an `ip:port` forwarded-for value is
what some proxies emit, so this also fires by accident.

Compounded by minor m-6 below: a caller with *no* forwardable header is already unbucketed
(`if (!deps.ip) return true`), so between the two there is no configuration in which a determined caller is
bucketed.

This is major and not blocking because nothing is read or written without the token (see §5); the harm is
unbounded brute-force attempts against the token space and unbounded storage writes by a holder of one
valid token, not a bypass of verification.

**Fix shape:** validate the header against a v4/v6 shape in `callerIp()` before use (drop the port, reject
anything else), and treat an RPC error as a refusal rather than a pass, or at minimum distinguish 22P02 (bad
input — refuse) from a transport error (fail open, deliberately).

---

## 5. Verified sound (the brief's specific checks)

Each of these was read in full and, where a DB fact, probed on the reset database.

| Check | Result |
|---|---|
| Token verified before any read | **Sound.** `handlePaperwork` reads the raw body first, `getPaperworkContext`/`uploadPaperwork` call `resolve_paperwork_link(p_token)` before touching any row; the RPC compares `encode(digest(p_token,'sha256'),'hex')` against `token_hash` — the plaintext is never stored and no branch reads a document before the compare succeeds. |
| Expired / revoked refuse | **Sound.** `resolve_paperwork_link` returns no context when `revoked_at IS NOT NULL` or `expires_at <= now()`; both produce the same refusal shape, so the door does not distinguish "wrong token" from "expired token" to the caller. |
| Uploads never overwrite a verified row | **Sound.** `record_inbound_compliance_document` **always INSERTs** a new `studio_compliance_documents` row (`inbound = true`, `verified_at IS NULL`); there is no UPDATE path from the anonymous door. Storage writes use `upsert: false` under a per-upload uuid prefix, so two uploads cannot collide either. R-BU's reading (verified row wins, `awaiting_check` is a flag) holds. |
| Storage policies allow only the token's company path | **Sound.** The `compliance-documents` bucket is private (`public = false`, 15 MB, `{application/pdf,image/jpeg,image/png}`), carries exactly one policy — a SELECT for `is_active_studio_member(NULLIF((storage.foldername(name))[1],'')::uuid)` — and **no** INSERT/UPDATE/DELETE policy and no `anon` grant. The anonymous door writes through the service client only, at a key derived server-side from `paperwork_link_storage_context(p_token)`, never from caller input. |
| The key scheme avoids the uuid-cast trap | **Sound for writes.** The key is `{org_uuid}/{company_uuid}/{upload_uuid}/{filename}` — segment 1 is always a uuid the RPC produced, so the policy's `::uuid` cast cannot see a non-uuid on any path this wave writes. (The cast itself is still unguarded for *pre-existing* keys — minor m-7.) |
| Recipients per R-AC | **Sound.** `record_inbound_compliance_document` notifies owners ∪ admins of the studio, plus the minting member when they are neither, deduplicated. No new role. |
| Email rail refuses dead/unsubscribed in every branch | **Sound.** `channelRefusesSend` (`dead`/`unsubscribed`) runs for **all** callers of `prepareCompliantEmail`, including the `userId`-bearing rails, before any Resend call; `prepareCompliantEmail` is the only prepared-send door and `proposal-send` is its only direct caller. `resolveContactChannel` reduces worst-status across studios and normalizes values lowercase. `resend-webhook`'s `applyChannelStatus` is worst-first and never walks a status back, and writes on the no-log-row path, on bounce and on complaint. |
| Unsubscribe tokens cannot cross subjects | **Sound.** `parseUnsubscribeSubject` requires the literal `channel:` prefix and rejects everything else; `applyChannelUnsubscribe` updates by `value` for kinds `email`/`ap_email` only, and only from `['active','bounced']` — so a forged or replayed token cannot move a `dead` row, cannot touch an SMS channel, and cannot reach a different subject class. |
| Touches insert on every send/receive path; `authority_check` matches CRM-22 | **Sound.** `record_touch` is written from `_shared/send-email.ts` (one per delivered letter with a studio row), `_shared/sms.ts:991` (`sendPartySms`), `_shared/sms.ts:1225` (`flushDeferredMessages`, actor `sms-dispatch-flush`), and `sms-inbound/pipeline.ts` (`recordInboundTouch`, `recordConsentTouches`). `authorityVerdictFor`/`AUTHORITY_SCOPES` match CRM-22 including `draw_certify` in the money scope, and a court mismatch files `failed_unknown_sender` rather than acting. |
| `record_notice` matches the Patina Field signature | **Sound.** `record_notice(p_project_id uuid, p_what text, p_told uuid[])` returning `(id, what, recorded_at, recorded_by, told_names)` is exactly `RecordNoticeParams`/`NoticeRow` in `apps/mobile/Capture/Capture/Features/People/PeopleRoomWire.swift` + `SupabasePeopleRoomService.swift`. |
| `invoice_links` backfill keeps every `/pay` link working | **Sound as a backfill.** The plaintext lookup fails closed (`token` is NULL for every row and frozen by `chk_invoice_links_token_frozen CHECK (token IS NULL)`); the hashed lookup works; `resolve_invoice_link` tests expiry **below** `v_dead` with `paid` exempt, so a paid folio still reads. The 00636 §2 ordering is correct per R-BX — `ALTER COLUMN token DROP NOT NULL` and `DROP CONSTRAINT chk_invoice_links_token` both precede the `UPDATE … SET token = NULL`, and `supabase/tests/people/w4_invoice_link_freeze_order_test.sql` replays the statements in order on a shape-identical probe table and passes. **What breaks a live `/pay` link is BLOCKING-1, not the backfill.** |
| `_primary_studio_for` never called from edge (R-AM) | **Sound** — no occurrence anywhere under `supabase/functions`. |
| `project_tenant_org()` for every tenant resolution (R-BD) | **Sound.** `record_touch` resolves org via `project_tenant_org()` for engagement/project refs and `studio_contact_org()` for person/company refs, server-side, and **writes nothing** when the org cannot be resolved rather than writing an unattributed row. |
| Consent record-only (R-AY) | **Sound** — nothing in 00635–00638 or the touched edge code reads or writes the frozen `project_parties.sms_consent_*` columns. |
| `verify_jwt=false` declared with an in-code check | **Sound.** `supabase/config.toml:564-565` declares `[functions.paperwork-upload] verify_jwt = false`, and the in-code authority is the sha256 token compare — the `sms-inbound` / `comms-mute` / `fulfillment-evidence` precedent. OPTIONS is answered 204 with `corsHeaders`; the raw body is read before parsing; the service client is used only after the token resolves (see minor n-2 for a construction-order nit that is not a use-order defect). |

### Migration hygiene (00635–00638)

- Hand-numbered, above the branch's previous head, and clear of the reserved 00595–00620 block.
- Banner + lineage present on each; each redefinition quotes the grep-winner body it re-heads (00638 re-heads `issue_agreement_draw_invoice` and `get_client_commercial_document_bundle` in place).
- Idempotent: every `CREATE TABLE`/`INDEX` is `IF NOT EXISTS`, every function `CREATE OR REPLACE`, every policy dropped before create, every CHECK added under a `DO $$ … IF NOT EXISTS` guard.
- RLS in the same file as the table it governs; `studio_touches` is SELECT-only for members with no INSERT/UPDATE/DELETE policy (writes go through the definer RPC), `paperwork_link_tokens` likewise.
- Explicit grants with `REVOKE … FROM PUBLIC`; `anon` appears on no definer RPC; the eight 00636 functions go to `service_role`, with `regenerate_invoice_link` and `get_invoice_link` additionally to `authenticated`.
- Every `SECURITY DEFINER` function pins `SET search_path`; extension functions are schema-qualified (`extensions.digest`, `extensions.gen_random_uuid`).
- CHECK constraints over enums throughout (`studio_touches` carries six named CHECKs; `notification_log_ref_type_chk` is widened, not replaced by a type).
- Money stays in cents; no new money column was added.
- `seed/00-legacy-grants.sql` regenerated after the new grants: `python3 scripts/generate-legacy-grants.py` → "baseline + 2831 replayed statements", and the seed file's diff is empty (already in sync).

---

## 6. Minor findings

MINOR by the brief's own rule: report-file accuracy, comments, naming and test listings never hold the gate.

| id | Finding | Confidence |
|---|---|---|
| m-1 | The W7 redeploy set is listed as **37** functions; the true closure is **36**. Recomputed from the seven shared modules this wave touches (`decision-notify.ts`, `invoice-check-intent-core.ts`, `invoice-checkout-driver.ts`, `invoice-links.ts`, `project-approval-notification.ts`, `send-email.ts`, `sms.ts`): 34 importing functions, plus `paperwork-upload` and `resend-webhook` which are edited directly. `apns-send` is in the report's list but imports none of the seven. | high |
| m-2 | Report §9 says `flushDeferredMessages` writes no touch. It does — `supabase/functions/_shared/sms.ts:1225`, actor `sms-dispatch-flush`. The code is right and the report is wrong. | high |
| m-3 | Report calls `/paperwork/[token]` owed to a later wave; the page already exists on the branch. | high |
| m-4 | Report's Deno row reads `777 passed / 1 failed`; the tree actually runs `1571 passed, 1 failed, 1 ignored`. | high |
| m-5 | `paperwork-upload/core.ts:287` returns the raw storage error text to an unauthenticated caller: `` return { status: 500, body: { error: `upload failed: ${uploadError.message}` } }; ``. Bucket/key internals in a response on a `verify_jwt=false` door. | high |
| m-6 | `withinRateLimit` returns `true` when `!deps.ip`, so a caller behind no forwarding proxy is unbucketed by construction (compounds MAJOR-2). | high |
| m-7 | The storage SELECT policy's `NULLIF((storage.foldername(name))[1],'')::uuid` still raises 22P02 on any pre-existing object whose first segment is not a uuid. This wave's keys are all uuid-first, so nothing it writes trips it; it is the same class as the standing `project-documents` 22P02. | high |
| m-8 | `confirm_inbound_document` and `reject_inbound_document` do not require `inbound = true` on the target row — a member could confirm/reject a document that never came through the door. Both still require studio membership, so it is not a tenancy hole. | high |
| m-9 | `record_notice`'s twin `array_agg(... ORDER BY t.name)` pairing is fragile: the two aggregates are ordered independently, so a future edit that adds a column can silently mis-pair ids with names. Correct today. | medium |
| m-10 | `corsHeaders` carries no `Access-Control-Allow-Methods`. Browsers accept the preflight today because the header set is permissive, but the contract is incomplete for a browser-called door. | medium |
| n-1 | Report §5 states "ledger head `00637`". The actual head after this wave is **`00638`** (`00638_pay_link_readers_reheaded.sql`, plus `20260910152111`). | high |
| n-2 | Report §2 says the service-role client is built "only after the request is read". It is constructed at `paperwork-upload/index.ts:52`, before `handlePaperwork` reads anything. It is *used* only after the token resolves, which is the rule that matters — the sentence, not the code, is wrong. | high |
| n-3 | The `List-Unsubscribe` header carries `channel:<worst.id>` — the id of the worst-status row across studios, which may be another studio's row for the same address — rather than the sending studio's own row. Effect is identical because `applyChannelUnsubscribe` writes address-wide by `value`, so this is cosmetic, but the token names a row the recipient's letter did not come from. | medium |
| n-4 | The email gate reads `options.to` only; `cc` recipients are never channel-checked. Pre-existing, and the current `cc` population is `proposal-send`/`proposal-nudge` `cc_email` and `po-send`'s designer address — studio-side, not the account-less channel population the gate exists for. Worth a ruling rather than a fix. | medium |

### One non-finding worth recording

`supabase/tests/people/w1b_compliance_authority_directory_test.sql` failed once mid-round with
`3m expected 21 firm cards, got 24`. It passed on a fresh reset alone, and re-running the five preceding
suites kept the count at 21 and then passed. Not reproducible; attributable to the shared local Postgres
(another session writing between statements), not to this wave. Recorded here so the next round does not
chase it. All eight suites passed on the final run below.

---

## 7. Gates

All run in the worktree against the reset local DB. **No prod**: no `db push`, no `functions deploy`, no
secrets set.

### Reset

`pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset`

```
Finished supabase db reset on branch main.
```

Ledger head after reset: `00638` (`00638_pay_link_readers_reheaded.sql`), plus `20260910152111`.

Note for the next runner: the reset fails under the default sandbox with
`EPERM: operation not permitted, open '/Users/kody/.supabase/telemetry.json.tmp.…'` → `ELIFECYCLE Command
failed with exit code 1`. It is the Supabase CLI's telemetry write, not a migration failure, and a `| tail`
pipeline hides it behind a 0 exit status. Re-run outside the sandbox.

### SQL suites — `psql -v ON_ERROR_STOP=1`

```
people/w4_channels_touches_paperwork_test.sql: PASS
billing/invoice_links_test.sql: PASS
people/w4_invoice_link_freeze_order_test.sql: PASS
commercial/design_build_test.sql: PASS
people/w1a_identity_channels_consent_test.sql: PASS
people/w3_merge_sweep_household_test.sql: PASS
rls/people_directory_scope_test.sql: PASS
people/w1b_compliance_authority_directory_test.sql: PASS
```

### Deno — `deno test --no-check --allow-all --config supabase/functions/deno.json supabase/functions`

```
 FAILURES

./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)

FAILED | 1571 passed | 1 failed | 1 ignored (6s)
error: Test failed
```

The single failure is **pre-existing and not this wave's**: `_tests/stripe-rail.test.ts` throws
`supabaseKey is required` at module import (line 34), because it constructs a client at top level with no
key in the environment. `git diff --stat origin/main...HEAD` is empty for that path. Targeted re-run of
everything this wave touches — `_tests/paperwork-upload.test.ts`, `_tests/email-channel-status.test.ts`,
`_shared/`, `resend-webhook/`, `paperwork-upload/` — gives **495 passed / 0 failed**.

No `deno.lock` exists anywhere under `supabase/` (checked after the run).

### Types and grants

- `SUPABASE_DB_URL=… pnpm --dir … db:generate` → no schema drift. The only diff was cosmetic
  parenthesization in the generated generic helpers (`TableName extends (X) = never` → `TableName extends X
  = never`, 10 insertions / 10 deletions, zero schema rows) from a newer CLI; reverted.
- `python3 scripts/generate-legacy-grants.py` → "baseline + 2831 replayed statements"; `seed/00-legacy-grants.sql` diff empty.

All probe objects created for this review were rolled back; the database is left as the reset produced it.
