# W1a — final-run adversarial migration review, round 2

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod act of
any kind** — no `supabase db push`, no `supabase functions deploy`, no Strata
connection.

**Verdict: CLEAN.** Zero BLOCKING, zero MAJOR. The four non-minor findings of
round 1 (BLOCKING-1, MAJOR-1, MAJOR-2, MAJOR-3) are each closed, and I re-ran
the round-1 probes unchanged to prove it rather than trusting the fix log.
Sixteen MINORs follow; six of them are prose, and **the first one matters more
than its class**: `w1a-report.md` still describes the pre-fix code in six
places, and one of those places is the sentence a reader would use to decide
whether the site-request rail works end to end. It does not.

Reviewed in full: `00592`, `00593`, `00594`, `00621`, `00622`,
`supabase/functions/_shared/sms.ts`, `supabase/functions/sms-inbound/pipeline.ts`,
`supabase/functions/field-daily/core.ts`,
`supabase/functions/site-request-dispatch/{core,index}.ts`,
`packages/supabase/src/hooks/use-coordination.ts`,
`supabase/tests/people/w1a_identity_channels_consent_test.sql`, and the
lineage bodies in `00212` / `00281` / `00282` / `00284` / `00374` / `00419` /
`00432` / `00484` / `00589` that 00621 and 00622 graft from. Context read first:
`rulings.md` (all, R-A..R-AY), `direction.md` §2.2/§3.8/§7/§8,
`crm-model.md` §1/§2/§4/§5, `current-state.md` §B–§E, `inventory.md`,
`fixture.md`, `w1a-report.md`, `w1a-close-review-r6-{migrations,tests}.md`,
`w1a-final-review-r1-{migrations,tests}.md`, `w1a-final-fix-log-r1.md`.

---

## 0. An operating note that shaped this run: the local DB was NOT this wave's sole owner

The brief says "Local DB … this wave is its sole owner". It was not. Two
`supabase db reset` runs from another Claude session were in flight against
`127.0.0.1:54322` during this review and killed three of my own resets mid-
replay:

```
$ ps aux | grep "supabase db reset"
kody  2882  … @supabase/cli-darwin-arm64/bin/supabase db reset        (07:59)
kody  2878  … eval 'cd .../agent-people-build/supabase && supabase db reset …'
             … && pwd -P >| /tmp/claude-2739-cwd     ← another session's shell
kody  5930  … @supabase/cli-darwin-arm64/bin/supabase db reset        (08:04)
kody  5927  … eval 'cd .../agent-people-build/supabase && supabase db reset
             > /tmp/reset_final4.log …' && pwd -P >| /tmp/claude-f4b6-cwd
```

The symptoms were `LegacyMigrationApplyError: effect/sql/SqlError: Connection
error` at whatever migration happened to be replaying, and once
`CREATE EXTENSION IF NOT EXISTS vector → duplicate key value violates unique
constraint "pg_extension_name_index"` on a half-recreated container. **None of
them was a migration defect** — every clean-window reset replayed all 550
migrations with exit 0. I mention it because a reviewer who reported those as
"reset/replay failure = BLOCKING" would have been wrong, and the next round
should check for a concurrent CLI before believing a reset error.

---

## 1. What I ran

### 1.1 `.env.local`, before any destructive local act

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL \
    .codex/worktrees/agent-people-build/apps/designer-portal/.env.local
ugrep: warning: …/.env.local: No such file or directory   # the worktree has none
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
$ cat .codex/worktrees/agent-people-build/supabase/.temp/project-ref   # empty → local
$ psql … -Atc "select version from supabase_migrations.schema_migrations
               order by version desc limit 3"
20260910152111 / 00622 / 00621
```

### 1.2 Legacy grants, regenerated BEFORE the reset — and stable

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2655 replayed statements
$ diff -u <saved copy> supabase/seed/00-legacy-grants.sql | wc -l
0          # byte-identical: the fix log's 2655 is what the tree carries
```

### 1.3 Reset, twice, both clean

```
=== RESET A ===
RESET_A_EXIT=0
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
errcount=1      # the one "error" match is a FILENAME:
                #   Applying migration 00458_sms_message_error_capture.sql...

=== RESET B (second pass) ===
RESET_B_EXIT=0
550                       # "Applying migration" lines
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
db ready (post)
20260910152111 / 00622 / 00621 / 00594
```

### 1.4 SQL tests

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
PSQL_EXIT=0
passed_lines=48
NOTICE:  45h. a release that raises is a warning, not an aborted consent act
         (final-run MAJOR-3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

The only `ERROR|FAIL` matches in the whole log are two block TITLES and the
deliberate `WARNING: site request consent release failed for request
a1000000-…-c3: w1a probe: this release cannot be dispatched — the consent write
stands`, which is block 45h's own evidence.

### 1.5 Deno

```
$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 105 passed | 0 failed (142ms)

$ deno check --no-lock --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/field-daily/core.ts \
    supabase/functions/sms-inbound/pipeline.ts
Check … Check … Check …        CHECK_EXIT=0

$ deno test … supabase/functions/_shared supabase/functions/_tests
FAILED | 721 passed | 1 failed (2s)
# the 1 is pre-existing and unrelated: _tests/stripe-rail.test.ts throws
# "supabaseKey is required" at module top level (needs SUPABASE_SERVICE_ROLE_KEY /
# SUPABASE_ANON_KEY in the env). It imports nothing this wave touches.

$ ls deno.lock → No such file or directory
```

### 1.6 Generated types, package gates

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
GEN_EXIT=0
$ diff -u <saved copy> packages/supabase/src/database.types.ts | wc -l
0                                         # no drift

$ pnpm --filter @patina/supabase test        → Test Files 100 passed · Tests 1253 passed | 12 skipped
$ pnpm --filter @patina/supabase type-check  → tsc --noEmit, exit 0
$ pnpm --filter @patina/designer-portal type-check → tsc --noEmit, exit 0
```

### 1.7 Replay / idempotency — each migration in its own rolled-back transaction, on a DB already at 00622

```
--- replay 00592_people_cards_affiliations_rules --- EXIT=0 errors=0
--- replay 00593_studio_contact_channels          --- EXIT=0 errors=0
--- replay 00594_studio_channel_consent           --- EXIT=0 errors=0
--- replay 00621_consent_readers_repointed        --- EXIT=0 errors=0
--- replay 00622_consent_record_is_the_only_gate  --- EXIT=0 errors=0
```

### 1.8 My own probes (all committed under `build/`)

| Probe | What it asks |
|---|---|
| `probe52-final-r2-objects.sql` | objects and access only: the frozen-column sweep over `pg_proc.prosrc` and every view definition, definer/volatility/`search_path`/ACL for all 15 consent objects, `studio_channel_consent`'s RLS + policies + table ACL, every trigger on `project_parties` and `studio_channel_consent`, the eight column comments, the retired mirror |
| `probe53-final-r2-rail.sql` | the record-only rail walked end to end in one rolled-back txn: `site_request_send` on a no-record assignee, resend, `record_channel_invite` → grant → the release, a restated grant, the two 00284 dispatch gates on three populations, cross-tenant reads, the freeze + R-AX, and a service_role write that lowers the flag without naming `status` |
| `probe54-final-r2-send-gate.test.ts` | the brief's send-gate matrix: no record, `opted_out`, `granted`+unanswered, `pending`, `granted`, and a failed read — for an ordinary send AND for the opt-in invite |
| `probe56-final-r2-fold-rerun.sql` | is the fold still "side-effect-free to re-run", as its own COMMENT says? |
| `probe46-…`, `probe47-…` (round 1's, re-run unchanged) | the four prior non-minor findings |

---

## 2. Migration rules — pass/fail

| Rule | Verdict |
|---|---|
| hand-numbered `NNNNN_slug.sql` | **PASS.** `00621_consent_readers_repointed.sql`, `00622_consent_record_is_the_only_gate.sql`. 00595–00620 untouched; 00622 is the head; the report and 00621's banner disagree about where W1b mints (MINOR-8) |
| grep for the grep-winner before redefining, graft from that body | **PASS, and mechanically verified.** I extracted every redefined body from both the lineage file and 00622, stripped comments, and diffed. Every single diff line is the intended change and nothing else: `record_channel_consent` (the three inlined seat tests and their two DECLAREs, nothing more), `site_request_send` (the `not_asked → pending` seat write replaced by `channel_consent_status`), `site_request_resend` (one gate), `site_request_dispatch_after_consent` (one gate), `_site_request_consent_granted_dispatch` (the guard, the loop's FROM/WHERE, the wrapped call, `party_id` from the loop row), and the two 00284 gates (one gate each). No accidental drift anywhere |
| banner + lineage | **PASS.** 00622:1-104 names 00212/00281/00374/00419/00432/00484/00594/00621 and a WHY/NOT-CHANGED section. 00621:1-63 the same — but its body no longer matches its banner (MINOR-8) |
| idempotent | **PASS.** `CREATE OR REPLACE` throughout, `DROP TRIGGER IF EXISTS` before each `CREATE TRIGGER`, and §1.7 replays all five with exit 0 on a DB already at 00622 |
| RLS in the same file | **PASS / N/A.** 00622 creates and alters no table, and says so (00622:103-104). `studio_channel_consent`'s RLS is in 00594 with the table |
| explicit grants both directions + `REVOKE … FROM PUBLIC, anon` on definer RPCs | **PASS.** Every object 00622 redefines restates both. From probe52 §3: `record_channel_consent` / `site_request_send` / `site_request_resend` → `{postgres, authenticated, service_role}`; `site_request_dispatch_after_consent` and `_site_request_consent_granted_dispatch` → `{postgres, service_role}` (also revoked from `authenticated`); the two 00284 gates keep 00284's `REVOKE … FROM PUBLIC, anon` (and 00284's `authenticated=X` residue — MINOR-9) |
| `SECURITY DEFINER` pins `search_path` | **PASS.** All 15 consent objects show `search_path=public` in `proconfig`, definers and invokers alike |
| schema-qualify extension fns | **PASS.** No extension call is added by 00621/00622; the shipped `public.invoke_edge_function` wrapper is what both dispatch paths use |
| guarded crons | **N/A.** No cron is created or changed. `field-daily` (00284's 13:00 UTC job) is repointed in TypeScript only |
| CHECK over enum | **PASS.** `studio_channel_consent` uses `CHECK (channel_kind IN …)` / `CHECK (status IN …)` / two `CHECK (… source IN …)`; no new type |
| money integer cents | **N/A** |
| `generate-legacy-grants.py` re-run after any GRANT/REVOKE | **PASS.** §1.2 — byte-identical on a re-run, 2655 statements |
| `supabase:reset` twice | **PASS.** §1.3 |
| `db:generate` | **PASS, no drift.** §1.6 |
| SQL tests via `psql -v ON_ERROR_STOP=1 -f` | **PASS.** §1.4, 48 assertions |
| probe objects, never the ledger | **PASS.** `probe52` is catalog-only; `probe53`/`probe56` build their own fixtures inside `BEGIN … ROLLBACK` |

### RLS predicates the brief names

| Family | Predicate found |
|---|---|
| `studio_contacts` | `is_active_studio_member(organization_id)` (select/insert/update), `is_org_admin_or_owner` for the admin update. No DELETE policy and `authenticated=arw` — consistent |
| `studio_contact_channels` | `is_active_studio_member(studio_contact_org(owner_id))` × 4 |
| `studio_person_affiliations` | `is_active_studio_member(studio_contact_org(person_id))` × 4 |
| `studio_contact_rules` | the `subject_type` switch, `is_studio_comember(project_party_designer…)` on the engagement leg |
| `studio_channel_consent` | `is_active_studio_member(organization_id)`, SELECT only, `authenticated=r` only, `service_role=arwdDxtm`. There is deliberately no write policy: the three RPCs are the door |
| `project_parties` family | `is_studio_comember(p.designer_id)` on select/insert/update/delete, plus the shipped designer/self/team/coordination/client legs |

### Cross-tenant, probed directly (`probe53` block E)

```
NOTICE:  E1 Beta's roster word for Beta's seat on the SAME number = not_asked (must be not_asked)
NOTICE:  E2 Beta reading ALPHA's record = <null> (must be <null>)
NOTICE:  E3 rows Beta can see in studio_channel_consent = 0 (must be 0)
```

Alpha records `pending` then `granted` for `+16125550701`; Beta holds its own
seat on the same number. Beta's room prints `not_asked`, Beta reads NULL through
`channel_consent_status` for Alpha's org, and Beta sees zero rows in the table.
No cross-tenant read. No cross-tenant write: `studio_channel_consent` has no
INSERT/UPDATE/DELETE policy for `authenticated` and no write grant, and all
three RPCs gate on `is_active_studio_member(p_organization_id)` **before** any
read (`record_channel_invite` states it a second time for exactly that reason,
00594:2203-2207).

### The record-only model (R-AW / R-AY), point by point

| Point | Verdict |
|---|---|
| no gate, RPC, view, trigger or edge path reads `project_parties.sms_consent_*` **for a verdict** except the migration-time backfill | **PASS on the SQL side, PASS-with-two-named-carve-outs overall.** The catalog sweep (probe52 §1) returns **5** functions mentioning a frozen column, and only two of them read one at all: `backfill_channel_consent_from_parties` (the permitted reader, and 00594:763 calls it inside the migration) and `refuse_legacy_consent_write` (a write guard). `record_channel_consent`'s hit is a COMMENT (`prosrc` line 82, "…a NULL sms_opt_out_at deliberately"); `channel_value_was_on_sms_rail` is a service_role backfill helper asking "was this line ever on an SMS rail", not a consent verdict (MINOR-11); `fc_dispatch_optin_invite` is 00432 unchanged, the carve-out 00622:95-99 states on purpose. **No VIEW reads the seat's verdict**: `v_project_roster`'s only `sms_consent_status` occurrences are its own output ALIAS (`pg_get_viewdef` line 18: `COALESCE(channel_consent_status(project_consent_org(pp.project_id), 'sms', pp.phone_e164), 'not_asked') AS sms_consent_status`) and the team branch's `NULL::text`; `pp.sms_consent_status` matches **false**. `people_directory` keeps only the two DATES (§5.3, W1b). In TypeScript, `grep -rn "sms_consent_" supabase/functions` on non-test files returns comments plus exactly two evidence reads — `sendPartySms`'s opt-in-invite proof (`sms.ts:764-776`) and `seatConsentEvidence` (`pipeline.ts:397`) — both evidence, neither a verdict, and R-AN keeps the second |
| the send gate refuses on a missing record and on `opted_out` / `refusal_unanswered` | **PASS, probed for every seat state.** `probe54` P1: for a seat frozen at each of `not_asked`/`pending`/`granted`/`opted_out` with **no record**, the verdict is `refuse` and both the ordinary send and the opt-in invite return `{"sent":false,"reason":"opted_out"}`. P2: an `opted_out` record refuses the invite too. P3: `granted` + `refusal_unanswered` refuses. P5: a `granted` record sends over a seat frozen at `opted_out`. P6: a read that ERRORS refuses (R-AM) |
| START/YES scope (R-AU) | **PASS.** Both legs now filter through `recordVerdict()` (`pipeline.ts:340`, `:361-366`) — START at `pipeline.ts:838-846`, YES at `:879`. Round 1's own probe, re-run unchanged: `PROBE 3 YES disposition: project_chooser` (was `granted`), `PROBE 4` both records still `opted_out/true`, `PROBE 5 sendPartySms after the YES: {"sent":false,"reason":"opted_out"}` (was `sent:true`), and `PROBE X-STUDIO 'Y'` grants Beta while Alpha's refusal stands |
| STOP read-failure handling (R-AT / R-AW) | **PASS.** Five flags on one branch (`pipeline.ts:778-781`): `stopPhoneParties.failed`, `stopRecordStudios.failed`, `stopPartyOrgs.failed`, `stopPartyOrgs.unattributed`, `stopWrite.failed` → 500 / `opt_out_incomplete` with the `twilio_sid` claim released by clearing the column (not deleting the row). `writeChannelConsent` raises `failed` on a failed prior READ and on a failed UPSERT (`pipeline.ts:446-453`, `:552-569`). Eight shipped tests cover the matrix, including "a STOP on a project no studio can be resolved for is not acknowledged" and "the same STOP is acknowledged once a studio resolves". One population is outside it — MINOR-2 |
| site-request release through the record | **PASS, walked.** `probe53`: C1 the invite records `pending`; C2 **0** wake-ups on `pending`; C3/C4 the grant releases the parked request **once** (snapshot `granted`, one `site-request-dispatch` wake-up, one `consent-granted` outbox row); C5 a RESTATED grant releases **nothing** again; C6 resend now succeeds off the record (`action = resend`). A1–A4: `site_request_send` on a no-record assignee no longer raises, parks `awaiting_consent` with snapshot `not_asked`, leaves the seat at `not_asked`, and mints **0** records. The trigger is on `studio_channel_consent`, `AFTER INSERT OR UPDATE OF status`, `WHEN (channel_kind='sms' AND status='granted' AND refusal_unanswered IS NOT TRUE)`, and the old trigger is gone from `project_parties` (probe52 §5) |
| RLS / grants | **PASS** (above) |
| reset twice; every deno and SQL test passes | **PASS** (§1.3–§1.5) |

---

## 3. Round 1's findings, re-checked

**BLOCKING-1 — a bare `YES` / `Y` lifted a standing recorded STOP. FIXED.**
The fix took the review's preferred option: the gate itself is gone, not just
its target filter. `pipeline.ts:879` is `studiosHoldingRecord(supabase, from,
["pending"])`, verdict-filtered; `PhoneParty` and both party selects no longer
SELECT the frozen column at all (`pipeline.ts:178-193`, `:857-862`). Round 1's
probe, re-run unchanged, shows the refusal standing and the follow-on send
refused. Two shipped regression tests carry it ("a bare YES does not lift a
standing recorded STOP", "a Y answering one studio's invite leaves another
studio's recorded STOP standing"), and four pre-existing YES tests were
repointed onto the record with the seats left actively disagreeing.

**MAJOR-1 — R-AW was not implemented for the send path. FIXED.**
`sendPartySms`'s three legacy legs, `flushDeferredMessages`'s second check,
`Recipient.consent`, `reduceConsent()`, the `ConsentStatus` type and
`resolveRecipient`'s two `sms_consent_status` selects are all gone;
`mayTextField` is `verdict === "allow"` (`field-daily/core.ts:66-77`). The SQL
half the review named is paid too: `site_request_resend()` (00622:967) and the
two 00284 gates (00622:1064, :1129) are on the record alone. Round 1's probe:
`PROBE a verdict = allow | sendPartySms = {"sent":true,…}` — the G-3 sentence
closed.

**MAJOR-2 — the unattributable send was authorised by the frozen seat alone. FIXED.**
`PROBE c verdict = unknown | sendPartySms = {"sent":false,"reason":"not_consented"}`
(was `sent:true`). A frozen `granted` seat and a frozen `not_asked` seat on that
population now behave identically, which was the whole claim. What remains on
that population is the INVITE, and it is the escalated policy question, not this
finding — characterised exactly in MINOR-4.

**MAJOR-3 — the release trigger's bare call aborted the consent write. FIXED, both lines.**
The loop's JOIN carries `AND pp.project_id = sr.project_id` (00622:874) and the
call is wrapped (00622:897-903). SQL block 45h proves the wrapper with a raising
stub — the consent transition lands, the record reads `granted`, the request
stays parked, and the WARNING is in the output. `probe53` C3/C4 proves the happy
path still releases exactly once.

**Round 1's sixteen MINORs.** MINOR-6 (00621's seat leg) is closed by 00622 §6,
and MINOR-16(a)/(b)/(c) are closed by the new tests. The other twelve are still
open and are re-stated below with fresh evidence where I could get it.

---

## 4. Findings

### MINOR-1 — `w1a-report.md` describes the pre-fix code in six places, and the one that matters says the site-request rail works end to end when it cannot

The report is timestamped 07:09; the fixes landed at 07:56. It was not amended,
so the deliverable Fable reads to decide what W2 owes is wrong about what
shipped:

| Report | Says | Actually |
|---|---|---|
| `w1a-report.md:239` | "`reduceConsent()` survives because `resolveRecipient` uses it" | deleted; `resolveRecipient` selects `id, phone_e164, project_id, display_name` only |
| `:263` | field-daily, on `"unknown"`, "honour a `granted` seat exactly as `sendPartySms`'s own legacy gate still honours it" | `mayTextField` is `verdict === "allow"`; there is no seat leg |
| `:325` | "**The YES leg is still on the frozen seat** … owed to W2" | on the record's verdict since the BLOCKING-1 fix |
| `:365`, `:895` | "`site_request_resend()` is **NOT** repointed … still cannot succeed for a party created after 00594" | repointed, 00622:967-1005; `probe53` C6 shows it succeeding |
| `:392-403` | the §5.1b(b) table — rows 1 (`sendPartySms`'s legacy legs, "The last frozen-column reader in the send path"), 2 (`flushDeferredMessages`), 3 (`mayTextField`), 5 (the YES gate), 7 (00621's two gates), 8 (resend) | six of ten rows name readers that no longer exist |
| `:905` | "Owed: `sendPartySms` / `flushDeferredMessages` / `mayTextField`'s surviving PR-x second check … the inbound YES gate — W2" | paid |
| `:497` | the SQL suite is "4,765 lines" | `wc -l` = **6,323**; the Deno count "103 passed" is now 105 and "46 `: passed`" is now 48 |

**And the substantive one.** §8's "Paid this pass" reads:
*"`site_request_send()` no longer raises … A studio holding no record reads
not_asked and the request parks in awaiting_consent exactly as before"* and
*"A site request parked in awaiting_consent is released again"*. Together those
read as a working rail. They are each true and the pair is misleading, because
**nothing in this wave can move a parked request's assignee from `not_asked` to
`granted`**:

* `site_request_send` parks the request and enqueues a `consent-invite`
  (`probe53` A5 = 1 outbox row) — and that invite can never leave.
  `site-request-dispatch/core.ts:219-221` sends it as `sms_optin_invite` through
  `sendPartySms`, and `probe54` P1 shows the verdict for a no-record studio is
  `refuse` for **every** seat state, invite included:
  `invite={"sent":false,"reason":"opted_out"}`.
* the one portal act that could record the invite for an existing seat,
  `useRecordPartySmsConsent` (`use-coordination.ts:884-893`), raises
  `consent_legacy_column_frozen` — which the report DOES disclose, at §5.1b(c),
  three sections away from the §8 sentence.
* `record_channel_invite` has exactly one call site,
  `use-coordination.ts:473` — the ADD-party door. There is no door for a seat
  that already exists.

So the rail's happy path this wave is: add a NEW party with "text updates"
ticked → record + evidenced seat → invite → their YES → release. For a trade
already on the roster who was added without texting, "Send a site request"
parks for ever. That is **fail-closed and not a regression** — pre-00594 the
same consent-invite died at `consent_evidence_required`, because 00374's seat
write (`00374:1265-1269`) set `sms_consent_status` without any evidence column,
so neither `fc_dispatch_optin_invite`'s evidence gate (00432:37-42) nor
`sendPartySms`'s proof could pass it either. It is graded MINOR for that reason.
But the report should say it in one place, because "W1a MUST NOT SHIP ALONE" now
rests on it as much as on R-AV.

**Fix.** Amend §4, §5.1, §5.1b(b), §5.2, §6's counts and §8; add one sentence
under §8 "Still true": *a site request to a trade the studio has not asked parks
in `awaiting_consent` and stays there until W2 gives an existing seat a door to
`record_channel_invite`.*

### MINOR-2 — a STOP from a number Patina holds no seat and no record for is acknowledged 200 with nothing recorded anywhere

`pipeline.ts:726-736`: `loadPhoneParties` returns none, so `studiosHoldingPhone`
early-returns `{targets: [], failed: false, unattributed: false}`
(`pipeline.ts:252-255`), `studiosHoldingRecord` returns none, `stopTargets` is
empty, `writeChannelConsent` loops zero times and reports `failed: false` — and
all five flags are clear, so the branch answers `200 / opted_out`.

R-AT and R-AW's stated principle is "a refusal the rail cannot record is a
refusal it may not acknowledge", and this is a refusal the rail did not record.
The enumerated mechanism does not reach it: `unattributed` is raised by a SEAT
that resolves to no studio, and here there is no seat. The exposure is the shape
close-out r4 named one door earlier — a studio later adds that number with "text
updates" ticked, `record_channel_invite` finds no record and writes `pending`,
`fc_optin_invite_dispatch` fires, and `sendPartySms`'s verdict for that studio is
`unknown`, so Patina attempts an opt-in invite to a number that texted STOP to
the platform.

Graded MINOR because (a) it is identical to pre-wave behaviour —
`optOutAllForPhone()` wrote party rows and there were none to write — and (b)
Twilio's Advanced Opt-Out holds its own suppression list for the Messaging
Service, so the attempt is refused at the carrier (21610) rather than delivered.
Patina's own book simply never learns.

**Fix (if Fable wants the principle applied).** Either answer 500 /
`opt_out_incomplete` when `stopTargets` is empty (Twilio retries for ever,
which is worse), or — better — record the platform-level refusal somewhere that
is not a studio ledger, and have `record_channel_invite` consult it. That is a
new object and belongs in a ruling, not in a review. **No test covers this
population**; the nearest is "a STOP on a project no studio can be resolved for
is not acknowledged" (`sms-inbound.test.ts:1784`), which is the seat-exists case.

### MINOR-3 — the fold is no longer "side-effect-free to re-run", and its own COMMENT and the report both still say it is

00594's `COMMENT ON FUNCTION backfill_channel_consent_from_parties()` ends
(00594:758-761): *"Idempotent — ON CONFLICT DO NOTHING never overwrites a later
decision — and side-effect-free to re-run: it writes studio_channel_consent and
nothing else."* `w1a-report.md:211` repeats it: *"a re-run now sends nothing
because it reaches no seat at all."*

00622:927-935 puts an `AFTER INSERT … ON studio_channel_consent` trigger on that
table. `probe56-final-r2-fold-rerun.sql` — one project, one seat frozen at
`granted` with full evidence, one request parked in `awaiting_consent`, the fold
called on a database already at 00622:

```
NOTICE:  FOLD re-run: records minted = 1, site-request-dispatch wake-ups = 1
NOTICE:  FOLD re-run: consent-granted outbox rows minted = 1
NOTICE:  FOLD re-run: the parked request's snapshot is now = granted
```

So a re-run mints real durable dispatch work and one `pg_net` call per parked
request. It is service_role-only (`REVOKE ALL … FROM PUBLIC, anon,
authenticated`, 00594:720-722), which is why it is MINOR rather than MAJOR, and
the effect is arguably the *right* one — but two places state the opposite.

The mirror-image note, which nobody has written down: on the **first prod fold**
the trigger does not exist yet (00594:763 runs before 00622 replays), so a
request already parked whose folded record reads `granted` is **not** released
at cutover. The population is narrow (it needs a sibling seat on the same number
carrying the grant, since the parked request's own seat is by definition not
granted) but it is not empty.

**Fix.** Amend the COMMENT and `w1a-report.md:211`; optionally have 00622 call
`site_request_dispatch_after_consent` once over `awaiting_consent` requests whose
record already reads `granted`, or state that the cutover leaves them to the
lifecycle sweep.

### MINOR-4 — the one remaining send a frozen column still helps authorise: the opt-in INVITE on a studio-less project

Characterised precisely (`probe55`, three shapes on a project with
`studio_id IS NULL` and a designer holding no active `design_studio` membership):

```
S1 verdict = unknown  invite = {"sent":true,…}                      ← goes
S2 verdict = refuse   invite = {"sent":false,"reason":"opted_out"}   ← another studio's recorded STOP refuses it
S3 (seat carries no evidence) invite = {"sent":false,"reason":"consent_evidence_required"}
```

S1 is the §5.2 fail-open, and after the final-run fixes it is **invite-only**:
an ordinary send on that population now needs `allow` and gets `not_consented`.
What authorises S1 is `sendPartySms`'s evidence proof off the frozen seat
(`sms.ts:764-776`) plus a clean phone-global RECORD scan. It is fail-closed
against every refusal Patina holds (S2) and against a seat with no evidence
(S3), and it is the policy ruling the report escalates — not a code defect this
migration can close. Flagged only because **`w1a-report.md:465` still describes
it as a SEND** ("an unattributable send with a clean record scan still goes"),
which over-states it, and because no shipped test pins the invite leg on that
population.

### MINOR-5 — the two 00284 dispatch gates resolve the org from `NEW.project_id` while fetching the party by id with no same-project constraint, and this wave moved who controls that gate

`00622:1081` and `:1145` are `SELECT * INTO v_party FROM public.project_parties
WHERE id = NEW.court_party_id / NEW.owner_party_id` — no `AND project_id =
NEW.project_id` — while the consent test resolves the org from
`public.project_consent_org(NEW.project_id)`. There is no constraint tying the
pointer to the project: `pg_constraint` on `project_tasks` / `client_decisions`
shows only `FOREIGN KEY (owner_party_id) REFERENCES project_parties(id) ON
DELETE SET NULL`, and no trigger enforces it.

00284 asked the OTHER tenant's own seat column; 00621/00622 ask **the caller's
own studio's record**, which a studio member can self-assert for any phone value
through `record_channel_consent`. So the wave narrowed who has to agree for the
gate to open. It is still MINOR, not BLOCKING, for two reasons I verified rather
than assumed: the attacker needs another tenant's `project_parties.id`, which
RLS never shows them; and the send that follows is refused anyway, because
`resolveRecipient` keys the verdict on **the party's own** `project_id`
(`sms.ts:481-497`), so `channelConsentVerdict` asks the victim studio's ledger,
not the attacker's. The worst case is a wasted `sms-dispatch` invocation.

**Fix.** One token per gate: `AND project_id = NEW.project_id` on both SELECTs
(r6 MINOR-5, round 1 MINOR-5, still unchanged).

### MINOR-6 — live comments in 00594 now describe a model the code no longer follows

* `00594:811-820` — *"ONE CONSEQUENCE IS DELIBERATELY LEFT OPEN FOR W2, not
  closed here … a site request parked in awaiting_consent is no longer released
  by consent arriving. The site-request rail reads consent off the seat
  throughout"*. 00622 closed all of it.
* `00594:311-313`, inside `COMMENT ON COLUMN … refusal_unanswered` — *"The YES
  leg is NOT that door: it still gates on a project_parties seat at `pending`, a
  seat state no consent act can produce since the freeze, so it is owed to W2
  with the rest of the seat readers."* The YES leg reads the verdict now.

Both are the live object comments a future reader greps, so they are worth more
than the report's prose.

### MINOR-7 — 00621's banner contradicts 00621's own shipped body, and mis-states the next free number

* `00621:35-44` — *"THE GATE READS THE RECORD **OR** A PRE-FOLD SEAT THAT STILL
  SAYS granted. The disjunct is not hedging: sendPartySms … still honours a
  frozen seat holding a real pre-fold grant."* 00622 §6 deleted that leg from
  both gates and from `sendPartySms`.
* `00621:61-62` — *"W1b mints from 00622 upward."* 00622 exists; W1b mints from
  00623 (which `w1a-report.md` §5.3 and §8 get right).

### MINOR-8 — replaying 00594 alone, committed, on a database already at 00622 regresses `record_channel_consent`

00594:1581-2087 redefines `record_channel_consent` with the three inlined seat
tests 00622 removed, and 00622 is the later file, so a committed out-of-order
replay silently restores the pre-R-AW body (the graft diff in §2 is the exact
delta). The ledger prevents it on Strata; a local `psql -f` does not. Round 1's
MINOR-7, unchanged. My §1.7 replays are all inside `BEGIN … ROLLBACK` precisely
so they do not leave the database in that state.

### MINOR-9 — `authenticated` still holds EXECUTE on four trigger functions

From probe52 §3: `fc_dispatch_court_assignment()`,
`fc_dispatch_task_assignment()`, `fc_dispatch_optin_invite()` and
`refuse_legacy_consent_write()` all read
`{postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}`.
00622 restates 00284's `REVOKE ALL … FROM PUBLIC, anon` and stops there.
Inert — a plpgsql trigger function called outside a trigger raises on `TG_OP` /
`NEW` — but it is the only place in the consent family where a definer is
reachable by a client role, and `_site_request_consent_granted_dispatch()`
(also 00622's) is correctly revoked from `authenticated`. Round 1's MINOR-11.

### MINOR-10 — `project_consent_org` is an ungated definer oracle

`00594:1080-1094`: SECURITY DEFINER, `GRANT EXECUTE … TO authenticated`, no
membership check. Any authenticated caller can map any project UUID to its
studio UUID. It returns an org id, never a consent word, and
`channel_consent_status` stays INVOKER behind it, so nothing leaks about
consent — but the mapping itself is ungated. Round 1's MINOR-12.

### MINOR-11 — `channel_value_was_on_sms_rail` is the frozen-seat reader nobody counts

`00593:209-229` reads `COALESCE(pp.sms_consent_status,'not_asked') <> 'not_asked'`
on field-kind seats. It is 00593's `sms_capable` evidence test — "was this line
ever on an SMS rail", a fact about the line, not a studio's verdict — and it is
service_role-only (`REVOKE ALL … FROM PUBLIC, anon, authenticated`,
00593:231-233). Still: after the freeze, only the add-party INSERT can put a new
number into its scope, and a consent recorded through the RPCs alone never will,
so `sms_capable` will under-assert for record-only channels once W2 lands. The
report's §3 writer table and §5.1b lists still omit it. Round 1's MINOR-4, and
r6's MINOR-13 before that.

### MINOR-12 — the release loop is synchronous, unbounded, and one `pg_net` call per parked request, inside the consent transaction

`00622:859-918`. `record_channel_consent` and the inbound rail's upsert now both
carry the loop, and the durable half (`site_request_dispatch_after_consent`)
takes `FOR UPDATE` on `site_requests` and `project_parties` for each row. A
number with many parked requests makes one designer click, or one inbound START,
proportionally slow, and puts row locks on the site-request rail inside a
consent write. The wrapper added for MAJOR-3 means a failure is a WARNING, so
the risk is latency and lock contention rather than correctness. Round 1's
MINOR-13.

### MINOR-13 — a `pending` or `granted` seat's phone can still be moved through PostgREST, and only an `opted_out` seat's cannot

`probe53` F1/F2/F3/F4:

```
F1 an authenticated member writing the frozen status = consent_legacy_column_frozen
F2 moving an opted_out seat's number = consent_opted_out_phone_frozen
F3 an ordinary edit that names no frozen column = <no error, correct>
F4 moving a seat to another job = <no error>
```

R-AX covers the `opted_out` seat (00594:919-926). A phone-only `PATCH` on a
`pending` or `granted` seat names none of the eight, so the tuple comparison
passes and the second clause's `OLD.sms_consent_status = 'opted_out'` does not
apply: it lands. Under R-AW that is harmless — the record is keyed to the
number, not to the seat, and the seat carries no fact — and the portal hook
refuses it anyway because it tries to null the eight. Named only because the
freeze's column list reads as if it protects the number and it protects it for
one status. Round 1's MINOR-14. F4 is MAJOR-3's own premise, still allowed on
purpose.

### MINOR-14 — `flushDeferredMessages`'s invite leg has no evidence proof, unlike `sendPartySms`'s

`sms.ts:1034-1043`: a deferred row whose `template_key` is `sms_optin_invite`
passes on verdict `unknown` with no check of the seat's four evidence columns,
where `sendPartySms:757-776` requires them. Unreachable in practice — the row
only became `deferred` after `sendPartySms` had already proved the evidence
once, and frozen evidence columns cannot change afterwards — so this is an
asymmetry rather than a hole, and it predates the wave. Worth one line because
R-AH's whole point is that the two paths ask the same question.

### MINOR-15 — a reader who is not an active member of the owning studio prints `not_asked` for a record that says `opted_out`

`channel_consent_status` is SECURITY INVOKER on purpose (00594:975-1005) and
both views COALESCE its NULL to `not_asked`. A caller who can see the seat but
is not an active member of the resolved studio — a designer still named as
`projects.designer_id` after leaving the studio, or a project team member who is
not an org member — therefore reads `not_asked` where the record says
`opted_out`. This is the documented degrade posture, and it was deliberately
chosen over the old inlined copy's *confident wrong answer* (00594:1053-1078,
close-review r1 MAJOR-1). It stays MINOR rather than MAJOR because the write
door degrades identically (`record_channel_consent` raises
`not_a_studio_member`), so such a reader cannot act on the wrong word, and
because the send rail runs as service_role and never degrades. `anon` holds
creation-time `arwdDxtm` on all three views (pre-existing; 00621:113-116
deliberately declines to change it) but reads **0** rows — base-table RLS shows
it nothing, so the definer functions are never even evaluated:
`set role anon; select count(*) from field_activity_summary;` → `0`, no error.
Round 1's MINOR-4 in another form; I am naming it explicitly so Fable can
re-grade it, since it is the one place a shipped reader can print a word the
record contradicts.

### MINOR-16 — test-coverage gaps this round found

* No test for MINOR-2's population (a STOP from a number with no seat and no
  record anywhere → 200 with nothing written).
* No test that the fold re-run now mints dispatch work (MINOR-3);
  `probe56` is a probe, not a suite block.
* No shipped test pins the studio-less INVITE leg (MINOR-4 / `probe55` S1) —
  the nearest, "with no record and no resolvable studio, NO seat word authorises
  the send", covers ordinary sends only.
* `people_directory.meta.sms_consented_at` / `.sms_opt_out_at` (00594:1366-1367)
  still read the frozen dates. I checked the consumers: **nothing** in
  `apps/designer-portal/src` or `packages/supabase/src` reads either field, so
  the drift is latent, not visible. W1b's v4 rebuild (§5.3).

---

## 5. Things I checked that are clean, so the next round need not re-walk them

* **Graft fidelity, mechanically.** Every redefined body diffed against its
  grep-winner with comments stripped; all seven diffs are exactly the intended
  change (§2). This is the check I would most expect to find a defect in after
  eleven rounds of hand-grafting, and it is clean.
* **The two normalizers agree**, so the record's key and the seat's key cannot
  drift: `normalize_channel_value('sms'|'mobile', x)` and
  `normalize_phone_e164(x)` return identical values for
  `612-555-0701`, `+1 612 555 0701`, `6125550701`, `612.555.0701`,
  `1-612-555-0701`, `(612) 555-0701 x12` and `+44 20 7946 0958`.
* **The fold runs inside the migration** (00594:763), which is the load-bearing
  premise of R-AW's whole argument. `WHERE pp.phone_e164 IS NOT NULL` and
  `WHERE org IS NOT NULL` are the only seats it skips, and both are unsendable
  or unattributable by construction.
* **No reachable path INSERTs an `opted_out` seat**, so removing
  `record_channel_consent`'s seat-refusal gate has no exploit:
  `pg_proc` shows no function containing `INSERT INTO project_parties`, and the
  single TypeScript INSERT (`use-coordination.ts:487-499`) writes
  `wantsText ? 'pending' : 'not_asked'`.
* **`record_channel_consent`'s write gate**, re-derived leg by leg: `granted`
  over `opted_out` refused; `granted` over `not_asked`+flag refused; `granted`
  over a dated refusal with no flag and no later `consented_at` refused;
  `pending` over `granted` refused (`consent_already_granted`); no SMS verdict
  ever lowers `refusal_unanswered`; `opt_out_at` only ever moves EARLIER
  (`LEAST`); the refusal's four columns are never written by a non-refusal, and
  an `inbound_sms` refusal is never overwritten by a studio-sourced one.
* **`record_channel_reconsent`** is evidence-only, restates
  `status='opted_out'` and `refusal_unanswered=true`, and its gate is the
  UPDATE's own `WHERE` — no read-then-write window.
* **`record_channel_invite`**'s membership gate precedes its read, its
  standing-grant predicate is `record_channel_consent`'s refusal leg word for
  word, and its `EXCEPTION WHEN SQLSTATE 'P0001'` re-raises anything but
  `consent_already_granted`.
* **The release trigger cannot fan out or cross tenants**: the loop is over
  REQUESTS, and `public.project_consent_org(pp.project_id) = NEW.organization_id`
  pins the studio. `probe53` C4/C5 and block 8 hold both halves.
* **`site_request_dispatch_after_consent` is service_role-only and the trigger
  still reaches it**, because the trigger function is a definer owned by
  postgres — proved by C4 running the whole release as an ordinary
  `authenticated` studio owner.
* **A service_role write that lowers `refusal_unanswered` without naming
  `status` does not release** (`probe53` G2: verdict flips to `granted`, wake-ups
  = 0, the request stays `awaiting_consent`). No shipped writer does this —
  every PostgREST `upsert` and both RPCs name `status` — so it is not a finding,
  but it is the one shape the `UPDATE OF status` trigger cannot see.
* **`orgsOfProjects` / `primaryStudioFor` never call `_primary_studio_for`**
  (R-AM), check `error` at every call site, and return `failed` separately from
  a null org.
* **`writeChannelConsent`'s refusal never writes the grant's five columns**
  except on the mint, matching `record_channel_consent` leg for leg, and
  `opt_out_recorded_by` stays NULL on a rail write.
* **No `deno.lock` at the repo root**, and `deno check` passes on all three
  edited functions.

---

## 6. What would make this clean-and-complete rather than clean

1. **MINOR-1** is the only one I would hold the wave for, and it is an hour of
   prose: amend §4, §5.1, §5.1b(b), §5.2, §6 and §8 of `w1a-report.md` to the
   code that shipped, and add the one sentence naming the parked-site-request
   dead end under "Still true".
2. **MINOR-6 and MINOR-7** are four comment blocks in `00594` and `00621` — the
   live text a future grep will find first.
3. **MINOR-3**'s two sentences (the fold's COMMENT and `w1a-report.md:211`).
4. **MINOR-5** is one token per gate.
5. **MINOR-2** and **MINOR-4** are Fable's, not the migration's: the first needs
   a ruling on where a platform-level refusal lives, the second is the
   unattributable-invite policy question §5.2 already escalates.
