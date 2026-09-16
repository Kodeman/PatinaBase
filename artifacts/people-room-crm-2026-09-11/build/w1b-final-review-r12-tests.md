# W1b — final review round 12, tests / types / behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `7b4707d8e` ("fix(people-crm): w1b r11 —
the solo designer keeps her own job's seats, the Directory counts seats once, and
the identity key asks the record"). Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); nothing touched on
Strata. This is round 12 of the tests/types/behaviour lane; its immediate
predecessor is `w1b-final-review-r11-tests.md` (HEAD `e2ab4d523`, before the r11
fix commit landed). Prior fix log re-checked: `w1b-final-fix-log-r11.md` (M1/M2/M3).

**Operational hazard hit mid-review, not a code finding, same shape as r11-tests'
own note**: partway through this round a `psql` read against the live DB
returned an 11-column `people_directory` (pre-v4 shape) and a separate read at
the same moment answered `select version … order by desc limit 3` with
`00017/00016/00015` — a completely different, much older local state — while
`docker ps` showed `supabase_db_supabase` freshly restarted (~3s uptime,
`health: starting`). A few seconds later the same queries answered correctly
(555 migrations, `00627`/`20260910152111` head, full 17-column view). Every
finding below was re-verified against a freshly re-confirmed migration head
**after** this was caught, so nothing here rests on the bad read. This is the
second round in a row this exact hazard has fired on the "sole owner"
127.0.0.1:54322 assumption — flagged again for Kody, more strongly this time:
r11-tests called it "most likely a settling replica read"; seeing it twice
across two separate rounds is starting to look like a real second actor
touching this port, not a one-off race.

---

## 1. Every SQL test under `supabase/tests/people`, fresh state confirmed first

```
$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 8;"
20260910152111
00627
00626
00625
00624
00623
00622
00621
$ psql … -At -c "select count(*) from supabase_migrations.schema_migrations;"
555
```

(A full `pnpm supabase:reset` was not re-run this round — the ledger above was
independently confirmed twice, after the mid-review scare, at the full 555-row
count with `00627` head, which is the exact post-reset state r11-tests itself
last confirmed. Re-running every SQL suite against this confirmed state:)

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  45h. a release that raises is a warning, not an aborted consent act (final-run MAJOR-3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
EXIT=0

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
...
NOTICE:  18. 00627's four DEFINER readers on a studio-less job: … (r9 BLOCKING-1): passed
NOTICE:  19. the supersede is re-reckoned at every READ: … TRANSITIVE … (r9 MAJOR-1, r10 MAJOR-1): passed
NOTICE:  20. studio_contact_id is guarded like the rest of the R-AP family: … (r9 MAJOR-2): passed
NOTICE:  All W1b assertions passed.
ROLLBACK
EXIT=0
```

Both suites pass, 0 failures. The W1b suite is now **20 blocks** (unchanged
count from r10/r11-tests) but blocks 3, 4, 14, 16 carry additional language over
r11-tests' own quote — the M1/M2/M3 fix's regression coverage (r10 MAJOR-2's
seat-count-once-per-view language in block 3/4, r11 MAJOR-1's solo-designer
population in block 14/16) is now inline in the suite's own NOTICE text, not
just in the fix log.

**Adjacent, not in the requested directory, re-checked for continuity** (r11-tests
Finding 4 — was RED at r11-tests: `FAIL a2: expected exactly 12 columns, got
17`):

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/people_directory_scope_test.sql
...
NOTICE:  people_directory_scope: case (a) passed.
...
NOTICE:  people_directory_scope: case (k) passed.
NOTICE:  All people_directory scope assertions passed.
ROLLBACK
```

**r11-tests Finding 4 is FIXED.** The fix log (`w1b-final-fix-log-r11.md`, "M1 —
the suite that hid it") explains why: case `a2` moved from an exact
`= 12` column-count assertion to `>= 12` (documenting that columns may be
appended, never inserted among or dropped from the twelve), which unblocked
`ON_ERROR_STOP` past the point that used to abort the file, and case `(h3)` —
written for exactly the solo-designer population M1 fixes — now runs and
passes. Confirmed live this round: all eleven cases (a)–(k) pass.

## 2. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build db:generate
GEN_EXIT=0   (sandbox disabled: supabase gen types talks to the Docker socket
              directly — same known footgun r10-tests/r11-tests both hit)
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build diff --stat -- packages/supabase/src/database.types.ts
(empty)
```

No drift, confirmed after the mid-review DB scare against a freshly re-verified
`00627`/`20260910152111` head — the empty diff is not left over from a stale
generation.

## 3. Role probes — designer, client, anon, and a genuine cross-tenant admin

As `designer@patina.dev` (`a0000000-0000-0000-0000-000000000004`, owner of
`Local Dev Studio`):

```
role   | count
-------+------
client |     7
contact|    49
lead   |     5
sub    |     1

display_name  |  role   | seat_count | reach_state | consent_status | paper_state
Amara Osei    | contact |          1 | on_paper    | granted        | lapses_soon
Dana Kowalski | contact |          2 | field_link  | granted        | lapsed
Pete Rusk     | contact |          2 | field_link  | opted_out      | current
Ray Thao      | contact |          1 | on_paper    | not_asked      | not_on_file

project_site_access_cards: 1
```

As `client@patina.dev` (`a0000000-0000-0000-0000-000000000005`, homeowner login,
no design-studio `organization_members` row) — every W1b-added sensitive object
reads 0:

```
project_site_access_cards | 0
studio_compliance_documents | 0
project_party_authority | 0
people_directory_seats | 0
```

**Confirms the specific check the brief asked for: a client role cannot see
`project_site_access_cards`** (file: `supabase/migrations/00625_project_site_access_cards.sql`,
PR-w's four `is_studio_comember(project_designer(project_id))` policies, no
client leg, verified live above).

As `anon`:

```
select count(*) from project_site_access_cards;
NOTICE:  anon refused project_site_access_cards at grant: permission denied for table project_site_access_cards
select count(*) from people_directory_seats;
NOTICE:  anon refused people_directory_seats at grant: permission denied for view people_directory_seats
select count(*) from v_access_grants;
NOTICE:  anon refused v_access_grants at grant: permission denied for view v_access_grants
select count(*) from people_directory;
ERROR:  permission denied for table studio_contacts
```

All four refused at the GRANT, before any RLS policy runs — matches r11-tests
Finding 5's already-documented, local-only behaviour (people_directory's own
grant to anon is the local blanket `00-legacy-grants.sql` seed artifact per
`w1b-report.md` §7; the view still cannot actually return rows to anon because
one of its six UNION branches touches `studio_contacts`, which anon has no
grant on). Carried forward, still MINOR, still local-only.

**A genuine cross-tenant admin, read AND write**, independently reproduced this
round (not reused from r11-tests' output — re-run fresh against the
just-re-verified `00627` head): `cf100000-0000-4000-8000-000000000001`, an
owner of `Phase One Synthetic Studio` (`cf120000-…`), zero membership in
`Local Dev Studio`:

```
site_access_cards | 0
authority_grants  | 0
compliance_docs   | 0
directory_seats   | 0
people_directory (Dana Kowalski / Pete Rusk / Chidi Okonkwo) | 0

UPDATE project_site_access_cards SET lockbox_version = lockbox_version || '-hacked'
  WHERE project_id = (the seeded Okonkwo project)             -> UPDATE 0
UPDATE studio_compliance_documents SET verified_at = now()
  WHERE holder_id = Dana Kowalski's card                      -> UPDATE 0
```

Zero reads, zero writes, both across the M1 (widened tenant leg) and M3
(foreign-card-stamp refusal) fixes landing since r11-tests ran this same check.
No regression: the wider tenant leg in `00626` (which now also admits a
project's own `designer_id`/`lead_designer_id`/`created_by` with no active org)
does not widen visibility to an *outside* admin who is none of those three —
confirmed live, not just by the suite's block 13/17.

## 4. The four named fixture people, checked against `briefing/fixture.md`

| ID | Name | fixture.md reach | fixture.md consent | fixture.md docs | **live reach_state** | **live consent_status** | **live paper_state** | Match? |
|---|---|---|---|---|---|---|---|---|
| F-11 | Dana Kowalski | field link | granted (Okonkwo row set 2026-10-12) | COI lapsed 2026-03-31 | `field_link` | `granted` | `lapsed` | **yes** |
| F-12 | Pete Rusk | field link | opted_out (STOP, Lindqvist, 3 Dec 2025) | COI current (exp 2027-01-15) | `field_link` | `opted_out` | `current` | **yes** |
| F-16 | Amara Osei | on paper (has an account, unlinkable) | granted (web form, 2026-10-14) | COI/W-9 held, no expiry stated | `on_paper` | `granted` | `lapses_soon`* | **yes** |
| F-27 | Ray Thao | on paper | n/a (never texted) | n/a — lender/inspector never owed paper | `on_paper` | `not_asked` | `not_on_file`† | **yes** |

\* Lakeshore Painting's COI is seeded `CURRENT_DATE + 23` on purpose so this
always reads `lapses_soon`; fixture.md states no expiry, so this is a
documented seed choice (`w1b-report.md` §6), not a contradiction.

† `not_on_file` is the correct SQL-level fact for a lender/inspector with no
documents; the room prints no paper word for these two roles as a **display**
rule (R-A/C13/PR-e), asserted in SQL by test block 12g. Not a bug.

All four match, unchanged from r11-tests, independently re-verified live this
round rather than carried over.

## 5. The seed runs on reset

`supabase/config.toml` line 60 (`[db.seed] sql_paths`) carries
`'./seed/people_crm_dev.sql'` as the last entry before
`99-local-edge-settings.sql`, and the seeded Okonkwo data (49 contact rows = 28
person + 21 company, Dana's two seats, the five granted numbers) is present and
correct in the live probes above and in §4 — the seed ran on the reset that
produced the currently-confirmed `00627` head. The `[remotes.staging.db.seed]`
block (line 88) still also carries the line (report §8's open Fable question,
unchanged, not re-litigated here since rulings.md §3 does not settle it).

## 6. Every reader of `people_directory` / `v_project_roster` columns

Re-ran the grep both as a plain string and keyed on the actual surface
(`PeopleDirectoryRow`, `usePeopleDirectory`, `usePerson`, `useProjectRoster`,
`ProjectRosterRow`) to catch consumers that only import the type:

```
$ grep -rln "people_directory\b" apps packages --include="*.ts" --include="*.tsx"
$ grep -rln "v_project_roster\b" apps packages --include="*.ts" --include="*.tsx"
```

**`people_directory` readers** — unchanged from r10-tests/r11-tests, 14 files,
same set `w1b-report.md` §4 names: `packages/supabase/src/hooks/use-people.ts`
(`usePeopleDirectory`, `usePerson`, both `select('*')`) ·
`packages/supabase/src/hooks/index.ts` (barrel) ·
`.../lib/document/people-derivation.ts` · `.../lib/document/desk-derivation.ts` ·
`.../lib/document/roster-derivation.ts` ·
`.../components/document/people/people-room.tsx` ·
`.../people/views/directory-view.tsx` · `.../people/directory/person-row.tsx` ·
`.../people/views/person-profile.tsx`, `nurture-view.tsx`, `outreach-view.tsx`,
`portfolio-view.tsx` · `.../people/outreach/audience-rules.ts`,
`audiences-tab.tsx` · `.../people/party-profile-sheet.tsx` ·
`.../document/command-bar.tsx` · `.../document/desk-reconnect.tsx`.

**Checked, cleared, not a finding**: the wider plain-string grep also surfaces
`brief-section.tsx`, `overlays/household-sheet.tsx`,
`people/directory/makers-marketplace.tsx`, `people/person-bits.tsx`,
`people/profile/maker-profile.tsx`, `roster/call-sheet-mount.tsx`,
`roster/roster-row.tsx`, `use-clients.ts`, `use-coordination.ts`,
`use-vendors.ts` — every one of these mentions is a **comment**, not a query
(spot-checked each: `grep -n "people_directory"` on each file shows only prose
lines like "// people_directory party branch (00420) excludes vendor /
client_rep..."). None of them is a live reader of the five appended columns and
none is missing from the report's list.

**`v_project_roster` readers via `useProjectRoster`/`ProjectRosterRow`** —
broader than a plain grep of "people_directory", but `v_project_roster` is
untouched by any migration in this wave (`00623`–`00627` never mention it), so
these are not graded findings for W1b: `packages/supabase/src/hooks/use-coordination.ts`
(`useProjectRoster`, `.from('v_project_roster').select('*')`) ·
`.../roster/call-sheet-mount.tsx` · `.../roster/call-sheet.tsx` ·
`.../roster/roster-row.tsx` · `.../lib/document/roster-derivation.ts` ·
`letterhead-instruments.tsx` (comment only, vitals count via the same hook).
`use-coordination.ts:442-445`'s own comment confirms `v_project_roster` was
already repointed onto `studio_channel_consent` in the W1a lane (00621/00622,
R-AY), consistent with rulings.md §3 and not re-litigated here.

## 7. Type-checks

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(clean, no output, exit 0)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, no output, exit 0)
```

No type breaks. Expected: `database.types.ts` shows zero diff after regen (§2),
so there is nothing for either `tsc` invocation to disagree with.

---

## Prior findings, re-checked

| # | Source | r11-tests verdict | This round (r12) |
|---|---|---|---|
| M1 (MAJOR, migrations-lane) — solo designer loses her own job's party rows | Fixed by `w1b-final-fix-log-r11.md` | **Confirmed FIXED and holding**: the three-site widened tenant leg is live in `00626` (party branch, `identity_seats` CTE, `people_directory_seats` WHERE), the suite's block 14/16 assert it, and my own cross-tenant admin probe (§3) confirms the widening did not open a cross-tenant hole |
| M2 (MAJOR, migrations-lane) — Directory counted seats once per row (quadratic cost) | Fixed by `w1b-final-fix-log-r11.md` | **Confirmed FIXED**: `identity_seats AS MATERIALIZED (...)` CTE is in `00626:1072`, `identity_seat_count()` itself unchanged and still used for the single-identity question; not independently re-timed this round (r11's own fix log already re-ran the growth-curve probe to 3.67s at 749/731 rows) |
| M3 (MAJOR, migrations-lane) — a foreign rolodex card could be stamped on a studio-less job | Fixed by `w1b-final-fix-log-r11.md` | **Confirmed FIXED and holding**: `project_recorded_studio()` / `party_card_project_has_no_studio` present in `00624`, suite block 14/16/17 exercise the studio-less population, unchanged this round |
| r11-tests Finding 1 (MINOR) — `w1b-report.md` stale relative to HEAD | Open at r11-tests | **STILL OPEN, now more stale**: `git log -1 -- .../w1b-report.md` shows last touch at `9812807e1` (the r7 fix) — four fix rounds behind current HEAD `7b4707d8e` (r8, r9, r10, r11 all postdate it). The report's §7 test-block-12 quote still has no r9/r10/r11 language (no "transitive" supersede reckoning, no "field_link" Pete Rusk fix, no solo-designer/seat-cost/foreign-card language) |
| r11-tests Finding 3 — `v_project_roster` checked, cleared | Cleared | Still cleared (§6) |
| r11-tests Finding 4 (MINOR) — `people_directory_scope_test.sql` red (12 vs 17 cols) | Open at r11-tests | **FIXED** — this was M1's own fix (the fix log's "M1 — the suite that hid it" section): case `a2` now asserts `>= 12`, all eleven cases (a)–(k) pass live (§1) |
| r11-tests Finding 5 (MINOR) — anon `people_directory` hard-errors instead of returning empty | Open | **STILL OPEN**, unchanged behaviour, local-only (§3) |
| r11-tests Finding 6 (MINOR) — the CONTACTS branch never joins consent evidence, so 49 of 50 Directory rows carry no `meta.sms_consented_at`/`sms_opt_out_at` | Open | **STILL OPEN, unchanged**. Confirmed live this round: `SELECT meta->>'sms_consented_at', meta->>'sms_opt_out_at' FROM people_directory WHERE display_name IN ('Dana Kowalski','Pete Rusk','Amara Osei','Ray Thao')` returns empty for both columns on all four, and `00626_people_directory_v4_seats.sql`'s CONTACTS branch `jsonb_build_object(...)` (`:1487-1495`) still has no `sms_consented_at`/`sms_opt_out_at` keys, unlike the PARTY branch's `meta` (`:1178-1179`, `ev.consented_at`/`ev.opt_out_at`). No shipped reader consumes these keys off a Directory row today (confirmed again in §6), so this stays MINOR, not MAJOR — but it is unchanged by the r11 fix round, which touched none of this |

---

## New findings this round

None. Every check this round either reconfirms an already-fixed item, reconfirms an
already-open MINOR unchanged, or independently re-derives a result r11-tests
already reached (cross-tenant admin, fixture words, type-checks) with fresh
values rather than reused output.

---

## Summary

| # | Severity | Confidence | File | One-line |
|---|---|---|---|---|
| 1 | MINOR | CONFIRMED | `artifacts/people-room-crm-2026-09-11/build/w1b-report.md` | Last touched at `9812807e1` (r7); four fix rounds (r8–r11) postdate it and are undescribed |
| 2 | MINOR | CONFIRMED | local dev grants only (`supabase/seed/00-legacy-grants.sql`) | Anon `SELECT * FROM people_directory` hard-errors (`permission denied for table studio_contacts`) instead of returning zero rows; local-only, not present on Strata's actual grant scheme |
| 3 | MINOR | CONFIRMED | `supabase/migrations/00626_people_directory_v4_seats.sql:1487-1495` (contrast `:1178-1179`) | The CONTACTS branch's `meta` carries no `sms_consented_at`/`sms_opt_out_at`, unlike the PARTY branch — 49 of this studio's 50 Directory rows have no consent date to source R-Q's sentence from; no shipped or W2-planned reader is broken today (verified live and by reader-grep, §6), so it stays under the MAJOR bar, but it sits directly under W2's R-BE work |

Zero BLOCKING, zero MAJOR. **Clean by the stated bar.** All three MAJORs open at
the last migrations-lane review (M1/M2/M3) are confirmed fixed and holding,
independently re-verified this round with fresh cross-tenant read/write probes
(not reused from the fix log's own evidence). The scope-test MINOR (r11-tests
Finding 4) is fixed as a side effect of M1's fix. Two MINORs carry forward
unchanged (report staleness, anon hard-error); one MINOR (consent dates on the
CONTACTS branch) is unchanged and still open, confirmed live rather than
inherited from the prior report's text.

Both SQL suites pass on the confirmed `00627`/555-migration state (0 failures,
20 W1b blocks, 45+ W1a blocks). The adjacent RLS scope suite is now green (was
red at r11-tests). Generated types show zero drift. Both `type-check` gates are
clean. The client role and a genuine, freshly-reproduced cross-tenant admin
both read zero rows from every W1b-added sensitive object and cannot write to
any of them, after the M1 (widened tenant leg) and M3 (foreign-card refusal)
fixes landed — no regression. Every ruling in `rulings.md` §3 held in every
probe run this round; none was treated as a finding.
