# W1a close-out — round 5, tests / types / behaviour review

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `e409a7825` (one commit past the
`w1a-close-fix-log-r4.md` baseline `bb168fe6a` — the r4 fix commit itself).
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
this wave's sole owner this round). **No prod act of any kind** — no
`supabase db push`, no `supabase functions deploy`, no Strata connection.

This round did not touch code. It re-ran the r4 fixes' own gates independently,
then went beyond them: role-scoped RLS/grant probes (anon / an authenticated
client with no studio / an authenticated studio-owner designer with two
studios), four constructed consent scenarios, a full grep of every reader of
`people_directory` / `v_project_roster` in `apps` + `packages`, and the two
named type-checks.

**Verdict: clean.** Zero BLOCKING, zero MAJOR. The three r4 findings
(BLOCKING-1, MAJOR-1, MAJOR-2) are confirmed FIXED. The 24 MINORs r4 left
untouched remain open, as declared; none of them meet this round's BLOCKING/MAJOR
bar on independent re-examination (two of the closest candidates are re-verified
below). One coordination note, not a code finding, at the very end.

---

## 1. Prior findings (r4), re-checked

| Finding | r4 disposition | This round |
|---|---|---|
| BLOCKING-1 — `studiosHoldingPhone()` dropped `orgsOfProjects()`'s `failed`, so the STOP branch's 500 gate checked three flags, not four | FIXED — returns `{targets, failed}`, STOP gates on all four | **CONFIRMED FIXED.** `pipeline.ts:696-751` shows `stopPartyOrgs = await studiosHoldingPhone(...)` named and its `.failed` in the STOP disjunction (`:750`). Deno: "a STOP whose studio-attribution read fails is not acknowledged, and the retry records the seat-only studio" passes (§3 below) |
| MAJOR-1 — `studiosHoldingRecord`'s START filter read the raw `status` column, not the verdict, so a folded `granted`/`not_asked` record carrying `refusal_unanswered` had no recipient-side door | FIXED — `recordVerdict()` folds the flag the same way `channel_consent_status()` does | **CONFIRMED FIXED.** `pipeline.ts:305-306,323-338` — `recordVerdict()` defined, `studiosHoldingRecord` filters on it. Both new Deno tests pass; SQL test suite unaffected (SQL side was already correct — this was a TS-only gap) |
| MAJOR-2 — Patina Field's punch routing (`PunchCourtResolver`) is dead on the frozen seat; option (a) taken (disclose, don't fix) | Disclosed in report §5.1b/§8; no Swift change | **CONFIRMED — disclosure present and accurate.** `w1a-report.md:383` names `PunchCourtResolver.resolve` / `SupabaseSiteRequestService.swift:16-18,513-519` / the `.noCourt` → `owner_party_id = nil` chain / `00621:207-209`'s early return, and §8 states the consequence. No Swift file is touched by `e409a7825` (confirmed: `git show --stat` lists no `.swift` path). This is the option the finding itself offered and the report says which one was taken and why (b) was rejected — nothing further owed this round |

`rulings.md` carries all three as R-AT / R-AU / R-AV (`artifacts/people-room-crm-2026-09-11/rulings.md:95-97`), dated 2026-09-12.

The 24 MINORs (`w1a-close-review-r4-migrations.md` MINOR-1..18 plus A–G) are
explicitly **untouched** per the r4 fix log's own stated scope ("Scope: the
three non-minor findings... and nothing else"). Re-confirmed open by direct
grep/read this round (not re-derived from the log) — see §6.

---

## 2. SQL tests

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  40. one reader, one verdict: an unanswered refusal reads opted_out everywhere the room prints it (close-review r2 MAJOR-2): passed
NOTICE:  41. the Desk rollup counts the record's pending, not the frozen seat's, and agrees with the Call Sheet about the same person (close-out r3 MAJOR-1): passed
NOTICE:  42. the two 00284 dispatch gates reach a party the record granted, and still refuse an unasked, a refused and a non-field one (close-out r3 MAJOR-3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
$ echo $?
0
```

44 blocks, all `passed`; the only `ERROR|FAIL` string match in the whole log is
a block title ("...a DATELESS refusal fails closed too...: passed"), not an
actual failure. `PSQL_EXIT=0`.

---

## 3. Deno tests

`_shared`, `sms-inbound`, and `_tests` in full, exactly as asked:

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared supabase/functions/sms-inbound supabase/functions/_tests
```

**This fails at the type-check step**, on a file this wave never touches:

```
TS2345 [ERROR]: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'string | ArrayBuffer'.
  ...
        attachments: [{ filename: `${ctx.poNumber}.pdf`, content: encodeBase64(bytes) }],
                                                                               ~~~~~
    at .../supabase/functions/fulfillment-po/core.ts:314:80
error: Type checking failed.
```

Confirmed **pre-existing and unrelated**: `git blame -L310,316
supabase/functions/fulfillment-po/core.ts` names commit `7c95cb0969` (2026-07-17,
"feat(boh): S3 PO render + transmit engine"), and the same line is on
`origin/main` verbatim. This is a Deno/`std` `encodeBase64` signature drift the
`_tests` directory's type-check catches whenever it walks the whole tree; W1a's
branch does not introduce it and does not touch `fulfillment-po/`. Filed as a
MINOR test-coverage/environment finding below (F-1), not attributed to W1a.

Re-run with `--no-check` to see actual results (still the full directory, as
instructed):

```
$ deno test --allow-all --no-check --config supabase/functions/deno.json \
    supabase/functions/_shared supabase/functions/sms-inbound supabase/functions/_tests
...
FAILED | 716 passed | 1 failed (3s)

./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)
error: (in promise) Error: supabaseKey is required.
    at .../supabase-js.mjs:3:6907
    at file://.../supabase/functions/_tests/stripe-rail.test.ts:34:31
```

Also **pre-existing and unrelated**: `git log` on that file's most recent
commits (`5cddbe157`, `c32e628a5`, `5dbfc4db4`) are all Stripe/invoice work, none
of them this branch's. The failure is an unset Supabase env var in this shell,
not a code defect — no `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` is exported
here. MINOR test-hygiene finding below (F-2), not attributed to W1a.

**The consent-relevant subset — the actual surface of this review — passes
clean:**

```
$ deno test --allow-all --no-check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts \
    supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
...
runFieldDaily's delivery confirm follows the same record (MAJOR-2's second filter) ... ok (0ms)

ok | 100 passed | 0 failed (350ms)
```

100 passed, 0 failed — matches the r4 fix log's own count exactly (83 sms +
`sms-inbound` tests, +13 `field-daily`, six of them new this round's ancestor).
Both new r4 tests are in the run and pass:
`a STOP whose studio-attribution read fails is not acknowledged, and the retry
records the seat-only studio`, `a STOP with a clean studio-attribution read
records the seat-only studio and answers 200`,
`START lifts an unanswered refusal standing on a record whose status column
still says granted`, `START lifts an unanswered refusal standing on a record
whose status column says not_asked`.

`ls deno.lock` → no such file (no lockfile drift).

---

## 4. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
```

First attempt failed under the Bash sandbox's default Docker-socket denial
(`permission denied ... docker.sock`), which truncated
`packages/supabase/src/database.types.ts` to zero lines before erroring —
restored with `git checkout -- packages/supabase/src/database.types.ts`
immediately, confirmed no diff, before retrying with the sandbox override for
that one command only. This is a sandbox/tooling note, not a project finding —
recorded so the truncation-then-restore is on the record.

```
$ SUPABASE_DB_URL=... pnpm --dir .../agent-people-build db:generate   # sandbox override
GEN_EXIT=0
$ git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty)
```

**Empty diff — no drift**, confirming the fix log's own claim.

---

## 5. Role probes (RLS + grants), and four constructed scenarios

One script, one transaction, `ROLLBACK` at the end (residue confirmed zero
afterward: `select count(*) from studio_channel_consent where channel_value
like '+1555%'` → 0; `select count(*) from projects where id::text like
'c0000001-%'` → 0). Dev accounts from `supabase/seed/dev-accounts.sql`:
`designer@patina.dev` = `a0000000-0000-0000-0000-000000000004` (owner of two
real seeded studios — `b0000000-0000-0000-0000-000000000001` "Local Dev Studio"
and `7be29566-b83c-472b-bfef-f8c94c2d8617` "Leah Hartwell"), `client@patina.dev`
= `a0000000-0000-0000-0000-000000000005` (zero `organization_members` rows —
the true no-studio caller), plus `anon`.

### 5a. Role probes

```
--- anon: SELECT studio_channel_consent ---
NOTICE:  anon SELECT studio_channel_consent: permission denied (expected)
--- anon: channel_consent_status() ---
NOTICE:  anon channel_consent_status: permission denied (expected)
--- anon: record_channel_consent() ---
NOTICE:  anon record_channel_consent: permission denied (expected)

--- authenticated CLIENT (no studio membership) ---
 client_sees_studio_a_rows
---------------------------
                         0
 client_reads_studio_a_word
----------------------------
 (NULL)
NOTICE:  client record_channel_consent raised: not_a_studio_member

--- authenticated DESIGNER (owner of Studio A and Studio B) ---
           organization_id            | status
--------------------------------------+---------
 b0000000-0000-0000-0000-000000000001 | granted
 designer_reads_studio_a_word
------------------------------
 granted
```

anon holds no table grant and no `EXECUTE` on either function — matches the
migration's `REVOKE ALL … FROM PUBLIC, anon`. The authenticated client with no
studio sees zero rows (RLS `studio_channel_consent_member_select` is
`is_active_studio_member(organization_id)`), `channel_consent_status()` returns
NULL for the same reason (SECURITY INVOKER, table RLS decides), and
`record_channel_consent()` raises `not_a_studio_member` rather than writing. The
designer, an active owner of both seeded studios, reads exactly their own row
and the correct verdict. No RLS hole, no grant hole, no cross-tenant read found.

### 5b. Scenario A — phone opted_out in Studio A, granted in Studio B (same designer, both real studios, same phone number)

```
 studio_a_word | studio_b_word
---------------+---------------
 opted_out     | granted
NOTICE:  SCENARIO A: PASS -- org isolation holds (A=opted_out, B=granted, same number)
```

**B may send, A may not — org isolation holds** at the `channel_consent_status()`
layer, which is what every shipped reader and the send gate's first check both
go through. No shared-phone bleed between tenants.

### 5c. Scenario B — a phone with an opted_out `project_parties` seat and NO `studio_channel_consent` record

```
 record_word_no_record
-----------------------
 (NULL)
NOTICE:  SCENARIO B: the RECORD-only reader (channel_consent_status) sees no record -> NULL/not_asked as designed.
NOTICE:  SCENARIO B: whether the SEND GATE refuses via the opted_out-seat fallback is _shared/sms.ts:orgHasOptedOutParty() -- TS-side, covered by sms.test.ts (deno), not by SQL alone.
```

The record-only reader has nothing to say (correct: no record exists yet, and
the room prints `not_asked`). The actual refusal for this exact shape — an
opted-out seat with no record — is a TypeScript-side gate
(`orgHasOptedOutParty()`), and it is genuinely exercised, not merely asserted in
prose: `supabase/functions/_shared/sms.test.ts:576-620` — three real tests —
"with no studio record, an opted-out sibling party row in the SAME studio still
blocks (fail closed)" (passes, `res.sent === false`, `reason === 'opted_out'`),
"...ANOTHER studio's opted-out party row does not block" (org-scoped, R-AK — the
send proceeds, proving no cross-tenant false refusal either), and "...no record
and no resolvable studio, any opted-out row on the number still blocks" (the
one deliberate phone-global exception, R-AM). All three ran clean in §3's 100/0
suite.

### 5d. Scenario C — a STOP, then a new recorded grant with evidence

```
 after_stop
------------
 opted_out
 after_start
-------------
 granted
NOTICE:  SCENARIO C: PASS -- post-START record reads granted, new evidence recorded, refusal evidence survives beside it (R-AN)
```

Simulated the exact shape `writeChannelConsent()` performs on a STOP then a
START (the r4 MAJOR-1 fix path): after the STOP the verdict is `opted_out`; the
subsequent START-shaped write (fresh `source`/`evidence`, `refusal_unanswered =
false`) reads `granted` afterward, and the refusal's own evidence
(`opt_out_evidence = 'STOP'`) survives untouched beside the grant's fresh
evidence (`evidence = 'Inbound START'`) — R-AN (evidence refreshed, never
nulled) holds for the grant side of a two-act record too. **Allowed**, as
required.

### 5e. Scenario D — a legacy write to `project_parties.sms_consent_status` by an authenticated studio member

```
NOTICE:  SCENARIO D: legacy write by authenticated studio member raised: consent_legacy_column_frozen (P0001)
 sms_consent_status
--------------------
 not_asked
```

Attempted as the designer (an active owner of the studio that owns the
project), via `SET ROLE authenticated` + `request.jwt.claims`, a plain `UPDATE
... SET sms_consent_status = 'granted'`. **Refused** — `P0001
consent_legacy_column_frozen` — and the row is confirmed unchanged afterward.
The escape hatch (`app.consent_legacy_write = 'on'`) was also probed as a
control and, as documented, lets the same write land — proving the trigger is
actually gating the column, not merely failing for an unrelated reason.

---

## 6. Every reader of `people_directory` / `v_project_roster` in `apps` + `packages`

```
$ grep -rn "from(['\"]v_project_roster['\"])\|from(['\"]people_directory['\"])" apps packages --include="*.ts" --include="*.tsx"
packages/supabase/src/hooks/use-people.ts:125,161   .from('people_directory')...
packages/supabase/src/hooks/use-coordination.ts:1008 .from('v_project_roster')...
```

Traced every consumer of those two hooks' output plus `field_activity_summary`'s
hook (the third repointed reader, 00621 §1):

| Consumer | Reads | Verdict |
|---|---|---|
| `use-coordination.ts:1008` `useProjectRoster` → `ProjectRosterRow` | `v_project_roster.*` | repointed column (`sms_consent_status` via `channel_consent_status()`, 00594) |
| `roster-derivation.ts:390` `vitals()` (`textable` count) | `row.sms_consent_status === 'granted'` on `ProjectRosterRow` | same repointed column — correct |
| `roster-row.tsx:95` | `row.sms_consent_status ?? 'not_asked'` | same — correct |
| `use-people.ts:125,161` `usePeopleDirectory`/`usePersonDetail` | `people_directory.*` | repointed (`status_raw`, `meta->>'sms_consent_status'`, 00594 §2.3) |
| `people-derivation.ts:229-236` (field-kind dot color) | `p.status_raw` for `sub`/`installer`/`receiver` | same repointed field — correct |
| `party-profile-sheet.tsx:259-261` | `person?.status_raw ?? meta.sms_consent_status` | both repointed — correct |
| `use-field-activity.ts:48-55` → `field-desk.tsx:44-52` | `field_activity_summary.awaiting_reply_count` | repointed by 00621 §1, SQL test block 41 — correct |

No new "shipped or W2-planned reader shows a wrong verdict" found. The only
consent-adjacent fields that still read the frozen legacy columns directly are
the two DATES in `people_directory.meta` (`sms_consented_at`/`sms_opt_out_at`,
`use-coordination.ts:67-68,546-547` — the hook's own TYPE for a legacy write
payload, not a verdict reader) and the sibling-lookup inside
`useUpdateProjectParty`'s phone-correction guard
(`use-coordination.ts:698-708`, reads a SIBLING seat's `sms_opt_out_at` to
preserve its timestamp when writing fresh evidence — this is the r3 MAJOR-4 fix
itself, already covered by five hook tests per the fix log, and it is a read of
a date, not a verdict). Both are already named and owed to W1b/W2 in the report
(§5.3); neither is a reader printing a wrong word today.

Two open MINORs from the r4 ledger sit closest to this round's BLOCKING/MAJOR
line and were independently re-examined rather than taken on faith:

- **MINOR-9** (`resolveRecipient`'s phone-global positive reduction,
  `_shared/sms.ts:578-592`) — a phone-only call to `sendPartySms` would compute
  `recipient.consent` as the OR-across-every-tenant's-party-row `granted`, which
  combined with `!isInvite && !studioGranted && recipient.consent !== 'granted'`
  (`:824`) could let a send through for a studio whose own record has never
  granted anything, off ANOTHER studio's frozen seat. Traced every call site:
  `grep -rn "sendPartySms(" supabase/functions` finds exactly two non-test
  callers (`sms-dispatch/index.ts:360`, `site-request-dispatch/index.ts:154`),
  and both always pass `partyId` — which routes `resolveRecipient` down the
  single-party branch (`:562-575`), scoped to that one party's own row, not the
  phone-global reduction. **The phone-global branch is currently unreached by
  any live caller** — a real landmine for a future phone-only caller, correctly
  MINOR today, not escalated.
- **MINOR-4** (`p_origin_project_id` not org-checked, `00594:1519,2120,2261`) —
  could in principle stamp another tenant's project id onto this tenant's
  consent row (an FK, not an org check). `grep -rn "origin_project_id" apps
  packages` finds only generated-types plumbing and the one write site
  (`use-coordination.ts:480`) — **no shipped UI reads the column**, so there is
  no live cross-tenant DISPLAY of a foreign project's name today (R-Q's sentence
  is not built yet). Correctly MINOR, not escalated.

---

## 7. Type-checks

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(exit 0, no output)

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(exit 0, no output)
```

Both clean. No type break from the (no-drift) regenerated types.

---

## 8. Findings

| # | Severity | Confidence | Where | Claim | Note |
|---|---|---|---|---|---|
| F-1 | MINOR | high | `supabase/functions/fulfillment-po/core.ts:314` | `deno test --allow-all` (with type-check) over the whole `_tests` tree fails on an unrelated pre-existing Deno/std `encodeBase64` signature mismatch (commit `7c95cb0969`, 2026-07-17, also on `origin/main`) | Not introduced by W1a; blocks the literal instructed command from succeeding whole-tree. Worth a follow-up ticket outside this program |
| F-2 | MINOR | high | `supabase/functions/_tests/stripe-rail.test.ts:34` | Same whole-tree run (with `--no-check`) fails with `supabaseKey is required` — an unset env var in this shell/CI context, not a code defect | Unrelated to consent; recent Stripe-work commits, not this branch's |
| F-3 | MINOR | high | `supabase/functions/_shared/sms.ts:562-592` (MINOR-9, carried) | `resolveRecipient`'s phone-only branch still reduces consent positively across EVERY tenant's `project_parties` rows on a phone; if a future caller invokes `sendPartySms` with `phone` but no `partyId`, it could authorize a send for a studio with no consent record of its own, off another tenant's frozen seat | Re-verified unreached today: both live callers always pass `partyId`. Landmine, not a live hole — do not add a phone-only caller without fixing this first |
| F-4 | MINOR | high | 24 MINORs, `w1a-close-review-r4-migrations.md` (MINOR-1..18, A-G) | Left untouched by the r4 fix, as declared | Re-confirmed open by direct read, not re-derived from the log; none independently re-verified to exceed MINOR this round (F-3 and the `origin_project_id` item were the two closest and both check out as MINOR) |

No BLOCKING, no MAJOR.

---

## 9. Coordination note (not a code finding)

This task's brief states "W1b mints from 00621 upward" for the reserved-number
handoff. The DB and the report both show **00621 is already consumed by W1a's
own close-out repoint** (`00621_consent_readers_repointed.sql`,
`supabase_migrations.schema_migrations` head = `00621`), and the report's own
§8 says "W1b mints from **00622**." Flagging so whoever mints the next W1b
migration does not collide on 00621 — this is a stale number in the task framing,
not a defect in the branch.

---

## 10. Command log (raw, for the record)

Reset was NOT re-run this round (no code or migration changed since r4's own
clean reset at head `00621`; re-running was unnecessary and this wave is the
sole owner of the local stack, confirmed via `ps -Ao pid,ppid,command | grep -i
supabase.*reset` → no rows before starting). DB confirmed at head 00621 before
any probe:

```
$ psql ... -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 5;"
20260910152111
00621
00594
00593
00592
```

All other commands and their full output are inlined in §§2-7 above, pasted
from the actual run logs, not reconstructed.
