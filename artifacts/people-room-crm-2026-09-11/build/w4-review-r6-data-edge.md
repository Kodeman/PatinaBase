# W4 review — round 6, data + edge (adversarial)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Read in full: `build/w4-data-edge-report.md`,
`build/upload-door-spec.md` §5–§9, `build/w4-fix-log-r5.md`, migrations **00635**, **00636**,
**00637**, **00638**, the edge functions `paperwork-upload/{index,core}.ts`,
`_shared/{send-email,sms,invoice-links}.ts`, `sms-inbound/pipeline.ts`,
`resend-webhook/{index,channel-status}.ts`, `stripe-webhook/index.ts`,
`invoice-reminders/index.ts`, `invoice-send/index.ts`, and the readers
`packages/notifications/src/{tokens,unsubscribe}.ts`.

No prod mutation of any kind: no `db push`, no `functions deploy`, no `secrets set`. No server
was started, so the PORT RULE did not come into play. Local DB
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Nothing in `rulings.md` §3 is
reported here.

**Verdict: NOT CLEAN — 1 blocking, 1 major, 4 minor.**

---

## Findings

| id | severity | confidence | where |
|---|---|---|---|
| **R6-BLOCKING-1** | blocking | high | `supabase/migrations/00636_invoice_link_hardening.sql:128-130` |
| **R6-MAJOR-1** | major | high (mechanism) / medium (frequency) | `00636:222-230` + `supabase/functions/_shared/invoice-links.ts:86-92` + `apps/client-portal/src/app/invoices/` |
| **R6-MINOR-1** | minor | high | `build/w4-data-edge-report.md` §9 vs `supabase/functions/_shared/sms.ts:1223-1240` |
| **R6-MINOR-2** | minor | high | `build/w4-data-edge-report.md` §8 (`apns-send`) |
| **R6-MINOR-3** | minor | high | `build/w4-data-edge-report.md` §8 (five branch importers absent) |
| **R6-MINOR-4** | minor | high | `build/w4-data-edge-report.md` §1 + §5 (00638 absent from the migration table and the ledger head) |

---

### R6-BLOCKING-1 — 00636 nulls `invoice_links.token` one statement *before* it drops the NOT NULL, so `db push` aborts on Strata

`supabase/migrations/00636_invoice_link_hardening.sql`, §2, in file order:

```sql
UPDATE public.invoice_links SET token = NULL WHERE token IS NOT NULL;     -- :128

ALTER TABLE public.invoice_links ALTER COLUMN token DROP NOT NULL;        -- :130
ALTER TABLE public.invoice_links DROP CONSTRAINT IF EXISTS chk_invoice_links_token;
```

`00574_invoice_links.sql:73` declared the column `token text NOT NULL`. The freeze UPDATE runs
while the constraint is still on, so on any database that holds an `invoice_links` row the
statement raises `23514 not_null_violation`, the migration transaction rolls back, and **00636,
00637 and 00638 never land**. (The `chk_invoice_links_token` CHECK is *not* the problem — a CHECK
that evaluates to NULL passes. It is the column's NOT NULL alone.)

This is invisible on the local box and stays invisible however many times the gate is re-run:
`supabase db reset` replays migrations **before** seeds, so `invoice_links` is empty at :128, the
UPDATE touches 0 rows, and the reset is green. Measured after this round's reset:

```
$ psql ... -c "select count(*) from public.invoice_links;"
0
```

Strata is not empty. The 00574 ship report records the table at 22 rows before the ceremony probe
and 23 after (`artifacts/invoice-standalone-2026-09-06/delivery/ship/deploy-report-part1.md:161`),
and every `sent|partially_paid|paid` invoice since has added one. Reproduced against a
shape-identical standalone table (the real `invoice_links` cannot be populated by hand — its
FK path trips `studio_id_not_designer_studio`), replaying 00636's §2 statements in order:

```
ERROR:  null value in column "token" of relation "probe_links" violates not-null constraint
DETAIL:  Failing row contains (…, null, active, null, …,
         ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb, 2026-10-16 …).
```

**Fix:** move the two `ALTER TABLE` lines above the UPDATE — drop the NOT NULL and the old
`chk_invoice_links_token` first, then null the column, then add `chk_invoice_links_token_frozen`.
Nothing else in §2 depends on the current order: `token_hash` is already written (:106-109) and
`expires_at` already backfilled (:119-124) before the plaintext goes.

**Coverage this defect passed through:** `supabase/tests/billing/invoice_links_test.sql` runs
against the post-migration schema, so it cannot see a migration that never ran. A regression guard
has to be a migration-time one — a seed row in `invoice_links` before the replay, or a W7 preflight
that asserts `count(*) > 0` on Strata and dry-runs §2. Naming it because a green reset is exactly
what this defect produces.

---

### R6-MAJOR-1 — the new `ensure_invoice_link` NULL branch sends letters to a client-portal route that does not exist

00636 rewrites `ensure_invoice_link` to mint on every call, and adds a branch that answers NULL
rather than rotating a link a Checkout is standing on (`00636:222-230`):

```sql
  IF EXISTS (
    SELECT 1 FROM invoice_checkout_attempts
    WHERE invoice_id = p_invoice_id
      AND state IN ('claimed','session_created','processing')
  ) THEN
    RETURN NULL;
  END IF;
```

The guard itself is right — regenerating under a live Checkout would kill the payer's own page,
which is what `regenerate_invoice_link` refuses (M11). What is wrong is where the NULL lands.

**1. The fallback address is not a page.** `_shared/invoice-links.ts:86-92`:

```ts
export async function letterPortalUrl(admin, baseUrl, invoiceId): Promise<string> {
  const link = await ensureInvoiceLinkUrl(admin, baseUrl, invoiceId);
  return link ?? `${baseUrl.replace(/\/$/, '')}/invoices/${invoiceId}`;
}
```

`apps/client-portal/src/app/invoices/` contains exactly one file —
`invoices/[invoiceId]/print/page.tsx`. There is no `/invoices/[id]` route, `middleware.ts` has no
`invoices` rewrite and does not exempt the path, and `/` itself is not public (middleware
:189-190). So a holder of that letter is bounced to `/auth/signin?callbackUrl=/invoices/<id>` and,
if they ever get through, to `not-found.tsx`. For the account-less payer this whole rail exists to
serve (K1), the letter's only act is unreachable. 00636's own comment at :218-221 and
`invoice-links.ts:12-14, 44-49` both describe this fallback as "today's signed-in `/invoices/<id>`
form" — a form the client portal does not have. The shape that does exist is the door gate's
`/?invoice=<id>` (`apps/client-portal/src/components/threshold/door-gate.tsx:286-289`).

**2. W4 turned a dead branch live.** 00574's `ensure_invoice_link` (`00574:1039-1056`) returned
the active row's token and, on a lost `ON CONFLICT` race, re-SELECTed the winner's token. NULL
meant draft / void / missing only — and no letter is sent for those, so the M7 fallback was
effectively unreachable in production. Under 00636 NULL is a routine answer.

**3. It is reachable for days, not seconds.** `expire_stale_invoice_checkout_attempts` (cron
`invoice-checkout-attempts-expire`, `17 * * * *`) reaps only `state IN ('claimed','session_created')`
and only past `p_stale interval DEFAULT '24:00:00'`. It never reaps `processing`. An ACH debit sits
in `processing` for 3–5 business days. Meanwhile `invoice-reminders/index.ts:269-281` scans

```ts
.in('status', ['sent', 'partially_paid'])
.not('due_date', 'is', null)
.is('ar_flagged_at', null);
```

with no exclusion for a live attempt, and builds its address with `letterPortalUrl`
(`invoice-reminders/index.ts:356`). So every reminder that fires while an ACH payment is in flight,
and every reminder in the 24h after an abandoned Checkout, carries the dead address. `invoice-send`
(`:266`) has the same shape for a re-send.

**What is NOT broken, checked:** the two `stripe-webhook` letters are safe. `sendFailureSideEffects`
is called only under `if ((flippedRows ?? []).length > 0)` (`stripe-webhook/index.ts:855`), i.e.
after the `invoice_payments` row actually flipped `pending → failed`; that UPDATE fires the AFTER
trigger `sync_invoice_checkout_attempt_on_payment`, which sets the attempt `state = 'failed'` in
the same statement, so by :573 the EXISTS guard is false and the RPC mints. Same for
`sendSuccessSideEffects` at :470 via `state = 'succeeded'`. And `create-checkout-session` was
correctly moved off `ensureInvoiceLinkUrl` onto `hasLiveInvoiceLink`/`invoice_link_is_live`
(`invoice-links.ts:100-115`), so it no longer revokes the link the payer is mid-payment on.

**Fix (two parts, either alone is a half-fix):**
- point the M7 fallback at a route that exists — `${baseUrl}/?invoice=${invoiceId}`, the door
  gate's own shape — and correct the three comments that call it a `/invoices/<id>` form;
- hold the letter rather than shipping a fallback: exclude invoices with an attempt in
  `('claimed','session_created','processing')` from the `invoice-reminders` scan (they are mid-payment
  by definition), and/or teach `expire_stale_invoice_checkout_attempts` to reap `processing` past a
  longer ACH window so the guard cannot be held open indefinitely by a stuck row.

---

### R6-MINOR-1 — report §9 says `flushDeferredMessages` writes no out touch; it does

`build/w4-data-edge-report.md` §9: *"**`flushDeferredMessages` writes no out touch.** The brief
named `sendPartySms`; the flush is a second send path and was left alone rather than widened
unasked."*

`supabase/functions/_shared/sms.ts:1223-1240` files one, `p_actor_ref: "sms-dispatch-flush"`, and
the comment above it names the round that closed it: *"E13: one out touch per text that actually
went — and this path sends real texts (W4 r3 MAJOR-5)."* The code is right; §9 is a round stale.
Delete the bullet.

### R6-MINOR-2 — report §8 lists `apns-send` in the redeploy set; it imports nothing changed

`apns-send/index.ts` mentions `_shared/send-email.ts` once, at line 29, **inside a comment**
(`"…_shared/send-email.ts's log-update pattern."`). It imports no `_shared` module that this wave
touched and its own code did not change. Computed closure over `send-email.ts`, `sms.ts` and
`invoice-links.ts` (transitively through `decision-notify.ts`, `invoice-check-intent-core.ts`,
`project-approval-notification.ts`) gives 34 importers; plus `paperwork-upload` and `resend-webhook`,
whose own code changed, the true W4 redeploy set is **36**, not 37. Harmless in effect (an extra
redeploy), but the number is load-bearing for W7's checklist.

### R6-MINOR-3 — report §8 is the list W7 will read, and five branch importers are missing from it

§8 is headed *"every importer must redeploy in W7"*. W7 deploys the branch, not W4 alone, and
`main...HEAD` also changes `_shared/branded-email.ts`, `_shared/client-letter.ts`,
`_shared/email-assets.ts`, `_shared/html-to-text.ts` and `_shared/studio-identity.ts` (W2/W5 work).
Five functions import those and appear on no list in this file: `back-in-stock-check`,
`campaign-dispatch`, `comms-notification-dispatch`, `price-drop-check`, `spec-pdf`. None of them
imports `send-email.ts`, `sms.ts` or `invoice-links.ts`, so W4's own scope is enumerated correctly
— this is a hand-off note, not a W4 defect. Say in §8 that the 36 are W4's own fan-out and that
W7 must union it with W2's and W5's, or the branch-wide set (41) will be short by five.

### R6-MINOR-4 — report §1 and §5 predate 00638

The §1 migration table lists 00635/00636/00637 only, and the §5 gate row reads *"green; ledger head
`00637`"*. The wave now ships a fourth migration, `00638_pay_link_readers_reheaded.sql`
(`issue_agreement_draw_invoice` minting through `ensure_invoice_link` at :288;
`get_client_commercial_document_bundle`'s `payToken` → `NULL::text` at :671), and it is named only
in §4's reader table. This round's measured head:

```
20260910152111 | 00638 | 00637
```

Add 00638 to the §1 table and re-measure the §5 ledger-head cell.

---

## Re-check of every prior finding (`build/w4-fix-log-r5.md`)

| prior id | claim | state | evidence |
|---|---|---|---|
| `W4R5-QA-F1` / `R5-MAJOR-1` — a closed pay link goes silent on deploy day | expiry tested above `v_dead` in `resolve_invoice_link` | **FIXED** | `00636:516` returns silence only for `status = 'revoked'`; `:525` sets `v_dead`; the expiry test is at `:535-538`, **below** it. Block `4c` of `w4_channels_touches_paperwork_test.sql` asserts the withdrawn sheet for a link closed 90 days ago with a backfill-dated `expires_at`, and that `resolve_invoice_link_for_checkout` still buys nothing with it; the suite passes. The four comment sites named in the fix log carry the corrected rule (`:110-118`, `COMMENT ON COLUMN … expires_at`, `COMMENT ON FUNCTION resolve_invoice_link` at `:784-789`) |
| `W4R5-QA-F2` — the client portal's unsubscribe sibling contradicts the record | `scope` forwarded and rendered | **FIXED** | `apps/client-portal/src/app/api/unsubscribe/route.ts` `outcomePage()` forwards `scope`; `preferences/unsubscribe/page.tsx` validates it to `'address' \| 'account' \| undefined` and branches three ways, the `address` branch dropping the Manage-Preferences link. Both new test files present (8 + 7 cases) |
| `R5-MAJOR-2` / `W4R5-QA-F3` — the inbound touch names the wrong seat | consent touches fan out over the target set | **FIXED** | `sms-inbound/pipeline.ts` `recordConsentTouches` de-dupes `targets.flatMap(t => t.partyIds)` and falls back to `conv.party_id` only when the set is empty; wired at STOP `:1015`, START `:1073`, YES `:1155`. HELP stays on `conv.party_id` at `:1179`, which the fix log records as a decision. Four new cases in `_tests/sms-inbound.test.ts` |
| fix log "no `_shared` edit this round, W7 redeploy set is `sms-inbound` alone" | — | **stands for r5**, superseded by this round's §8 count (R6-MINOR-2) | — |

Nothing from r5 has regressed.

---

## The brief's check list, item by item

| check | verdict | evidence |
|---|---|---|
| The paperwork token is verified before any read (raw body, constant-time sha256 compare) | **holds** | `paperwork-upload/index.ts` reads `await req.formData()` off the raw request and hands `core.ts` the token; `resolve_paperwork_link` compares `encode(extensions.sha256(p_token::bytea),'hex')` against the stored hash inside the DB — the comparison never sees a raw stored value, and no branch of `core.ts` touches a company or document before that RPC returns |
| Expired / revoked refuse | **holds** | `resolve_paperwork_link` requires `revoked_at IS NULL AND expires_at > now()`; `record_inbound_compliance_document` re-resolves the token itself rather than trusting the caller |
| Uploads never overwrite a verified row | **holds** | `record_inbound_compliance_document` is INSERT-only — there is no UPDATE path to `studio_compliance_documents` in 00637 — and the storage write is `.upload(key, file, { contentType, upsert: false })` onto `${org}/${company}/${crypto.randomUUID()}/${sanitizeFilename(file.name)}`, so two uploads of the same filename cannot collide |
| Storage policies allow only the token's company path | **holds, with the shape named** | the single policy `compliance_documents_member_read` is SELECT-only, `TO authenticated`, keyed on `is_active_studio_member(NULLIF((storage.foldername(name))[1],'')::uuid)`. The token holder gets **no** storage grant at all (the upload runs on the service client); a studio member reads only their own org's folder. There is no INSERT/UPDATE/DELETE policy, so nothing but service_role writes |
| The key scheme avoids the uuid-cast trap | **holds** | segment 1 is the organization uuid, so `(foldername(name))[1]::uuid` always casts. Verified that the pre-existing `22P02` on this database persists with the new policy dropped and does not appear when only the new policy is present — it is the documented `project-documents` residual, not W4's |
| Recipients per R-AC | **holds** | `record_inbound_compliance_document` notifies owners + admins of the studio, plus the minter of the token when they are neither, with no new role |
| The email rail refuses dead / unsubscribed channels in every branch | **holds** | `_shared/send-email.ts` resolves the channel **unconditionally** (not only for account-less recipients) and returns `{ state: "suppressed", reason: "channel_<status>" }` before any Resend call; `resolveContactChannel` takes the worst status address-wide. Named exception, already in the report §9: `proposal-send` calls `prepareCompliantEmail` + `sendPreparedResendRequest` directly — the refusal gate still runs there, the touch and channel-ref logging do not |
| Unsubscribe tokens cannot cross subjects | **holds** | `parseUnsubscribeSubject` splits on the literal `channel:` prefix, and a profile uuid cannot carry it; the JWT is HS256-signed, so a holder cannot mint another subject's token. `applyChannelUnsubscribe` then stops every `email`/`ap_email` row with the same `value` — address-wide, which is *broader* than the token's subject but in the safe direction and exactly what `resolveContactChannel` reads back, so writer and reader agree |
| Touches insert on every send/receive path, `authority_check` matches CRM-22 | **holds** | out: `send-email.ts:742-753` (delivered + a studio row), `sms.ts:989-1001` (`sms-dispatch`), `sms.ts:1223-1240` (`sms-dispatch-flush`). In: `sms-inbound/pipeline.ts` `recordInboundTouch` + `recordConsentTouches`. `authority_check` is constrained by `studio_touches_authority_needs_class_check CHECK (authority_check = 'n/a' OR decision_class <> 'none')`, and `filedDecisionFacts` never returns `'none'` on a path that sets an authority verdict (it defaults to `'selection'` on `failed_unknown_sender`), so the CHECK cannot be tripped from the rail |
| `record_notice` matches the Patina Field signature | **holds** | `record_notice(p_project_id, p_what, p_told)` RETURNS TABLE `(id, what, recorded_at, recorded_by, told_names)` against `RecordNoticeParams` / `NoticeRow` in `apps/mobile/Capture/Capture/Features/People/PeopleRoomWire.swift:388-423` — three params, five columns, names and types line up |
| `invoice_links` backfill keeps every `/pay` link working | **BROKEN — see R6-BLOCKING-1**; the hash half is sound | `token_hash` is written at `:106-109` from the plaintext **before** it goes, so an emailed address keeps resolving (old plaintext lookup fails closed: the unique index on `token` is dropped and `resolve_invoice_link` matches on the hash only). The migration cannot reach that state on Strata because `:128` aborts first |
| Every `_shared` importer enumerated | **holds for W4's three modules, off by one** | see R6-MINOR-2 / R6-MINOR-3 |
| `project_tenant_org()` for every tenant resolution (R-BD) | **holds** | `record_touch` resolves through `project_tenant_org()` / `studio_contact_org()` and returns NULL when unattributable; no new function calls `project_consent_org()` |
| Consent record-only (R-AY) | **holds** | nothing in 00635–00638 or the changed edge files writes `project_parties.sms_consent_*` |
| `_primary_studio_for` never called from edge code (R-AM) | **holds** | no `.rpc(` call site anywhere under `supabase/functions`. The nine textual hits are comments or test commentary recording the revocation — `_shared/sms.ts:199,202,264`, `sms-inbound/pipeline.ts:236`, `_shared/invoice-subject.ts:46`, `_shared/sms.test.ts:932,1021`, `_tests/sms-inbound.test.ts:1334,2014` |
| `verify_jwt = false` only with an in-code token check, declared in `config.toml` | **holds** | `[functions.paperwork-upload] verify_jwt = false` with the token gate in `core.ts`; same posture as `fulfillment-evidence` |
| Browser-called functions answer OPTIONS with `corsHeaders`; raw body before parsing; service client only after auth | **holds** | `paperwork-upload/index.ts` — OPTIONS → 204 with `corsHeaders`, body read in the shell, `createClient` built after |
| Secrets by name only | **holds** | no secret value appears in any migration, function, config or artifact touched this wave |
| SECURITY DEFINER pins `search_path`; extension fns schema-qualified; CHECK over enum; money in cents; explicit grants + REVOKE FROM PUBLIC | **holds** | all 24 DEFINER functions across 00635–00638 carry `SET search_path`; `extensions.gen_random_bytes` / `extensions.sha256` qualified; every new status column is a named CHECK; no new object holds a PUBLIC grant (probed against `information_schema.role_table_grants` and `pg_proc.proacl`) |
| `seed/00-legacy-grants.sql` regenerated | **holds** | `python3 scripts/generate-legacy-grants.py` → diff **0 lines** against the committed file |
| `deno.lock` deleted | **holds** | absent from the worktree root |

---

## Gates run this round

**Reset** — `pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset`

```
Finished supabase db reset on branch main.
EXIT=0
```

Ledger head:

```
20260910152111 | 00638 | 00637
```

(Two earlier attempts: one `EPERM … /Users/kody/.supabase/telemetry.json.tmp` — the Bash sandbox's
write allowlist, re-run unsandboxed — and one transient
`LegacyMigrationApplyError … Connection error / At statement: 72 / GRANT EXECUTE ON FUNCTION
public.record_agreement_draw_lien_waiver(...)`, a dropped connection, green on retry. Neither is a
migration-content failure; the third run is the one recorded above.)

**SQL suites** — `psql -v ON_ERROR_STOP=1 -f …`

```
supabase/tests/people/w4_channels_touches_paperwork_test.sql   W4 SQL suite: all blocks passed   ROLLBACK
supabase/tests/billing/invoice_links_test.sql                  exit 0, 0 ERROR, ends ROLLBACK
supabase/tests/people/w1b_…_test.sql                            All W1b assertions passed.
supabase/tests/edge_api/public_rpc_authorization_contract_test.sql   exit 0
supabase/tests/edge_api/platform_acl_compatibility_test.sql     RED — pre-existing, KNOWN_FAILURES.md:45-60
                                                                ("PUBLIC holds a reachable … privilege",
                                                                the pg_stat_statements residual)
supabase/tests/notifications/00591_notification_log_ref_rls_test.sql   ALL PASSED
```

**Deno** — `deno test --allow-all --config /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/supabase/functions/deno.json supabase/functions/_tests supabase/functions/_shared supabase/functions/paperwork-upload supabase/functions/resend-webhook`

```
ok | 192 passed | 0 failed (924ms)
```

**Notifications package** — `pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build --filter @patina/notifications test`

```
Test Files  7 passed (7)
Tests  104 passed (104)
```

**Grants seed** — `python3 scripts/generate-legacy-grants.py` → diff **0 lines**.
**`deno.lock`** — absent.

The blocking finding is not visible in any of the above, for the reason given in
R6-BLOCKING-1: the local table is empty when the statement runs.
