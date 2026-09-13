# W1b — final review, round 15: tests, types, behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `161ad683b` (r14's fix commit — see
`build/w1b-final-fix-log-r14.md`). Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), sole owner for this wave, confirmed
untouched by the hour-tracking session's port (`54422`) throughout.

**Verdict: CLEAN. Zero BLOCKING, zero MAJOR.** Every prior-round finding re-checked as fixed. Nothing
new found in tests, types, or behaviour. Two MINOR observations below, both pre-existing and already
disclosed in `w1b-report.md`/rulings, named here only because the brief asked for every finding.

## 0. Prior fix log (r14) re-checked

`build/w1b-final-fix-log-r14.md` claimed two fixes: BLOCKING-1 (the phone-freeze trigger asking the
frozen column instead of the record) and MAJOR-1 (the reach word crossing the tenant boundary). Both
re-verified fixed, live in the code, not merely claimed:

- **BLOCKING-1.** `supabase/migrations/00594_studio_channel_consent.sql:943` — the freeze clause reads
  `channel_consent_status(project_consent_org(OLD.project_id),'sms',OLD.phone_e164) = 'opted_out' OR
  OLD.sms_consent_status = 'opted_out'` (record leg first, column kept as a second leg per the fix
  log's own reasoning). The trigger body is `SECURITY DEFINER` (confirmed live, see §2 below).
  `packages/supabase/src/hooks/use-coordination.ts:684-801` — `useUpdateProjectParty` reads
  `currentRow.sms_consent_status`, asks `project_consent_org` then `channel_consent_status` for the
  number on file, and throws `OPTED_OUT_PHONE_EDIT_SENTENCE` on `opted_out`, with `currentStatus ===
  'opted_out'` kept as the second leg (lines 800-801). Matches the fix log exactly.
- **MAJOR-1.** `supabase/migrations/00626_people_directory_v4_seats.sql:708-714` and `:857-863` — both
  `reach_state_for_identity` sites carry the `JOIN public.projects pj` plus the four-line tenant
  predicate the fix log describes, verbatim in both places.
- Both re-run live: W1a suite block 46 and W1b suite block 24 assert exactly these fixes (see §1).

## 1. Both SQL suites, run fresh against a clean reset

```
$ cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm supabase:reset
... (all migrations 00590-00594, 00621-00627, 20260910152111 applied; all seeds incl.
     supabase/seed/people_crm_dev.sql loaded)
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
# the only line matching /error/i in the whole run is the migration FILENAME
# "Applying migration 00458_sms_message_error_capture.sql..." — same as the report's own claim

$ psql ... -At -c "select string_agg(version,' ' order by version) from supabase_migrations.schema_migrations where version >= '00620';"
00621 00622 00623 00624 00625 00626 00627 20260910152111

$ psql ... -At -c "select count(*) from studio_compliance_documents;"   -> 36
$ psql ... -At -c "select count(*) from project_site_access_cards;"    -> 1
```

**One environment wrinkle, not a code defect:** mid-review, a duplicate `pnpm supabase:reset`
invocation raced my own (retried once by the harness after an initial sandbox EPERM on the Supabase
telemetry file — nothing to do with this codebase) and recreated the `supabase_db_supabase` container
twice, producing a transient `server closed the connection unexpectedly`. Once the second reset finished
on its own (`RESET2_EXIT=0` in its log) the DB was stable for the remainder of the review and every
result below is from that stable state, re-run to confirm. Flagging only so the "reset/replay failure"
category isn't left ambiguous: the reset itself never failed when run once; the failure I saw was two
concurrent resets fighting over the same container.

```
$ psql ... -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0
NOTICE:  46. the opted_out phone freeze asks the RECORD, ... (r14 BLOCKING-1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
# 46 numbered blocks, all "passed"; re-run a second time on the same stable DB, identical result

$ psql ... -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0
NOTICE:  24. the reach word reduces over exactly the seats the row nests ... (r14 MAJOR-1): passed
NOTICE:  All W1b assertions passed.
ROLLBACK
# 24 numbered blocks, all "passed"; re-run a second time, identical result
```

Both suites are larger than `w1b-report.md` §7 describes (12 W1b blocks in the report vs. 24 live) —
expected, since rounds r7-r14 added blocks 13-24 for their own findings after the report was written.
All 24 are green.

## 2. Role probes — designer, client, anon

As `designer@patina.dev` (`a0000000-0000-0000-0000-000000000004`, studio
`b0000000-0000-0000-0000-000000000001`), via `SET LOCAL ROLE authenticated` +
`request.jwt.claims`:

```
 people_directory rows | 62        directory_seats | 31
 compliance_documents  | 36        authority_grants | 11
 site_access_cards     | 1         v_access_grants  | 13
```

As `client@patina.dev` (`a0000000-0000-0000-0000-000000000005`), same mechanism:

```
 people_directory rows | 0         directory_seats | 0
 compliance_documents  | 0         authority_grants | 0
 site_access_cards     | 0         v_access_grants  | 0
```

**A client role reads zero rows from `project_site_access_cards`** — PR-w holds. Confirmed both inside
the combined probe and standalone:

```
=== CLIENT: project_site_access_cards ===
 count
-------
     0
```

As `anon` (`SET LOCAL ROLE anon`), every one of the wave's tables/views individually:

```
project_site_access_cards    -> ERROR: permission denied for table project_site_access_cards
studio_compliance_documents  -> ERROR: permission denied for table studio_compliance_documents
project_party_authority      -> ERROR: permission denied for table project_party_authority
people_directory             -> ERROR: permission denied for table studio_contacts
                                 (view has a stale local-only anon SELECT grant per w1b-report.md §7's
                                 "one pre-existing artefact, not mine" note — security_invoker means the
                                 underlying table's grant is what actually gates it; confirmed live)
people_directory_seats       -> ERROR: permission denied for view people_directory_seats
v_access_grants              -> ERROR: permission denied for view v_access_grants
```

No cross-tenant or anon leak anywhere in the wave's surface.

## 3. Fixture identities — F-11, F-12, F-16, F-27 — read as `designer@patina.dev`

```sql
SELECT display_name, role, reach_state, consent_status, paper_state, contact_rule_summary, seat_count
FROM people_directory WHERE display_name IN ('Dana Kowalski','Pete Rusk','Amara Osei','Ray Thao');
```

```
 display_name  |  role   | reach_state | consent_status | paper_state |            contact_rule_summary             | seat_count
---------------+---------+-------------+----------------+-------------+----------------------------------------------+------------
 Amara Osei    | contact | on_paper    | granted        | lapses_soon |                                              |  1
 Dana Kowalski | contact | field_link  | granted        | lapsed      |                                              |  2
 Pete Rusk     | contact | field_link  | opted_out      | current     |                                              |  2
 Ray Thao      | contact | on_paper    | not_asked      | not_on_file | Never text. Use: email, office, portal_311.  |  1
                                                                          Hours: Weekdays 08:00 to 16:00.
```

Checked against `briefing/fixture.md`:

- **F-11 Dana Kowalski / Northgate Electric** — fixture: reach "field link", consent "granted", COI
  "exp 2026-03-31, LAPSED". DB: `field_link` / `granted` / `lapsed`. **Matches.**
- **F-12 Pete Rusk / Rusk Mechanical** — fixture: reach "field link", consent "opted_out (replied STOP
  on the 2025 Lindqvist thread...)", COI current (exp 2027-01-15). DB: `field_link` / `opted_out` /
  `current`. **Matches R-BH** ("Pete Rusk holds his field link" though opted out of texts — reach and
  consent are independently correct, not conflated).
- **F-16 Amara Osei / Lakeshore Painting Co.** — fixture: reach "on paper (would be account if the FK
  were set)", consent "granted (web form, 2026-10-14)", paper via her firm (Lakeshore's COI is seeded
  `CURRENT_DATE + 23` on purpose per `w1b-report.md` §6). DB: `on_paper` / `granted` / `lapses_soon`.
  **Matches**, including R-BA's worst-first reduction over the person's own docs AND her firm's.
- **F-27 Ray Thao / City of Minneapolis, CPED Inspections** — fixture: reach "on paper", "office" phone,
  never texted, n/a consent, no paper owed (AHJ). DB: `on_paper` / `not_asked` / `not_on_file`, rule
  "Never text. Use: email, office, portal_311. Hours: Weekdays 08:00 to 16:00." **Matches** — the raw
  `not_on_file` fact is correct (R-A/R-N's "print no paper word for an inspector" is a display rule the
  view is explicitly not responsible for; SQL block 12g in the W1b suite pins that split).

All four match the fixture's own words exactly.

## 4. Independent cross-check: every reader vs. the record (probe300 / probe301)

Two probe files already staged in `build/` (`probe300-r15-posture.sql`, `probe301-r15-readers-vs-record.sql`)
were run in full — a second, independent verification path beyond the SQL suite and the four
hand-picked identities above:

```
-- contact rows whose consent word <> identity_consent_status recomputed --
 mismatches: 0

-- identity paper word vs its own seat lines --
 paper_disagreements: 0

-- identity consent word vs its own seat lines (where the seat has a word) --
 (0 rows — no disagreement found)

-- rows claiming a seat_count they cannot nest --
 bad_counts: 0

-- anyone whose Directory word says granted/not_asked/pending while ANY of their numbers
   is opted_out in the record --
 (0 rows)
```

Every contact row in the seeded fixture agrees with an independently recomputed verdict, agrees with
its own seat lines, and no identity's `seat_count` exceeds what `people_directory_seats` actually nests
for it. `v_access_grants` posture (§A of probe300): all four grant-closed sources readable without
raising, `code_like_columns = 0` on the site access card (PR-r), the freeze trigger names exactly the
ten frozen columns and none of 00624's new ones (§H), no `SECURITY DEFINER` routine this wave adds is
missing a pinned `search_path` (§F's list is all pre-existing, unrelated functions).

## 5. Generated types and type-check

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir .../agent-people-build db:generate
GEN_EXIT=0

$ git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty)

$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
SUPABASE_TC_EXIT=0

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
DESIGNER_TC_EXIT=0
```

No type breaks. The regenerated types are byte-identical to what's committed, confirming no drift.

## 6. Readers of `people_directory` / `v_project_roster` — swept fresh

```
$ grep -rln "people_directory" apps packages --include="*.ts" --include="*.tsx"
$ grep -rln "v_project_roster" apps packages --include="*.ts" --include="*.tsx"
```

Matches the reader set r13/r14 already enumerated (`w1b-final-review-r13-tests.md` §7,
`w1b-final-review-r14-tests.md` §7), no new file surfaced. Two items inspected further, both
resolving to already-settled/already-disclosed ground rather than a new finding:

- **`packages/supabase/src/components/document/roster/roster-row.tsx:101`** — `const consent =
  row.sms_consent_status;` reads `ProjectRosterRow` (`v_project_roster`). Confirmed live —
  `pg_get_viewdef('v_project_roster')` line 19 — that this column is
  `COALESCE(channel_consent_status(project_consent_org(pp.project_id),'sms',pp.phone_e164),
  'not_asked')`, i.e. the record's verdict, not the frozen seat column (R-AS/R-AV, W1a's work, already
  tested by W1a blocks 37/38/40). Not a W1b concern, and not disagreeing with the record.
- **`apps/designer-portal/src/components/document/people/directory/person-row.tsx:95`** —
  `{isFieldRosterRole(person.role) && <ConsentChip status={person.status_raw} />}`. `FIELD_ROSTER_ROLES`
  (`packages/supabase/src/hooks/use-people.ts:41-46`) is `['gc','sub','installer','receiver']` — it does
  not include `'contact'`. Post-v4, every carded human's `role` is `'contact'`
  (`w1b-report.md` §4.4's own statement), so this gate is false for all of them and the chip would never
  render for a carded person in `PersonRow`. Traced further: **this is moot in practice**, because
  `apps/designer-portal/src/components/document/people/views/directory-view.tsx:294` already excludes
  every `role === 'contact'` row from every `PersonRow`-rendered feed entirely (`list = data.filter(p =>
  p.role !== 'contact')`), a pre-existing "Wave 4 hardening" decision predating W1b (module doc at
  `directory-view.tsx:19-43`: *"A dedicated 'kind chip' for standalone person contacts is future
  [work]"*). So carded field people don't lose a chip — they're absent from the Directory's `PersonRow`
  list entirely until W2 builds the mixed list (PR-g). This is **exactly** the consequence
  `w1b-report.md` §4.4 already names in its own words ("the room will read oddly ... No flag exists to
  hide it (rulings §6)") and that rulings §6 (Program rulings, Kody, 2026-09-11: "Rollout: 100% at
  deploy, no flag") explicitly ships anyway. **Confirmed, not a new finding** — already disclosed in the
  report and covered by an explicit program ruling, not concealed. Noted here only because no prior
  review round had traced the exact mechanism (`isFieldRosterRole` + the Wave-4 `role !== 'contact'`
  filter) down to these two lines.

No reader shows a verdict that disagrees with the record. No new reader gap found.

## 7. Findings

None reach BLOCKING or MAJOR. Two MINOR observations, both pre-existing/disclosed, included for
completeness per the brief's "report every finding" instruction:

| # | Severity | Confidence | File | Claim |
|---|---|---|---|---|
| M1 | MINOR | High | `apps/designer-portal/src/components/document/people/directory/person-row.tsx:95` | `isFieldRosterRole(person.role)` never gates open for a carded human post-v4 (role is always `'contact'`), but this is moot — `directory-view.tsx:294` already excludes `role==='contact'` from the feed entirely, a pre-existing Wave-4 decision. No new behaviour; matches `w1b-report.md` §4.4's own disclosure and rulings §6's "ship at 100%, no flag" ruling. Fix, if any is wanted before W2, belongs to W2's mixed-list build (PR-g), not to W1b. |
| M2 | MINOR | Medium | `artifacts/people-room-crm-2026-09-11/build/probe300-r15-posture.sql:93` | The script's final `SET LOCAL role postgres` sits outside any `BEGIN`/transaction block, so it warns `SET LOCAL can only be used in transaction blocks` and silently no-ops (confirmed: re-run wrapped in an explicit transaction returns different, correct numbers). Cosmetic — a review-tooling script, not shipped code; re-run manually wrapped in `BEGIN;...ROLLBACK;` for §4's numbers above. |

## 8. What this round did not re-litigate

Per the task's settled list, none of the following were treated as findings (all rulings.md §3):
R-BD/R-BI's studio-less-project duplicate-identity residue, R-BE's party-profile-sheet W2 repoint (its
interim `{person ? <ConsentChip .../> : null}` guard spot-checked present and unchanged at
`party-profile-sheet.tsx:512`), R-AY's record-only consent posture, R-AZ/R-BA/R-BF's compliance-state
reduction rules, R-BG/R-BJ's seat-count and paper-state precedence rules — all exercised and passing via
the SQL suite (§1) and the independent cross-check (§4), none reopened.

## 9. Commands run, for the record

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/tests/people/w1a_identity_channels_consent_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build db:generate
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build diff --stat \
  packages/supabase/src/database.types.ts
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
  --filter @patina/supabase type-check
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
  --filter @patina/designer-portal type-check
```

No prod mutation of any kind. No `supabase db push`, no `supabase functions deploy`, no `wrangler`.
Migration ledger unchanged by this review: `00623`-`00627` stand, `00595`-`00620` untouched and
reserved, next mint for any future wave is `00628`.
