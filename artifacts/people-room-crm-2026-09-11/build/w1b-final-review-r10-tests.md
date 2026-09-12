# W1b — final review round 10, tests / types / behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `960bb771d` ("fix(people-crm): w1b r9 …").
Local DB only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); nothing
touched on Strata. This wave owns the local DB exclusively for this run; migration
numbers 00595–00620 were not touched (still reserved for the other program), and no
new migration was minted (00628+ remains free for W2).

**Prior fix log re-checked**: `w1b-final-fix-log-r9.md` claims three fixes (B1
BLOCKING — 00627's definer readers ask `project_recorded_studio()`; M1 MAJOR — the
supersede is re-reckoned at every read; M2 MAJOR — `studio_contact_id` gets the R-AP
guard). All three are **confirmed fixed and holding**: block 18 (B1), block 19 (M1)
and block 20 (M2) of the current test file assert exactly these, and all three passed
on a fresh reset at HEAD (see §1). Not re-opened.

**Important scope note**: `build/w1b-report.md` (the report this round was asked to
read) is dated **before** r9 landed — it still names `compliance_state(holder)`,
describes 12 W1b test blocks, and never mentions `identity_paper_state`,
`reach_state_for_identity`, `project_recorded_studio`, or `project_tenant_org`. The
live view (`pg_get_viewdef('people_directory')`) and the live test file (20 blocks)
have moved past it. This review graded the **actual HEAD**, not the stale prose in
that report — see Finding 1.

---

## 1. Every SQL test under `supabase/tests/people`, on a fresh reset

```
$ pnpm supabase:reset            # ran with the sandbox disabled — see note below
...
Applying migration 00627_access_grants_and_field_link_window.sql...
Seeding data from supabase/seed/people_crm_dev.sql...
...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 6;"
20260910152111
00627
00626
00625
00624
00623
```

*Sandbox note*: the bare `pnpm supabase:reset` first failed inside the default
sandbox with `EPERM … open '/Users/kody/.supabase/telemetry.json.tmp…'` — the
Supabase CLI's telemetry writer touches a path outside the write allowlist. Re-ran
with the sandbox disabled for that one command; every other command in this review
ran sandboxed.

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
NOTICE:  19. the supersede is re-reckoned at every READ: … (r9 MAJOR-1): passed
NOTICE:  20. studio_contact_id is guarded like the rest of the R-AP family: … (r9 MAJOR-2): passed
NOTICE:  All W1b assertions passed.
ROLLBACK
EXIT=0
```

Both suites pass, 0 failures, on a fresh reset that includes the dev seed. The W1b
suite has grown from the 12 blocks the stale `w1b-report.md` describes to **20**
blocks (blocks 13–20 added across r5–r9 to close cross-tenant, studio-less-project
and supersede-reckoning findings). No regression in either suite.

**Adjacent, not in the requested directory, run for context**: `supabase/tests/rls/people_directory_scope_test.sql` still fails —

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/people_directory_scope_test.sql
...
ERROR:  FAIL a2: expected exactly 12 columns, got 17
```

This is pre-existing, already named in `w1b-final-fix-log-r9.md`'s own close: 00626
intentionally widens `people_directory` to 17 columns (rulings §6, 100% rollout, no
flag), and this suite still asserts the old count of 12. Not a regression from this
round; carried forward as Finding 4 below so it doesn't fall off the ledger.

## 2. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir …/agent-people-build db:generate
GEN_EXIT=0
$ git -C …/agent-people-build diff --stat -- packages/supabase/src/database.types.ts
(empty)
```

No drift. Matches the fix log's claim.

## 3. Role probes — designer, client, anon

As `designer@patina.dev` (`a0000000-0000-0000-0000-000000000004`, owner of the
seeded studio):

```
role   | count
-------+------
client |     7
contact|    49
lead   |     5
sub    |     1

display_name  |  role   | reach_state | consent_status | paper_state
Amara Osei    | contact | on_paper    | granted        | lapses_soon
Dana Kowalski | contact | field_link  | granted        | lapsed
Pete Rusk     | contact | on_paper    | opted_out      | current
Ray Thao      | contact | on_paper    | not_asked      | not_on_file
```

As `client@patina.dev` (`a0000000-0000-0000-0000-000000000005`, a homeowner login,
no design-studio membership):

```
project_site_access_cards    | 0
project_party_authority      | 0
studio_compliance_documents  | 0
people_directory_seats       | 0
v_access_grants               | 0
people_directory (any role)  | 0 rows
```

Confirms the specific check asked for: **a client role cannot see
`project_site_access_cards`** — 0 rows, and every other W1b-added sensitive object
also reads 0 for this role.

As `anon`:

```
select count(*) from project_site_access_cards;
ERROR:  permission denied for table project_site_access_cards
HINT:  Grant the required privileges to the current role with: GRANT SELECT ON public.project_site_access_cards TO anon;
```

Refused at the grant, before any policy runs — matches the report's claim.

`select count(*) from people_directory;` as anon:

```
ERROR:  permission denied for table studio_contacts
```

See Finding 5 — a behavioural detail neither the report nor any fix log actually
exercised (they inspected the grant catalog, not a live anon `SELECT * FROM
people_directory`).

## 4. The four named fixture people, checked against `briefing/fixture.md`

| ID | Name | fixture.md "Patina reach today" | fixture.md consent | fixture.md docs | **live reach_state** | **live consent_status** | **live paper_state** | Match? |
|---|---|---|---|---|---|---|---|---|
| F-11 | Dana Kowalski | field link | granted (2026-10-12) | COI lapsed 2026-03-31 | `field_link` | `granted` | `lapsed` | **yes** |
| F-12 | Pete Rusk | field link | opted_out (STOP, Lindqvist) | COI current (exp 2027-01-15) | `on_paper` | `opted_out` | `current` | **reach: no** — see Finding 2 |
| F-16 | Amara Osei | on paper (G-5: has an account, unlinkable) | granted (web form 2026-10-14) | COI/W-9 held, no expiry stated | `on_paper` | `granted` | `lapses_soon`* | yes |
| F-27 | Ray Thao | on paper | n/a (never texted) | n/a — lender/inspector never owed paper | `on_paper` | `not_asked` | `not_on_file`† | yes |

\* Lakeshore Painting's COI is seeded `CURRENT_DATE + 23` on purpose (per
`w1b-report.md` §6) to demonstrate `lapses_soon`; fixture.md doesn't state an
expiry, so this isn't a contradiction, just a seed choice.

† `not_on_file` is the correct SQL-level fact for a lender/inspector with no
documents; R-A/C13/R-N are a *display* rule (the room prints no paper word for
these two roles) enforced in the app, not in the view — `w1b-report.md` §4 states
this explicitly and SQL block 12g in the test suite asserts the split. Not a bug.

Three of four match. F-12 does not — see Finding 2.

## 5. Every reader of `people_directory` / `v_project_roster` columns

```
$ grep -rln "people_directory\|v_project_roster" apps packages --include="*.ts" --include="*.tsx"
```

**`people_directory` readers** (consume the row shape, not just a comment) — same
14 as `w1b-report.md` §4 / `w1b-final-review-r7-tests.md` §8, re-verified line by
line, list unchanged:

`packages/supabase/src/hooks/use-people.ts` (`usePeopleDirectory`, `usePerson`,
both `select('*')`) · `packages/supabase/src/hooks/index.ts` (barrel) ·
`apps/designer-portal/src/lib/document/people-derivation.ts` ·
`.../lib/document/desk-derivation.ts` · `.../lib/document/roster-derivation.ts` ·
`.../components/document/people/people-room.tsx` ·
`.../people/views/directory-view.tsx` · `.../people/directory/person-row.tsx` ·
`.../people/views/person-profile.tsx`, `nurture-view.tsx`, `outreach-view.tsx`,
`portfolio-view.tsx` · `.../people/outreach/audience-rules.ts`, `audiences-tab.tsx`
· `.../people/party-profile-sheet.tsx` · `.../document/command-bar.tsx` ·
`.../document/desk-reconnect.tsx`.

**`v_project_roster` readers**: `packages/supabase/src/hooks/use-coordination.ts`
(`useProjectRoster`, `.from('v_project_roster').select('*')`, line 1008) ·
`apps/designer-portal/src/components/document/letterhead-instruments.tsx` ·
`.../roster/call-sheet-mount.tsx` · `.../roster/call-sheet.tsx` ·
`.../roster/roster-row.tsx` · `.../lib/document/roster-derivation.ts`.

All other grep hits (`brief-section.tsx`, `overlays/household-sheet.tsx`,
`people/directory/makers-marketplace.tsx`, `people/person-bits.tsx`,
`people/profile/maker-profile.tsx`, `use-clients.ts`, `use-vendors.ts`, and the
`__tests__`/`.test.` files) reference either name **only in a comment** —
verified line-by-line, not just by grep hit. No missed reader.

**On `v_project_roster` itself**: checked whether it carries the same
caller-independent-tenant-resolution defect this round fixed elsewhere
(`project_consent_org()`'s `_primary_studio_for()` fallback, R-BD). It does **not**
— `supabase/migrations/00594_studio_channel_consent.sql:1160-1168` already wraps
the COALESCE in `CASE WHEN is_active_studio_member(project_consent_org(...)) THEN
… ELSE NULL END`, added specifically for this ("w1b final review r8 MAJOR-1", per
the inline comment at `:1148-1158`). Verified live via `pg_get_viewdef`: the
`ELSE NULL` branch is present. So a caller who isn't an active member of whatever
org `project_consent_org()` guesses gets `NULL`, never a wrong studio's word — the
known residual (a studio-less project's own consent word reads `NULL` instead of
the affirmative one, until W3's backfill) is the same one already named and owed
in `w1b-report.md` §8 / R-BD, not a fresh defect. **Checked and cleared, not a
finding.**

## 6. Type-checks

```
$ pnpm --dir …/agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(clean, no output, exit 0)

$ pnpm --dir …/agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, no output, exit 0)
```

No type breaks from the regenerated `database.types.ts` (which didn't move — §2).

---

## Findings

### Finding 1 — MINOR — `build/w1b-report.md` is stale relative to HEAD

**File**: `artifacts/people-room-crm-2026-09-11/build/w1b-report.md`
**Claim**: The report this round was pointed at describes pre-r9 code. It names
`compliance_state(holder)` (§1, §4 table) where HEAD's view calls
`identity_paper_state(q.studio_contact_id, q.company_id)`; it says
`reach_state_for(profile_id, card_id, party_id)` where HEAD calls
`reach_state_for_identity(q.profile_id, q.identity_key)`; §7 shows "12. …passed"
as the last test block where HEAD has 20; and it never mentions
`project_recorded_studio()`, which B1's fix (r9) introduces. Three real fixes
(B1/M1/M2, r9) and the r5–r8 rounds' fixes are invisible in this document.
**Failure scenario**: anyone who reviews or onboards from `w1b-report.md` alone —
without also finding and reading `w1b-final-fix-log-r5.md` through `-r9.md` — will
review, and possibly re-litigate or contradict, a shape of the code that no longer
exists on disk.
**Fix**: either regenerate `w1b-report.md` from HEAD after r9, or add a one-line
banner at its top pointing to the fix logs as the authoritative diff on top of it
(the way `w1b-final-fix-log-r9.md` itself does for its predecessors).

### Finding 2 — MAJOR — the seed omits Pete Rusk's field link, so the shipped Directory disagrees with the fixture for F-12

**File**: `supabase/seed/people_crm_dev.sql:898-904`
**Claim**: `crm-model.md:241` lists F-12 among the field-link tier
("F-07, F-08, F-09, F-11, **F-12**, F-18") and `crm-model.md:262` states his access
matrix explicitly as `Phone, Field link by another channel` — i.e. the design
intends Pete to hold a field link (delivered by some channel other than the text
he opted out of), and `briefing/fixture.md:39`'s own "Patina reach today" column
says `field link` for him. The seed's `create_field_link` loop
(`people_crm_dev.sql:898-904`) mints links for F-08, F-09, F-11, F-18, F-06 and
F-28's second seat, but **not** for Pete's Okonkwo seat
(`d0e30000-0000-0000-0000-000000000012`). Live query confirms:
`people_directory` reads `reach_state = 'on_paper'` for Pete Rusk, not
`field_link` (§3, §4 above).
**Failure scenario, concrete**: Priya opens the People Room, filters to subs, and
Pete's row reads "On paper" — the same reach word as someone Patina has never
tried to reach any other way — for a sub the design says explicitly should show a
field link (delivered by hand, email, or in person, since his phone is opted out
of SMS). The seed silently teaches the opposite of the design intent: that an
opted-out number degrades a party's reach tier, when the two axes (reach
mechanism vs. text consent) are supposed to be independent (`direction.md:430`,
PR-e). Nobody catches this because test block 12
(`supabase/tests/people/w1b_compliance_authority_directory_test.sql:2126-2226`)
only asserts Pete's `consent_status`, never his `reach_state` — so the suite's own
claim "the seeded fixture reads as the fixture" (block 12's NOTICE) is not fully
true for one of the four identities this review round was specifically told to
check.
**Fix**: add Pete's Okonkwo party id to the `create_field_link` loop in
`people_crm_dev.sql` (mirroring F-11's line), and add a reach_state assertion for
F-12 to test block 12 so this can't regress silently again.

### Finding 3 — none (checked, cleared)

Covered in §5 above — recorded here only so the review shows the check was made:
`v_project_roster`'s consent column was checked for the same
`project_consent_org()`/`_primary_studio_for()` cross-studio exposure this round
fixed elsewhere (R-BD, r8/r9 BLOCKING). It already carries the r8 MAJOR-1 fix
(`00594_studio_channel_consent.sql:1160-1168`, `ELSE NULL`). Not a finding.

### Finding 4 — MINOR — `supabase/tests/rls/people_directory_scope_test.sql` is red at HEAD

**File**: `supabase/tests/rls/people_directory_scope_test.sql:308`
**Claim**: `FAIL a2: expected exactly 12 columns, got 17` on a fresh reset at
HEAD. Pre-existing (already named in `w1b-final-fix-log-r9.md`'s close-out,
"not mine … pre-existing W1b debt"): 00626 deliberately widens `people_directory`
to 17 columns per rulings §6 (100% rollout, no flag), and this RLS suite still
hard-codes the old count of 12. Not a regression introduced this round, but it
remains a red suite in the tree today and is exactly the kind of automated check
that should be updated alongside a view-shape change, per R-BE / the "owed to W2"
list in `w1b-report.md` §8.
**Fix**: bump the asserted column count to 17 (or better, assert the specific new
column names) as part of the W2 reader-repoint work R-BE already owes.

### Finding 5 — MINOR — anon querying `people_directory` now hard-errors instead of returning zero rows

**File**: `supabase/migrations/00626_people_directory_v4_seats.sql` (the party
branch's join to `studio_contacts`)
**Claim**: `w1b-report.md` §7 probe 1 notes `people_directory` has
`anon_select = t` from the local-only `seed/00-legacy-grants.sql` blanket grant
(00221/00281 never granted `authenticated`-only in this local file; Strata never
had this grant at all) and says "the view is security_invoker, so anon reads
nothing through RLS" — implying anon gets an empty result set. Live check shows
otherwise: `SET ROLE anon; SELECT count(*) FROM people_directory;` raises
`ERROR: permission denied for table studio_contacts`, because Postgres checks
table-level privileges for **every** UNION branch's base tables at plan time,
regardless of which branch's RLS predicate would end up excluding the row — and
`studio_contacts` (new to the party branch as of 00626) carries no anon grant.
**Failure scenario**: anything that unauthenticatedly probes `people_directory`
locally (a smoke test, a stray script using the anon key with no session) now
gets a hard 500/permission-denied instead of an empty array. Not a security
regression — anon still gets zero rows of real data either way, and this grant
doesn't exist on Strata — but it's a behavioural change from what the report
claimed, and nobody actually ran the anon query to check.
**Fix**: none required for correctness. Worth a one-line note next to the
existing "pre-existing artefact, not mine" callout in `w1b-report.md` §7 so a
future local anon-key smoke test isn't surprised by the error mode change.

---

## Summary

| # | Severity | Confidence | One-line |
|---|---|---|---|
| 1 | MINOR | CONFIRMED | `w1b-report.md` describes pre-r9 code; fix logs r5–r9 are the real diff on top of it |
| 2 | MAJOR | CONFIRMED | Seed never mints Pete Rusk (F-12) a field link; `people_directory.reach_state` reads `on_paper` where the design (`crm-model.md`) and `fixture.md` both say `field link` |
| 4 | MINOR | CONFIRMED | `people_directory_scope_test.sql` still asserts the pre-v4 12-column shape; red at HEAD |
| 5 | MINOR | CONFIRMED | Anon `SELECT * FROM people_directory` now hard-errors (permission denied on `studio_contacts`) rather than returning empty; local-only, not a Strata exposure |

Zero BLOCKING. One MAJOR (Finding 2). Not clean by the stated bar (clean = zero
BLOCKING and zero MAJOR).

All three of `w1b-final-fix-log-r9.md`'s claimed fixes (B1 BLOCKING, M1 MAJOR, M2
MAJOR) are confirmed still fixed and covered by passing suite blocks 18–20. No
regression found in either W1a or W1b SQL suites, in generated types, or in either
type-check gate.
