# W1a close-out — adversarial migration review, round 4

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `6afe098c6`
(`fix(consent): the readers nobody counted …`). Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod act of
any kind** — no `supabase db push`, no `supabase functions deploy`, no Strata
connection.

Read in full: `rulings.md` (all sections, R-A…R-AS), `synthesis/direction.md`
§2.2/§3.8/§7/§8, `synthesis/crm-model.md` §1/§2/§4/§5,
`briefing/current-state.md` §B–§E, `build/inventory.md`, `briefing/fixture.md`,
`build/w1a-report.md`, `build/w1a-close-review-r3-migrations.md`,
`build/w1a-close-review-r3-tests.md`, `build/w1a-close-fix-log-r3.md`,
`build/w1a-review-r10-tests.md`, and the four migrations the report names
(`00592`, `00593`, `00594`, `00621`) plus every function and edge module they
touch.

**Verdict: NOT clean — 1 BLOCKING, 2 MAJOR, 24 MINOR (17 carried, 7 fresh).**

All three of the non-minor findings are the SAME class the last two rounds
kept finding: **a caller that pre-filters on the frozen column, or on the
`status` column alone, in front of a gate that now reads the record.** Round 3
found three such readers (the Desk, the two dispatch triggers) and one cron;
this round finds the fourth (Patina Field's punch routing), the fifth (the
inbound rail's own START target filter — the one writer the whole design
depends on), and one place where the rail's `failed` flag is dropped on the
floor so a STOP can be acknowledged without being recorded.

---

## 1. What I ran

### 1.1 `.env.local` check, before any destructive local act

Sandbox disabled for this one read.

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

Local (127.0.0.1:54321). Not Strata. (The worktree has no `.env.local` of its
own; the repo root's is the one the dev server reads.)

### 1.2 Reset, twice

```
$ pnpm --dir .../agent-people-build supabase:reset      # pass A
RESET_A_EXIT=0
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
$ grep -icE "^error|failed" reset-a.log → 0
$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 3;"
20260910152111
00621
00594

$ pnpm --dir .../agent-people-build supabase:reset      # pass B
RESET_B_EXIT=0
Finished supabase db reset on branch main.
$ psql … → 20260910152111 / 00621
```

Both clean, head `00621`. (A third, earlier reset in this session was clobbered
mid-run by a *concurrent* `pnpm supabase:reset` from another agent in this same
worktree — PID 18227, `cd .../agent-people-build && pnpm supabase:reset`. The
DB replayed from 00309 up under me and one test run died with
`connection refused`. Passes A and B above were both run after that process
exited; noting it because the brief says this wave is the stack's sole owner
and it was not.)

### 1.3 SQL tests

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
PSQL_EXIT=0
44 blocks ": passed"  +  "All W1a assertions passed."
ROLLBACK

# the only ERROR|FAIL match is a block TITLE:
56:NOTICE:  16B. a DATELESS refusal fails closed too (r4 B-1): passed

NOTICE:  41. the Desk rollup counts the record's pending, not the frozen seat's,
         and agrees with the Call Sheet about the same person (close-out r3 MAJOR-1): passed
NOTICE:  42. the two 00284 dispatch gates reach a party the record granted, and still
         refuse an unasked, a refused and a non-field one (close-out r3 MAJOR-3): passed
```

Run after pass A and again after pass B — `PSQL_EXIT=0`, 44 passed, both times.

### 1.4 Replay / idempotency

Each migration re-applied inside its own rolled-back transaction:

```
--- replay 00592_people_cards_affiliations_rules --- REPLAY_EXIT=0  errors=0
--- replay 00593_studio_contact_channels        --- REPLAY_EXIT=0  errors=0
--- replay 00594_studio_channel_consent         --- REPLAY_EXIT=0  errors=0
--- replay 00621_consent_readers_repointed      --- REPLAY_EXIT=0  errors=0
```

00594's `SELECT public.backfill_channel_consent_from_parties();` re-runs on
replay and writes nothing new (`ON CONFLICT DO NOTHING`), and reaches no seat.

### 1.5 Legacy grants, generated types, Deno, package tests

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2644 replayed statements
$ diff -u <before> supabase/seed/00-legacy-grants.sql   → (no output)
$ git status --short supabase/seed/00-legacy-grants.sql  → (clean)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
GEN_EXIT=0
$ diff -u <before> packages/supabase/src/database.types.ts → (no output)   # no drift

$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 96 passed | 0 failed (143ms)
$ ls deno.lock → No such file or directory

$ pnpm --dir .../agent-people-build --filter @patina/supabase test
Test Files  100 passed (100)
     Tests  1253 passed | 12 skipped (1265)
```

So: the committed grants file and the committed types file are both already
correct for the shipped schema. Nothing I ran changed a tracked file.

### 1.6 My own probes (objects and access, and one fixture — never the ledger)

`/tmp/claude/probe-r4-a.sql` (objects) and `/tmp/claude/probe-r4-start.sql`
(the r8 W4-M1 fixture, in a rolled-back transaction). Output is pasted inside
the findings below.

---

## 2. Migration rules — pass/fail

| Rule | Verdict |
|---|---|
| hand-numbered `NNNNN_slug.sql` | **PASS** — `00621_consent_readers_repointed.sql` |
| 00595–00620 reserved for another program | **PASS** — nothing in that range; report says W1b mints from 00622 |
| grep-winner before redefining a function/view | **PASS** — `field_activity_summary` → `00282` (sole site), `fc_dispatch_court_assignment` / `fc_dispatch_task_assignment` → `00284` (sole sites). I diffed all three against their lineage: one expression changed each, everything else byte-identical (incl. both early returns, the party-kind filter, the fire-and-forget `BEGIN/EXCEPTION`, template key, vars, REVOKE) |
| banner + lineage | **PASS** — 00621:1-63 names both findings, both lineages with line ranges, the reason for the seat disjunct, the reason for the `COALESCE`, and the numbering note |
| idempotent | **PASS** — `CREATE OR REPLACE` ×3, restated GRANTs, no unrepeatable DDL; replay clean (§1.4) |
| RLS in the same file | **PASS/N-A** — 00621 adds no table; `field_activity_summary` stays `security_invoker` and is scoped by base-table RLS, the two trigger functions stay DEFINER with their triggers untouched (asserted, block 42) |
| explicit grants both directions + REVOKE FROM PUBLIC, anon on definer RPCs | **PASS** — probed ACLs: every one of the wave's definers is `postgres=X \| authenticated=X \| service_role=X` or narrower; **`anon` holds EXECUTE on none of them**; `_primary_studio_for` is still `postgres=X` alone |
| SECURITY DEFINER pins `search_path` | **PASS** — all nine wave definers carry `search_path=public` (one 00593 trigger fn pins `public, pg_temp`; carried MINOR-14) |
| schema-qualify extension fns | **PASS** — 00594/00621 call no extension function at all |
| guarded crons | **N/A** — none added |
| CHECK over enum for new vocab | **PASS** — `studio_channel_consent.status` / `channel_kind` / `source` / `opt_out_source` are all CHECKs, and the `opt_out_source` CHECK is also stated as a guarded `DO` block for the ALTER path |
| money integer cents | **N/A** |
| regenerate `seed/00-legacy-grants.sql` after any GRANT/REVOKE | **PASS** — regenerating produced a byte-identical file (§1.5) |
| apply with `supabase:reset` | **PASS**, twice |
| `db:generate` | **PASS** — no drift |
| SQL tests under `supabase/tests/people/` via psql | **PASS** — exit 0, 44 blocks |
| probe objects, never the ledger | **PASS** — my probes read `pg_proc`/`pg_class`/`pg_trigger`/`pg_policy` and one rolled-back fixture |

### The single-source consent model, point by point

| Claim | Verdict |
|---|---|
| no code path writes party `sms_consent_*` except the guarded legacy path | **QUALIFIED PASS.** No UPDATE path: `refuse_legacy_consent_write_trg` is `BEFORE UPDATE OF` all eight columns (probed: `is_before=t`, `is_update=t`), and the only opener is `app.consent_legacy_write='on'`, which nothing outside the SQL test sets (grep: 00594 + the test file only). The **INSERT** path is deliberately untouched and still writes the seat (`useAddProjectParty`, use-coordination.ts:495-499) — disclosed in §3, and load-bearing for 00432's invite trigger. A direct PostgREST INSERT can therefore still plant a seat at any status, incl. `granted`; that is PR-x's legacy leg, pre-existing, and the send gate refuses it whenever the record says `opted_out` |
| the send gate refuses on the record or on an org-scoped `opted_out` row | **PASS** — `channelConsentVerdict` (`_shared/sms.ts:448-556`): `failed`→refuse; `status='opted_out'`→refuse; `refusal_unanswered`→refuse; `orgHasOptedOutParty`→refuse; then `granted`→allow. `orgHasOptedOutParty` (:355-381) reads `opted_out` only, org-scoped, and refuses on an unattributable seat (R-AK/R-AL/R-AM hold). `sms-dispatch` delegates entirely to `sendPartySms` (index.ts:20, :360), so 00621's seat disjunct cannot put a text on the wire that the record refuses |
| START scope | **FAIL — see MAJOR-1.** `studiosHoldingRecord(from, ['opted_out','pending'])` (pipeline.ts:296, :732-734) filters on the `status` COLUMN, so the fold-minted `granted`/`not_asked` record carrying an unanswered refusal is not in the START target set at all. R-AJ's *narrowing* is correct; its *completeness* is not |
| evidence never nulled on the record | **PASS** — every `SET` leg is `COALESCE(NULLIF(btrim(…),''), scc.…)` or an explicit keep; reconsent's five are restated with their own `consented_at` (r9 M1); the four `opt_out_*` are touched only by a refusal, and never by reconsent. Blocks 10/18/23/32/33/35 assert it and pass |
| `v_project_roster` and `people_directory` read the record | **PASS** — probed: both views' definitions contain `channel_consent_status` and neither contains `pp.sms_consent_status`; `people_directory` still names `sms_consented_at` / `sms_opt_out_at` (the two DATES, disclosed §5.3, no shipped UI consumer — verified by grep) |
| RLS / grants | **PASS** — `studio_channel_consent`: RLS on, one SELECT policy `is_active_studio_member(organization_id)` for `authenticated`, ACL `authenticated=r` and nothing more, `service_role=arwdDxtm`, no `anon` at all. No INSERT/UPDATE/DELETE policy → the RPCs are the only doors. Block 37's org-isolation leg passes (a Beta member asking for Alpha's org reads NULL) |
| reset twice | **PASS** (§1.2) |

---

## 3. Prior findings re-checked

### From `w1a-close-review-r3-migrations.md` / `-tests.md`

| Finding | Now |
|---|---|
| MAJOR-1 (Desk rollup counts the frozen seat) | **FIXED.** `00621:71-97`; probed `field_activity_summary` definition: `reads_record = t`, `reads_seat = f`. Grafted faithfully from `00282:571-593` — I diffed it; only `awaiting_reply_count`'s predicate moved. Block 41 passes. Two new MINORs ride on it (MINOR-F, MINOR-G below) |
| MAJOR-2 (`field-daily` texts nobody the record granted) | **FIXED.** `channelConsentVerdict` exported (`_shared/sms.ts:448`), `mayTextField` (`field-daily/core.ts:59-71`) asks it, `parties_skipped` counts a refusal. 96 Deno tests pass. One fresh MINOR rides on it (MINOR-A: the DB-side narrowing is gone) |
| MAJOR-3 (00284's two dispatch gates) | **FIXED.** `00621:127-253`; both grafted from `00284:101-145` / `:160-203` with one condition each; `COALESCE(…, false)` is present and load-bearing; both stay DEFINER with `search_path=public` and `REVOKE … FROM PUBLIC, anon`; both triggers untouched. Block 42 passes |
| MAJOR-4 (phone correction transplants a frozen refusal) | **FIXED at the portal door.** `use-coordination.ts:750-753` throws `OPTED_OUT_PHONE_EDIT_SENTENCE`; the write is never issued. Population stated in §5.2. One fresh MINOR (MINOR-D: clearing the phone is refused too, unstated) |
| MAJOR-site-request-frozen-column | **DISCLOSURE SHARPENED**, as the finding asked. §5.1 now says `site_request_send` / `_resend` / `_dispatch_after_consent` can never succeed again and names the Capture file. Still W2's. **But the disclosure is still incomplete — see MAJOR-2 below** |
| MINOR-1 (mint leg writes a refusal into the grant's five) | **OPEN** — `00594:1723` still writes `p_source, p_evidence, v_now, p_disclosure_version, auth.uid()` unconditionally on the INSERT leg |
| MINOR-2 (`inbound_sms` short-circuits the r10 date test) | **OPEN** — `00594:388-393`, first disjunct unchanged |
| MINOR-3 (`refuse_legacy_consent_write` keeps `authenticated` EXECUTE) | **OPEN** — probed `authenticated=X/postgres`. Inert (a direct call raises `0A000`) |
| MINOR-4 (`p_origin_project_id` not org-checked) | **OPEN** — `00594:1519`, `:2120`, `:2261`; no org test on any of the three. Sharpened: the argument accepts ANOTHER tenant's project id, which lands in this tenant's row as an FK |
| MINOR-5 (`meta` mixes record verdict with seat dates) | **OPEN** — `00594:1292` beside `:1296-1297`. Re-confirmed no shipped consumer: a grep of `apps` + `packages` for `sms_consented_at`/`sms_opt_out_at` outside `use-coordination.ts`'s own writers returns nothing |
| MINOR-6 (non-inlinable definer call per row) | **OPEN** — `project_consent_org` is SECURITY DEFINER, so it is never inlined; `v_project_roster` calls it once per party row and `people_directory` twice |
| MINOR-7/8 (r2 MINOR-7/11) | **FIXED** (§5.2 states the cross-seat cost; block 39 exists) |
| MINOR-7 as re-numbered in r3 (`consent_awaiting_recipient` / `consent_not_recordable` reach the designer raw) | **OPEN** — `asWrittenConsentRpcError` (`use-coordination.ts:577-601`) maps four errors; neither of those two is among them, and both are reachable through `record_channel_invite`'s fall-through (probed: all three of `granted`/`pending`/invite return `consent_awaiting_recipient` on a W4-M1 record) |
| MINOR-8 (unparseable phone, unreadable key) | **OPEN** — `normalize_channel_value('sms','123')` falls back to the raw trimmed string (`00593:154-175`) while `project_parties.phone_e164` is NULL for the same input, so the record is keyed where no reader looks |
| MINOR-9 (`resolveRecipient` positive phone-global reduction) | **OPEN** — `_shared/sms.ts:578-592` unchanged; `reduceConsent` (:181-190) still returns `granted` off ANY tenant's row |
| MINOR-10 (a frozen `pending` seat + a bare YES) | **OPEN** — `pipeline.ts:766` unchanged |
| MINOR-11 (the add path re-invites a number the studio already holds a grant for) | **OPEN** — `record_channel_invite` correctly writes nothing, but `useAddProjectParty` still INSERTs the seat at `pending` with evidence (`use-coordination.ts:495-499`), so `fc_optin_invite_dispatch` fires and the opt-in SMS goes out anyway |
| MINOR-12 (`project_consent_org()` is an ungated definer oracle) | **OPEN** — probed `prosecdef=t`, `authenticated=X`, no membership check inside |
| MINOR-13 (the fold keys on the raw `phone_e164`) | **OPEN** — `00594:359`, `party_org` selects `pp.phone_e164` untouched |
| MINOR-14 (one 00593 function pins `public, pg_temp`) | **OPEN** — probed: `normalize_studio_contact_channel` → `search_path=public, pg_temp`; all eight siblings → `search_path=public` |
| MINOR-15 (the email seat gate scans `project_parties`) | **OPEN** — `00594:1627-1632` runs the phone scan for an email value too |
| MINOR-16 (a local reset never exercises the fold) | **OPEN, and measured.** After a clean reset: `select count(*) from studio_channel_consent` → **0**, and `select count(*) from project_parties where sms_consent_status <> 'not_asked' or phone_e164 is not null` → **0**. Every fold assertion rests on the test file's own fixtures; the first prod fold will be the first run over real data |
| MINOR-17 (report stale in four places) | **PARTLY FIXED, and newly stale in two** — §5.2 bullet 2 and §4's `refusal_unanswered` prose are both wrong about START (MAJOR-1), and §5.1/§8's Capture disclosure is incomplete (MAJOR-2) |
| MINOR-18 (`record_channel_invite` routes on `SQLERRM` text) | **OPEN** — `00594:2177-2180` |

### From `w1a-close-review-r2` / `-r1`

| Finding | Now |
|---|---|
| r1 BLOCKING-1 (STOP's record write unchecked) | **FIXED, and still fixed.** `pipeline.ts:487-506` destructures `writeError`, logs, sets `failed`, `continue`s; the STOP branch (`:694-716`) answers 500 / `opt_out_incomplete` and clears `twilio_sid`. Covered in the 96. **The sibling flag is still dropped — BLOCKING-1 below is the same rule at the call next door** |
| r1 MAJOR-1 (three inlined `_primary_studio_for` copies in the views) | **FIXED in the views.** `project_consent_org` at `00594:1010-1020`; the views call it at `:1086`, `:1282`, `:1294`; block 38 passes. Four inlined copies remain in the writers (fresh MINOR-E) |
| r1 MAJOR-2 (add-party leaves the room saying "Not asked") | **FIXED** — `record_channel_invite` called before the INSERT (`use-coordination.ts:464-482`) |
| r1 MAJOR-3 / F2 / F3 (raw Postgres error reaches the sheet) | **PARTLY FIXED** — `asWrittenConsentError` covers the freeze; two RPC errors still pass through raw (MINOR-7) |
| r1 MAJOR-4 (owed-work list incomplete) | **STILL INCOMPLETE** — this is MAJOR-2 and MINOR-B below. The list now names eight rails; there are at least ten |
| r1 F1 (the unattributable STOP fail-open) | **OPEN, awaiting Fable's ruling**, as §5.2 says. BLOCKING-1 below is a **different** mechanism on the same rail: not "no studio resolves" but "the resolution READ errored", which R-AM says is not the same fact |
| r2 MAJOR-1 (`pending` demotes a standing grant) | **FIXED** — `00594:1930` `AND NOT (EXCLUDED.status='pending' AND scc.status='granted')`; `consent_already_granted` named at `:1994-2006`; block 39 passes |
| r2 MAJOR-2 (readers print `granted` for an unsendable record) | **FIXED in SQL** — `channel_consent_status` at `00594:948-956` folds `refusal_unanswered` into the verdict; probed on the W4-M1 fixture: `status=granted, refusal_unanswered=t → reader_word=opted_out`. Block 40 passes. **The same "one reader, one verdict" fix was not applied to the rail's START filter — MAJOR-1** |

---

## 4. Findings

### BLOCKING-1 — an inbound STOP is acknowledged 200, with its idempotency claim kept, when the rail could not READ the studio a seat belongs to: the refusal is then never recorded for that studio and no retry ever comes

**Files:** `supabase/functions/sms-inbound/pipeline.ts:219-256` (`studiosHoldingPhone`
returns `Promise<StudioTarget[]>`; its own `failed` is logged at `:236-241`
and dropped at `:256`) and `supabase/functions/sms-inbound/pipeline.ts:694-696`
(the STOP branch's 500 gate), with `supabase/functions/_shared/sms.ts:308-340`
(`orgsOfProjects`, which is where `failed` is raised).

**Claim.** `orgsOfProjects` sets `failed: true` in two cases — the `projects`
read errored (`_shared/sms.ts:316-319`, and then the returned map is **empty**),
or `primaryStudioFor` errored for a `studio_id IS NULL` project
(`:334-336`). Its own docblock says why the flag exists: *"`failed` says a
lookup errored, so a caller can refuse rather than act on a map that is short
some entries (R-AM)"*. `studiosHoldingPhone` is that caller, and it does not
propagate the flag — it logs and returns a possibly-short array:

```ts
// pipeline.ts:227-241
const { orgs: orgOfProject, failed } = await orgsOfProjects(supabase, projectIds);
if (failed) {
  console.error("studiosHoldingPhone: some seats could not be attributed to a studio",
                { projectIds });
}
// …
return out;                                   // :256 — StudioTarget[] only
```

The STOP branch then asks three questions and not the fourth:

```ts
// pipeline.ts:694-696
if (stopPhoneParties.failed || stopRecordStudios.failed || stopWrite.failed) {
```

So a STOP whose studio attribution could not be READ takes the `200` /
`disposition: "opted_out"` path at `:716`, keeping the `twilio_sid`
idempotency claim from step (c) — which means Twilio's retry is answered
`duplicate` and the branch never runs again.

**Failure scenario (concrete).** Studio X adds a sub to a job with a phone and
"text updates" **unticked** — the ordinary case: `useAddProjectParty` writes a
seat at `not_asked` and `wantsText` is false, so `record_channel_invite` is
never called and **X holds a seat on that number and no consent record**
(`use-coordination.ts:464-499`). Studio Y texts the same number on its own job
and the recipient replies STOP. In the STOP branch, `loadPhoneParties`
succeeds (so `stopPhoneParties.failed` is false) and `studiosHoldingRecord`
succeeds (so its flag is false) — but the `projects` read inside
`orgsOfProjects` returns a transient error. The map comes back empty,
`studiosHoldingPhone` returns `[]`, and `withRecordOnlyStudios` fills in only
the studios that already hold a RECORD on the number. Y is covered (it has a
record). **X is not**: no seat-derived target, no record to union in, so
`writeChannelConsent` is never called for X, `stopWrite.failed` stays false,
and the STOP is acknowledged.

X's ledgers now both say the number is fine. The seat is frozen at
`not_asked`; there is no record. Later X ticks "text updates" for that sub:
`record_channel_invite` → `record_channel_consent(…, 'pending', …)` finds no
record (`00594:1637-1641`) and no `opted_out` seat in X (`:1626-1633`), so it
writes `pending`, the seat is born `pending`, `fc_optin_invite_dispatch` fires,
and `sendPartySms`'s gate returns `unknown` → `isInvite` + `consent==='pending'`
→ **the opt-in invite goes to a number that has replied STOP to the platform.**
On a 10DLC campaign that is the exact traffic that gets a campaign filtered.

**Why this is BLOCKING and not the already-disclosed §5.2 fail-open.** §5.2 and
r1's F1 describe a studio that *cannot be resolved at all* (`studio_id IS NULL`
+ a designer with no active `design_studio`). This is a studio that resolves
perfectly well on any other day; only the read failed. That distinction is
R-AM, stated in this wave's own rulings and enforced at five sibling call
sites — `resolveProjectOrg` (`sms.ts:286-289`), `orgHasOptedOutParty`
(`:366-369`), `channelConsentVerdict` ×3 (`:459-466`, `:475-481`, `:529-536`,
`:545-552`), `studiosHoldingRecord` (`pipeline.ts:284-290`),
`loadPhoneParties` (`:186-193`), and `writeChannelConsent`'s read AND write
(`:381-388`, `:496-504`). This one call site is the exception. It fits the
rubric's "an opt-out can be lost … without a newly recorded consent"
literally, and it is strictly worse than before this wave, because
`optOutAllForPhone()`'s phone-global party write used to stamp every seat on
the number regardless of whether any org resolved — that backstop was deleted
this wave and the seats are now frozen.

**Fix.** Two lines and a flag: return
`{ targets: StudioTarget[]; failed: boolean }` from `studiosHoldingPhone` and
add `stopTargets.failed` (or `stopPartyOrgs.failed`) to the disjunction at
`:694-696`, so the STOP answers `500` / `opt_out_incomplete` and releases the
claim exactly as it already does for the three flags beside it. The START and
YES branches want the opposite treatment and already have it — a short target
list there grants FEWER studios, which is the fail-closed direction, and the
comment at `:723-729` says so.

**Test owed.** A Deno test in the shape of the existing "a STOP whose consent-
record WRITE fails is not acknowledged, and the retry completes it": make the
`projects` select error, assert `500` / `opt_out_incomplete`, assert
`twilio_sid` cleared, assert the retry records every studio.

---

### MAJOR-1 — the recipient's own START (and YES) cannot reach a fold-minted record whose `status` is `granted` or `not_asked` while `refusal_unanswered` stands, so the one writer the whole design names never fires — and the report, the migration comment and the portal's own sentence all say it does

**Files:** `supabase/functions/sms-inbound/pipeline.ts:269-299` (`studiosHoldingRecord`'s
`onlyStatuses` filter, `:296`) and `:732-734` (the START target set), with
`:766` (the YES gate); against `supabase/migrations/00594_studio_channel_consent.sql:296-306`
(the `refusal_unanswered` column comment) and `:940-956`
(`channel_consent_status`, which folds the flag into the verdict).

**Claim.** `00594:655-666` mints, on purpose, records where
`status = 'granted'` and `refusal_unanswered = true` — the r8 W4-M1 shape, a
legacy seat reading `granted` while a sibling carries a dated opt-out no later
consent answered. `channel_consent_status()` correctly reads that record as
`opted_out` (r2 MAJOR-2). Every studio-side door correctly refuses it. The
design's whole answer for such a record is the recipient's own YES or START —
`00594:300-303` says the flag is *"cleared by ONE writer: the inbound rail's
own service_role write, made when the recipient replies YES or START"*, and
report §5.2 says the record is *"permanently unsendable **until the recipient
texts START**"*.

Neither reply reaches it:

- **START** targets `studiosHoldingRecord(from, ['opted_out', 'pending'])`
  (`:732-734`), and `:296` filters `onlyStatuses.includes(r.status)` — the raw
  `status` column. A record at `granted` (or `not_asked`) is not in the list.
- **YES** requires `parties.some(p => p.sms_consent_status === 'pending')`
  (`:766`) — a seat state no consent act can produce since the freeze, and on
  this fixture every seat reads `granted`.

**Probed, on the test file's own W4-M1 fixture, in a rolled-back transaction**
(`/tmp/claude/probe-r4-start.sql`; Alpha + three seats on `+16125550199`, two
clean grants and one `granted` seat carrying an unanswered `2025-11-16`
opt-out — the fixture at `w1a_identity_channels_consent_test.sql:203-214`):

```
 folded = 1

=== 1. the record the fold minted for Alpha / +16125550199 ===
 status  | refusal_unanswered | has_opt_out_date | reader_word
---------+--------------------+------------------+-------------
 granted | t                  | t                | opted_out

=== 2. the inbound START target filter (studiosHoldingRecord(from,[opted_out,pending])) ===
 studios_a_START_would_reach = 0

=== 3. the inbound YES gate (parties.some(p => p.sms_consent_status === 'pending')) ===
 seats_a_YES_would_act_on = 0

=== 4. every studio-side door, as an Alpha owner ===
 record_channel_reconsent         -> no_opt_out_to_supersede
 record_channel_consent(granted)  -> consent_awaiting_recipient
 record_channel_consent(pending)  -> consent_awaiting_recipient
 record_channel_invite            -> consent_awaiting_recipient
 record_channel_consent(opted_out)-> WROTE (no error)

=== 5. after the studio recorded the refusal, would a START reach it? ===
  status   | refusal_unanswered | a_START_now_reaches_it
-----------+--------------------+------------------------
 opted_out | t                  | t
```

**Consequence.** The number is unsendable for that studio for ever, fail-closed
(no unwanted text — this is not BLOCKING), and **there is no recipient-side
door at all.** The only door that exists is the undisclosed two-step in leg 5:
the studio records a refusal (`opted_out`, with a source and words it may not
actually have heard) purely to move the record onto a status a START can reach.
Nothing on any surface says so. What the surfaces DO say is the opposite — the
party sheet and the invite hook both print *"This number already opted out of
Patina texts. Only they can rejoin by replying START."*
(`use-coordination.ts:585`, `:870`) — so a designer passes that instruction to
a recipient, the recipient texts START, and nothing happens. `reconsent()`
is not even callable (`no_opt_out_to_supersede`), which is the one door §5.2
points at.

This is exactly the defect r2 MAJOR-2 fixed one layer down, unapplied one layer
up: **the rail's START filter reads the `status` column where the room reads the
verdict.** `channel_consent_status()` exists to be the single rule, and the
rail does not ask it.

**Fix.** Make the START target set select on the verdict, not the column:
`status = 'opted_out' OR refusal_unanswered = true OR status = 'pending'` in
`studiosHoldingRecord` (it already selects `status`; add
`refusal_unanswered`). That is one predicate, it keeps R-AJ's narrowing intact
(`not_asked` with no refusal is still untouched), and it makes the rail agree
with `channel_consent_status()` by construction. Then correct §5.2 bullet 2,
`00594:300-303` and the `channel_consent_status` comment.

**Test owed.** `sms-inbound.test.ts` has five START tests and none stages
`status='granted', refusal_unanswered=true`. Add it, plus the `not_asked` +
flag sibling.

---

### MAJOR-2 — Patina Field's punch routing pre-filters on the frozen seat, so every Field punch silently becomes the designer's own task and the trigger 00621 §2b just repointed at the record never fires

**Files:** `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/PunchTaskWrite.swift:98-106`
(`PunchCourtResolver.resolve`) and
`apps/mobile/Capture/Capture/Features/SiteRequests/SupabaseSiteRequestService.swift:16-18`
(`partyColumns`) + `:491-519` (`ProjectPartyRow.fieldParty`, the
`smsConsentGranted: consentStatus == "granted"` mapping at `:516`), against
`supabase/migrations/00621_consent_readers_repointed.sql:196-245`.

**Claim.** 00621 §2b repointed `fc_dispatch_task_assignment` at the record
precisely so a task assigned to a party the studio's record grants dispatches
again. The device never lets that trigger see the party:

```swift
// PunchTaskWrite.swift:98-106
public static func resolve(parties: [FieldPartyRef]) -> PunchCourt {
    guard let gc = parties.first(where: {
        $0.partyKind == punchCourtKind
            && $0.smsConsentGranted            // ← project_parties.sms_consent_status == "granted"
            && $0.phoneE164?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }) else { return .noCourt }
    return .reachable(gc)
}
```

`smsConsentGranted` comes off the frozen column and nothing else
(`partyColumns` = `"…,party_kind,sms_consent_status"`, `:18`;
`consentStatus == "granted"`, `:516`). Since 00594 no writer can move a seat to
`granted`, so for every GC added after this wave — however solid the studio's
`studio_channel_consent` grant — `resolve()` returns `.noCourt`. And by that
file's own ruling ("ruling 2 makes a partyless punch a plain task at tap
time", `LocalCaptureSyncService.swift:894-897`), a `.noCourt` punch is written
with `owner_party_id = nil`. `fc_dispatch_task_assignment` returns early on
`NEW.owner_party_id IS NULL` (`00621:205-207`), so:

- no `sms_court_assignment` text ever goes out for a Field punch;
- the punch does not land in the GC's court at all — it becomes the designer's
  own task;
- `field-daily`'s digest, which filters tasks by `owner_party_id`
  (`core.ts:230-233`), never lists it either;
- and `PunchCourtCopy.intent` (`PunchTaskWrite.swift:262-275`) shows the
  designer the no-court sentence at tap time, so the app is *consistent* about
  a wrong fact — which is why nobody will notice.

This is the same class as close-out r3 MAJOR-2 (`field-daily`'s
`.eq("sms_consent_status","granted")` pre-filter in front of the same gate),
one app over. The fix log's own rule for MAJOR-2 was *"a pre-filter that asks
the same function the send gate asks cannot drift from the authority"*; this
pre-filter cannot ask it at all, because it is on a device.

**What the report says, and what it misses.** §5.1 and §8 name
`SupabaseSiteRequestService.swift` `:17`, `:516`, `:524` and describe the
consequence as *"Patina Field's assignee picker will therefore show that badge
FALSE for ever"* — the site-request badge. The punch-routing consumer of the
same mapping is not named anywhere in §5.1, §5.1b or §8, and
`CaptureKit/Sync/PunchTaskWrite.swift` appears in no owed list. Since 00621 was
written specifically to make `fc_dispatch_task_assignment` reach the record,
shipping it while the only iOS producer of `owner_party_id` still gates on the
frozen column leaves the repoint inert on the Field path.

**Fix.** Either (a) add `smsConsentGranted` to §5.1b's owed W2 list beside
`SupabaseSiteRequestService`, explicitly naming `PunchCourtResolver` and the
`.noCourt` consequence, and state in §8 that Field punch routing is dead until
W2 — or (b) since Patina Field roster screens are in this program's scope
(rulings §6, iOS row), source `smsConsentGranted` from `v_project_roster`'s
`sms_consent_status` (which already carries the record's verdict) instead of
`project_parties`. (b) is one query change and the view is already granted to
`authenticated`.

---

### MINOR-A (fresh) — `field-daily`'s digest lost its DB-side narrowing, so it now reads every field party on the platform and can be silently truncated by `max_rows`

`supabase/functions/field-daily/core.ts:202-205`:

```ts
const { data: parties } = await supabase
  .from("project_parties")
  .select("id, phone_e164, project_id, display_name, party_kind, sms_consent_status")
  .in("party_kind", FIELD_KINDS);
```

The `.eq("sms_consent_status","granted")` that used to narrow this is gone
(correctly — that was MAJOR-2), but nothing replaced it at the DB. Two costs:

1. **Truncation.** `supabase/config.toml:18` sets `[api] max_rows = 1000`, and
   Supabase's hosted default for the same setting is also 1000. There is no
   `.order()` and no pagination, so once the platform holds more than 1000
   `gc/sub/installer/receiver` rows the digest silently considers an arbitrary
   1000 of them and the rest get nothing — not even a `parties_skipped`
   increment, since they never reach the loop. That is the same
   silent-shrink shape MAJOR-2 was raised for.
2. **Round trips.** `mayTextField` → `channelConsentVerdict` costs 1 `projects`
   read + 1 `studio_channel_consent` read, plus (whenever a record exists)
   `orgHasOptedOutParty`'s `project_parties` read + `orgsOfProjects`' `projects`
   read — 2 to 4 per party, now for EVERY field party rather than only the
   granted ones.

Fix: page the select (`.order("id").range(...)` in a loop), or keep a DB-side
prefilter that is record-aware — e.g. select the field parties of projects
whose org holds a `granted` record, unioned with pre-fold `granted` seats.
Either way count what a page boundary drops.

### MINOR-B (fresh) — a fourth SQL reader of the frozen column that no inventory names

`public.channel_value_was_on_sms_rail(text)` (`00593:209-229`) tests
`COALESCE(pp.sms_consent_status,'not_asked') <> 'not_asked'` on field-kind
seats. It is `service_role`-only (probed ACL: `postgres=X | service_role=X`)
and drives 00593's `sms_capable` backfill legs (a) and (c) (`:419`, `:440-443`).
It asks a HISTORICAL question, which is the one thing the frozen column is
legitimately kept for, so nothing is wrong today — the portal's INSERT still
births a seat at `pending`. But it is a reader of a frozen column, it is
absent from §2.3b ("three more SQL readers … that no round had counted") and
from §5.1b's table, and after W2 retires the portal's seat INSERT it will read
`not_asked` for every number whose consent lives only on the record, and
00593's backfill will then label those channels *"line type unconfirmed"*. One
row in §5.1b's table.

### MINOR-C (fresh) — a second same-source refusal splits the refusal's date from its words

`00594:1750` keeps `opt_out_at = LEAST(scc.opt_out_at, EXCLUDED.opt_out_at)` —
the earliest — while `opt_out_source` / `opt_out_evidence` /
`opt_out_recorded_at` (`:1823-1852`) take the NEW act's values whenever the
standing `opt_out_source` is anything but `inbound_sms`. So a studio recording
a second verbal refusal over its own first one leaves the record reading
`(verbal, "she told me again today", recorded today)` against an `opt_out_at`
from months earlier. That is the same "this act's words under that act's date"
family r6 R6-M2 closed in the fold and r9 M1 closed in `reconsent()`, arriving
through the refusal side. The r7 R7-M1 keep-leg only protects an `inbound_sms`
standing refusal. If the rule is "a duplicate refusal writes nothing" (as the
header at `:1809-1820` says), the keep-leg should fire whenever a refusal
already stands, not only when it says `inbound_sms`.

### MINOR-D (fresh) — an `opted_out` seat's phone can no longer be CLEARED, and §5.2 does not say so

`use-coordination.ts:750-753` throws on `phoneGenuinelyChanged &&
currentStatus === 'opted_out'`, and `phoneGenuinelyChanged` is true when the
next phone is `null` (`normalizePartyPhoneForCompare(null)` → `null` ≠ the
standing `+1…`). So a designer cannot remove a bad number from an opted-out
seat either — only rename, re-trade, re-email or re-point the rolodex link.
Fail-closed and arguably right (the number IS the refusal's subject), but the
fix log says only "clear included" and §5.2 says only that a *change* is
refused. Name it in the sentence or in §5.2.

### MINOR-E (fresh) — four inlined copies of the resolver the report calls "the one resolver"

`project_consent_org()` exists because r1 MAJOR-1 found three inlined copies of
`COALESCE(p.studio_id, _primary_studio_for(p.designer_id))`. Four remain, all
inside definers where the behaviour is identical: the fold (`00594:394`) and
`record_channel_consent`'s three seat tests (`:1630`, `:1906`, `:1974`).
Report §2.3 says the resolver is "the one resolver both views and every writer
answer from", which is not what the file does. Behaviourally harmless; it is
the drift surface r1 MAJOR-1 was about.

### MINOR-F (fresh) — `awaiting_reply_count` now needs the caller to be a studio member, not just a project team member

`field_activity_summary` is `security_invoker`, and `channel_consent_status()`
is INVOKER, so the count is filtered by `studio_channel_consent`'s policy
`is_active_studio_member(organization_id)` — which excludes guests and
non-members. A project team member who is not an active non-guest studio member
of the project's org now sees `awaiting_reply_count = 0` where they used to see
the real number. Fail-quiet under-count, consistent with the view's documented
`om`-join degrade posture, but 00621's `COMMENT ON VIEW` (`:99-108`) does not
mention the new dependency.

### MINOR-G (fresh, informational) — 00621 restates grants on a view `anon` already holds everything on

Probed local ACL after the reset:
`field_activity_summary` → `postgres=arwdDxtm | anon=arwdDxtm | authenticated=arwdDxtm | service_role=arwdDxtm`
(the pre-2026-05-30 creation-time default, reproduced by
`seed/00-legacy-grants.sql`). 00621:110-115 deliberately does not narrow it,
and says so. Behaviour today is safe — `SET ROLE anon; SELECT count(*) FROM
public.field_activity_summary` returns `0` because `projects` RLS hides every
row, so the definer call is never reached — but if a project ever became
anon-visible the call would 42501 rather than degrade to NULL, because
`project_consent_org` is revoked from `anon`. Worth one clause in the comment.

---

## 5. Things I checked that are clean (so the next round need not re-walk them)

- **No cross-tenant read or write through the wave's own objects.**
  `studio_channel_consent`: RLS on, one SELECT policy
  (`is_active_studio_member(organization_id)`, role `authenticated`), ACL
  `authenticated=r` / `service_role=arwdDxtm` / no `anon`, and no write policy —
  so the three RPCs really are the only doors. `studio_contact_channels`,
  `studio_person_affiliations`, `studio_contact_rules`: RLS on,
  `authenticated=arwd`, no `anon`. Block 37's isolation leg and block 38's
  resolver leg both pass.
- **Every wave definer is closed to `anon` and pins `search_path`** (probed
  `pg_proc.proacl` + `proconfig` for all 21 functions across 00592/00593/00594/00621).
  `_primary_studio_for` is still `postgres=X` alone.
- **The grafts are faithful.** I diffed `field_activity_summary` against
  `00282:571-593` and both dispatch functions against `00284:101-145` /
  `:160-203` line by line: one expression each, nothing else moved, both
  triggers deliberately not re-created (block 42 asserts they are still wired).
- **The freeze is complete on the UPDATE side.** `BEFORE UPDATE OF` all eight
  columns; the tuple comparison lets a whole-row restatement through; the only
  opener is a GUC nothing in `supabase/`, `packages/` or `apps/` sets outside
  the test file. The other three BEFORE triggers on `project_parties` touch
  none of the eight.
- **The mirror is gone.** Probed: `mirror_fn = 0`, `mirror_trg = 0`,
  `suppress_flag_readers = 0`; `fc_dispatch_optin_invite` and
  `_site_request_consent_granted_dispatch` carry their shipped bodies.
- **Both room readers read the record.** Probed `pg_views`: both contain
  `channel_consent_status`, neither contains `pp.sms_consent_status`.
- **No portal reader of the frozen column.** Every designer-portal consent read
  goes through the views — `roster-row.tsx:95` (`row.sms_consent_status` off
  `v_project_roster`), `people-derivation.ts:233` and
  `party-profile-sheet.tsx:259-261` (`status_raw` / `meta.sms_consent_status`
  off `people_directory`), `roster-derivation.ts:390` (vitals). Only
  `use-coordination.ts`'s own writers touch the column.
- **`sms-dispatch` cannot outrun the record.** It delegates to `sendPartySms`
  (`index.ts:20`, `:360`), so 00621's pre-fold-seat disjunct can cause a
  dispatch attempt but never a send the record refuses.
- **Generated types and the legacy-grants seed are already correct** —
  regenerating both produced byte-identical files.
- **Replay is idempotent** for all four migrations, including the fold.

---

## 6. What would make this clean

1. **BLOCKING-1**: propagate `studiosHoldingPhone`'s `failed` and add it to the
   STOP branch's 500 disjunction. One flag, one test.
2. **MAJOR-1**: make the START target filter ask the verdict
   (`status='opted_out' OR refusal_unanswered OR status='pending'`), then fix
   §5.2 bullet 2, `00594:300-303` and the `channel_consent_status` comment, which
   currently all promise a door that does not exist. Add the two missing START
   tests.
3. **MAJOR-2**: name `PunchCourtResolver` / `CaptureKit/Sync/PunchTaskWrite.swift`
   in §5.1b and §8 with the `.noCourt` consequence — or repoint
   `ProjectPartyRow` at `v_project_roster`, which already carries the record's
   word and is already granted to `authenticated`.
4. The seven fresh MINORs are cheap; take MINOR-A first (it is a live cron and
   the truncation is invisible), then MINOR-C (an evidence/date split in the one
   table that is now the only copy), then MINOR-B (one row in an inventory).
5. The seventeen carried MINORs are unchanged from r3's assessment; MINOR-16
   (the fold is never exercised by a local reset — measured: 0 rows, 0 seats)
   remains the one whose blast radius is the first prod fold.
