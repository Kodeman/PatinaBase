# W4 — adversarial migration + edge review, round 13

Scope: `00635_studio_touches_and_channel_refs.sql`, `00636_invoice_link_hardening.sql`,
`00637_paperwork_upload_door.sql`, `00638_pay_link_readers_reheaded.sql`;
`supabase/functions/paperwork-upload/{index.ts,core.ts}`,
`supabase/functions/resend-webhook/{index.ts,channel-status.ts}`,
`supabase/functions/_shared/{send-email.ts,sms.ts,invoice-links.ts,invoice-checkout-driver.ts}`,
`packages/notifications/src/{tokens,unsubscribe}.ts`,
`apps/client-portal/src/app/pay/return/[nonce]/route.ts`,
`apps/client-portal/src/components/paperwork/paperwork-sheet.tsx`,
`apps/mobile/Capture/Capture/Features/People/*`;
read against `w4-data-edge-report.md`, `upload-door-spec.md` §5–§9, `rulings.md` §3,
`w4-fix-log-r12.md`, and `w4-review-r11-data-edge.md` §6.

Verdict: **not clean** — 1 major, 9 minor, 0 blocking.

---

## 1. The r12 findings, re-checked

| r12 | State | Evidence |
|---|---|---|
| MAJOR-1 — the anonymous door's rate buckets are never swept | **fixed** | `00637` §3b schedules `paperwork-link-rate-limit-cleanup` at `'23 * * * *'`; `cron.job` on the live DB carries it; suite block 16 passes ("the broom is scheduled at 23 past, it names its own table, and running its own command text removes the day-old row while the live one stands"). |
| MAJOR-2 — `applyChannelUnsubscribe` leaves `profiles.email_suppressed` untouched | **fixed** | `packages/notifications/src/unsubscribe.ts` now writes the channel rows and then `profiles.update({email_suppressed:true,…}).eq('email', channel.value)`, returning `status:'error'` if the second write fails. |
| MAJOR-3 — the spec's primary entrance (a Paperwork section on the firm's own field link) is not built | **recorded, by design** | `build-sheet.md:71,77` names it a W6 deliverable with an owner; `w4-paperwork-report.md:196` and `w4-data-edge-report.md:222` both record it as owed. `apps/client-portal/src/app/field/` carries no Paperwork code, as expected. Not re-reported. |
| M-1 — `paperwork-sheet.tsx` disclosure carries no `aria-expanded`/`aria-controls` | **fixed** | `paperwork-sheet.tsx:185-186` sets both; `:201` uses `hidden={!isOpen}`; `:190` announces through `paperworkOpenedSentence`. |

r11 m-11 (form payload read before the rate bucket is claimed) is **answered by R-CA** —
the token is what keys the bucket for a caller with no usable address, so it must be read
first. Settled; not re-reported. r11 m-12 and m-13 are **still open** and carried below.

---

## 2. Findings

### MAJOR-1 — a dead address the channel ledger knows about stays mailable on the one rail that never asks the ledger
*Confidence: medium.*

`resend-webhook`'s orphan branch (`index.ts:214-231`) is the branch W4 added so that a bounce
arriving on a letter with no `notification_log` row still kills the address everywhere
(D-6). It calls `writeChannelStatus` and returns. It does **not** write
`profiles.email_suppressed` — `handleBounce` and the complaint suppression both sit behind
`if (logEntry.user_id)` (`:413`, `:438`), which this branch never reaches.

That would be harmless if every rail consulted the channel ledger. `campaign-dispatch` does
not: it posts straight to `https://api.resend.com/emails/batch` (`index.ts:468`) without
`sendCompliantEmail`, and its audience filter is `profiles.email_suppressed = false` and
nothing else (`:76`, `:266`, `:290`, `:301`). So for an address that (a) carries a
`studio_contact_channels` row, (b) hard-bounced on a letter that wrote no log row — the
po-send / quote-request-send / trade-rfq-send / trade-agreement-send set the branch comment
itself names — and (c) also belongs to a `profiles` row in a campaign audience, the channel
ledger says `dead` and the campaign rail keeps sending.

This contradicts r12 MAJOR-2's own stated premise, which took the unsubscribe path precisely
because "bounce and complaint already keep the two ledgers in step." On the orphan path they
do not. It is not a W4 regression — `campaign-dispatch` never consulted channels — but W4
owns the channel ledger, and the wave report's claim that the gate runs on every rail is
not true of this one.

**Fix:** mirror the verdict, the way r12 MAJOR-2 did for unsubscribe — in
`writeChannelStatus`, when the resolved status is `dead` or `unsubscribed`, also
`update profiles set email_suppressed = true, email_suppressed_at = now where email = <address>`
(best-effort, warn-on-failure, same as the channel write). Optionally also have
`campaign-dispatch` join `studio_contact_channels` and drop `dead`/`unsubscribed` addresses,
which closes the same hole from the other end.

---

### m-1 — report §7 miscounts its own suite and its own Deno tests
*Confidence: high.*

§7 is headed "Eight blocks, one transaction, rolled back" and lists eight. The suite on disk
runs **sixteen** — blocks 9–16 were added across r9–r12, and block 16 is r12 MAJOR-1's own
broom test, which §7 does not mention at all. §7 also says the two Deno files carry "12" and
"11" tests; `deno test` reports **38**. Report-accuracy only; never holds the gate.

**Fix:** re-head §7 "Sixteen blocks", describe 9–16, and take the test counts from the runner.

### m-2 — report §8 lists `apns-send`, which imports no `_shared` module
*Confidence: high.*

`grep -rn "_shared/" supabase/functions/apns-send/*.ts` returns exactly one hit, a **comment**
at `index.ts:29` ("`_shared/send-email.ts`'s log-update pattern"). `apns-send` imports
`./core.ts`, `supabase-js` and `jose` and nothing else. It is in §8's 37-function W7 redeploy
set because a naive `grep -rl` matched the comment. Redeploying it is harmless; the count and
the basis are wrong.

**Fix:** drop `apns-send` and recount, or compute §8 from real import specifiers rather than
a text grep.

### m-3 — report §8's basis sentence omits `_shared/invoice-checkout-driver.ts` *(r11 m-12, still open)*
*Confidence: high.*

W4 changed four `_shared` modules (`git diff` against the merge base:
`send-email.ts`, `sms.ts`, `invoice-links.ts`, `invoice-checkout-driver.ts`). §8's basis
sentence names only the first three. The **set itself is complete** — the driver's two
importers, `create-checkout-session` and `invoice-link-checkout`, are both already listed —
so no function is missed; the sentence just does not explain why they are there.

**Fix:** add `_shared/invoice-checkout-driver.ts` to §8's basis list.

### m-4 — the new bucket's read policy reproduces the uuid-cast shape the spec created it to avoid
*Confidence: high.*

`upload-door-spec.md:74` is explicit: `project-documents` is not reused because its policies
cast `(storage.foldername(name))[1]::uuid` and a non-uuid first segment raises `22P02` on any
authenticated scan. `00637`'s `compliance_documents_member_read` casts the same way:

```sql
USING (bucket_id = 'compliance-documents'
       AND public.is_active_studio_member(
             NULLIF((storage.foldername(name))[1], '')::uuid))
```

Probed on the live local DB: a cross-bucket scan is safe (`bucket_id` short-circuits first),
but an object inside `compliance-documents` whose first segment is not a uuid raises
`ERROR: invalid input syntax for type uuid: "legacy-folder"` for every authenticated reader
of the bucket. Latent today — only service_role writes here, and `core.ts:347-352` builds
every key as `uuid/uuid/uuid/filename` from the token row — but it is the identical trap, one
stray write away.

**Fix:** guard the cast, e.g. `AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'` before
it, so a malformed key is invisible rather than fatal.

### m-5 — spec §8 says the storage policies are keyed on `(organization_id, company_id)`; only the org segment is checked
*Confidence: high.*

§8's bucket row: "`storage.objects` policies keyed on `(organization_id, company_id)` path
segments". The shipped policy tests segment `[1]` (organization) only; segment `[2]`
(company) is never read. Tenancy still holds — `is_active_studio_member(org)` **is** the
boundary, and a member of the org is entitled to every firm's paper in that org — so this is
a record-vs-policy disagreement, not a hole. Confirmed against the live catalogue: one policy
on the bucket (`compliance_documents_member_read`, SELECT, `{authenticated}`), no anon policy,
no INSERT/UPDATE/DELETE policy, bucket private, 15 MB, mime-restricted to pdf/jpeg/png.

**Fix:** correct §8 to say the policy is org-keyed and the company segment is structural.

### m-6 — spec §8 describes a rate-limit table the migration did not build
*Confidence: medium.*

§8: "`paperwork_link_rate_limits` | New | `ip_address, window_started_at, attempt_count,
updated_at`". The shipped table is keyed on `bucket_key`, fed by a four-rung ladder
(`ip:` → `link:<id>` → `tok:<sha256>` → `anon`, `00637:439-473`) introduced by r11 MAJOR-2 and
R-CA. The grant posture matches the spec (service_role only).

**Fix:** re-write §8's row to the shipped shape, or point it at R-CA.

### m-7 — `withinRateLimit` fails closed on error and open on null
*Confidence: low.*

```ts
if (error) { console.error(...); return false; }   // fails closed — right
return data !== false;                              // a null answer passes
```
(`paperwork-upload/core.ts:247-251`.) `paperwork_link_rate_limit_hit` cannot currently answer
null from this call site — `v_count` is always set by `RETURNING`, and the edge caller omits
`p_limit` so the default applies — so this is shape, not behaviour. But the two adjacent
branches disagree about which way the door fails.

**Fix:** `return data === true;`

### m-8 — the a11y contract names an `authority_check` value the schema does not carry
*Confidence: high.*

`panel/ux/ux-6-a11y-systems.md:82` (AX-10) specifies "a visible+announced 'prepared by X, not
yet approved' state on any touch lacking `authority_check = matched`". `00635:161` constrains
the column to `('n/a','passed','failed_no_authority','failed_unknown_sender')` — there is no
`matched`. The shipped reader (`w4-studio-report.md:117`) uses CRM-22's own wording and works;
only the a11y row's named value is unbuildable as written.

**Fix:** amend AX-10 to `authority_check = 'passed'`, or record the rename as a ruling.

### m-9 — the suppression gate fails open when the channel lookup errors *(r11 m-13, still open)*
*Confidence: high.*

`_shared/send-email.ts:168-171`: on a PostgREST or transport error `resolveContactChannel`
returns `null`, which every caller reads as "no channel on file", and the letter goes out
ungated. A transient blip therefore mails an address the ledger may hold as `dead` or
`unsubscribed`. Deliberate in spirit (a letter should not die on an infra hiccup) and the
window is transient, unlike MAJOR-1's permanent state — but it is the one place the gate
opens rather than holds.

**Fix:** if the gate's own posture is "send anyway", say so in the comment; if not,
distinguish "looked and found nothing" from "could not look" and hold on the second.

---

## 3. Considered and NOT reported

- **`stripe-webhook`'s receipt / payment-failed letters take `letterFallbackUrl`.** Right after
  a link-rail payment settles, `invoice_letter_must_hold` is true by construction, so both
  letters ship `${CLIENT_PORTAL_URL}/?invoice=<id>` — a signed-in surface — to a payer who may
  have no account. **R-BY** fixes the fallback shape as exactly that form and names
  `invoice-send` and `invoice-reminders` as the two rails that hold rather than ship; **R-BZ**
  repeats the pair. A receipt cannot hold. r11 §6 recorded this verbatim so it would not be
  re-opened; it is re-recorded here for the same reason. Any change of mind is a ruling, not a
  finding.
- **r11 m-11**, the payload read before the bucket is claimed — answered by **R-CA**.
- **The `invoice_links` freeze.** `00636` backfills `token_hash` from the plaintext at `:162-164`
  and only then drops `NOT NULL` (`:199`), nulls the column (`:204`) and freezes it (`:209`);
  `token_hash SET NOT NULL` at `:217` would have failed the replay had any row been missed.
  Every pre-existing `/pay/<token>` therefore still resolves by hash while the plaintext lookup
  is gone. Suite block 4 proves the stored hash is useless as a bearer token. No finding.
- **`paperwork-upload` never overwrites a verified row.** `core.ts:355` uploads with
  `upsert:false` under a per-upload uuid segment, and `record_inbound_compliance_document`
  always INSERTs against the **token's** firm. Suite block 6 proves it. No finding.
- **`record_notice` matches Patina Field.** `RecordNoticeParams(p_project_id,p_what,p_told)` /
  `NoticeRow(id, what, recorded_at, recorded_by, told_names)` in
  `SupabasePeopleRoomService.swift` / `PeopleRoomWire.swift` is the RPC's signature and
  `RETURNS TABLE` exactly; suite block 3 asserts the wire shape. No finding.
- **`project_tenant_org()` for every tenant resolution (R-BD)** and **consent record-only
  (R-AY)** hold across 00635–00638. **`_primary_studio_for` is never called from edge code
  (R-AM)** — no occurrence under `supabase/functions/`.
- **`_shared` fan-out.** The four changed modules' real import closure is fully contained in
  §8's list (see m-2, m-3 for the two accuracy defects in how it is described).
- **Port conflicts.** None encountered; no server was started for this review.

---

## 4. Gates

`pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset`

```
Finished supabase db reset on branch main.
```

(As in r10–r12, the first attempt inside the Bash sandbox aborts on
`EPERM: operation not permitted, open '/Users/kody/.supabase/telemetry.json.tmp…'` — a
telemetry-file write outside the sandbox, not a migration failure. The identical command
completes when run unsandboxed.)

SQL suites, `psql -v ON_ERROR_STOP=1`:

```
exit=0 supabase/tests/people/w1a_identity_channels_consent_test.sql
exit=0 supabase/tests/people/w1b_compliance_authority_directory_test.sql
exit=0 supabase/tests/people/w3_merge_sweep_household_test.sql
exit=0 supabase/tests/people/w4_channels_touches_paperwork_test.sql
exit=0 supabase/tests/people/w4_invoice_link_freeze_order_test.sql
exit=0 supabase/tests/notifications/00591_notification_log_ref_rls_test.sql
exit=0 supabase/tests/commercial/design_services_paper_issue_test.sql
exit=0 supabase/tests/commercial/trade_agreement_test.sql
```

The W4 suite's tail:

```
NOTICE:  15. W4 r11 MAJOR-2 — the paperwork bucket tells no one whether a token was ever
minted: a dead token reaches no link bucket, a dead and an unminted token share one key shape
and one answer, junk knocks cannot spend a shared bucket, and the per-token limit still bites
at 20: passed
NOTICE:  16. W4 r12 MAJOR-1 — the anonymous door's buckets are swept: the broom is scheduled
at 23 past, it names its own table, and running its own command text removes the day-old row
while the live one stands: passed
NOTICE:  W4 SQL suite: all blocks passed
ROLLBACK
exit=0
```

Deno, `--config supabase/functions/deno.json`:

```
deno test --allow-all … _tests/paperwork-upload.test.ts _tests/email-channel-status.test.ts
ok | 38 passed | 0 failed (85ms)

deno test --allow-all --no-check … _shared/ paperwork-upload/ resend-webhook/
ok | 465 passed | 0 failed (1s)
```

`deno.lock`: absent (`"deno.lock": No such file or directory`).

Out of scope, recorded for honesty: widening the Deno run to the whole `_tests/` directory
adds one failure, `_tests/stripe-rail.test.ts`, which constructs a Supabase client at module
load and dies with `supabaseKey is required` unless `SUPABASE_SERVICE_ROLE_KEY` /
`SUPABASE_ANON_KEY` are in the env and `supabase functions serve` is running. It is a live-stack
integration harness (its own header says so), last touched at 00570/00571, and W4 changed
nothing it covers. Not a finding.

Live-catalogue probes run for this round: `cron.job` (broom present at `23 * * * *`),
`pg_policies` on `storage.objects` for `compliance-documents` (one SELECT policy, authenticated,
no anon), `storage.buckets` (private, 15728640, pdf/jpeg/png), and `pg_views.v_access_grants`
(carries `paperwork_link_tokens`).

No prod mutation of any kind: no `db push`, no `functions deploy`, no `secrets set`.
No `.env.local` was created or read. No secret value was printed.
