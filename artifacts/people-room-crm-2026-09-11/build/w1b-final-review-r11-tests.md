# W1b — final review round 11, tests / types / behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `e2ab4d523` ("fix(people-crm): w1b r10 — the
supersede reckoning walks the whole chain, the seat count is the seats view's own
set, and Pete Rusk holds his field link"). Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); nothing touched on
Strata. Working tree is clean except `artifacts/.../rulings.md` (R-BF/R-BG/R-BH
recorded — documentation only, no code diff).

**Sandbox note**: two commands needed the sandbox disabled — `pnpm supabase:reset`
(the Supabase CLI's telemetry writer touches `~/.supabase/telemetry.json.tmp*`,
outside the write allowlist) and `pnpm --filter @patina/supabase generate`
(`supabase gen types` talks to the Docker socket directly). Both are the same
known footgun r10's own review hit. Every other command in this review ran
sandboxed.

**Operational hazard hit mid-review, not a code finding**: partway through this
round, a `SELECT` against the live DB returned `0` auth users and migrations
capped at `00545` — a completely different, much older local state than the one
the prior reset had just produced (`00627` head, 16 seeded auth users). A second
`pnpm supabase:reset` immediately restored the correct state
(`20260910152111`/`00627` head, 16 auth users) and it held for the rest of the
session. `docker ps` at the time showed the `supabase_db_supabase` container
freshly restarted (~16s uptime) alongside a second, unrelated project
(`supabase_db_patina-hours`, the hour-tracking session named in the shared-local-
DB warning) on different ports. Most likely explanation: the tail end of the
prior `db reset`'s own "Restarting containers..." step was still settling when
the query landed and briefly answered from a not-yet-ready replica/volume state,
rather than a second actor actually touching this DB — but the exact mechanism
wasn't nailed down, and the shared-Postgres risk this task's own brief warns
about is real infrastructure, not a hypothetical. Every check below was re-run
(or, where already run once, re-verified against a freshly confirmed migration
head) **after** this was caught, so nothing in this report rests on the bad read.
Flagged for Kody: if this recurs, the "sole owner" assumption for
`127.0.0.1:54322` during a wave needs a harder guarantee than a comment in a
task brief.

---

## 1. Every SQL test under `supabase/tests/people`, on a fresh reset

```
$ pnpm supabase:reset                      # sandbox disabled, see note above
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
NOTICE:  19. … the reckoning is TRANSITIVE, not one hop: the ordinary second
    renewal A->B->C reads current today and still current the day the middle
    certificate's own date has passed … while gutting the head of the chain
    still brings every root behind it back (r10 MAJOR-1): passed
NOTICE:  12. the seeded fixture reads as the fixture: five granted numbers,
    Pete's Lindqvist refusal answering on Okonkwo while his REACH still reads
    field_link (r10 tests F2), Joe invited, Frank routed to Rosa, Ray never
    texted, the lender's paper reported as a fact, Chidi's $2,500 line in
    cents, Erin preparing only, and Ngozi holding the key: passed
NOTICE:  All W1b assertions passed.
ROLLBACK
EXIT=0
```

Both suites pass, 0 failures, on a fresh reset that includes the dev seed. 20
blocks in the W1b suite, unchanged in count from r10; blocks 19 and 12 carry the
r10 fix language quoted above and both assert the fixed behaviour, not just the
absence of an error.

**Adjacent, not in the requested directory, re-checked for continuity**:
`supabase/tests/rls/people_directory_scope_test.sql` is still red —

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/people_directory_scope_test.sql
...
ERROR:  FAIL a2: expected exactly 12 columns, got 17
```

Unchanged from r10-tests Finding 4 (pre-existing, not a regression — carried
forward as Finding 4 below).

## 2. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir …/agent-people-build db:generate        # sandbox disabled, see note
GEN_EXIT=0
$ git -C …/agent-people-build diff --stat -- packages/supabase/src/database.types.ts
(empty)
```

No drift. Confirmed a second time after the mid-review DB scare (§0), against the
freshly re-verified `00627`/`20260910152111` head — the empty diff is not left
over from a stale generation.

## 3. Role probes — designer, client, anon, and a genuine cross-tenant admin

As `designer@patina.dev` (`a0000000-0000-0000-0000-000000000004`, owner of the
seeded studio, `Local Dev Studio`):

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
Pete Rusk     | contact | field_link  | opted_out      | current     <- r10 F2 fix confirmed live
Ray Thao      | contact | on_paper    | not_asked      | not_on_file

site_access_cards: 1
```

As `client@patina.dev` (`a0000000-0000-0000-0000-000000000005`, homeowner login,
no design-studio membership) — every W1b-added sensitive object reads 0:

```
site_access_cards | 0
authority_grants  | 0
compliance_docs   | 0
directory_seats   | 0
access_grants     | 0
directory_rows    | 0
```

**Confirms the specific check asked for: a client role cannot see
`project_site_access_cards`.**

As `anon`:

```
select count(*) from project_site_access_cards;
ERROR:  permission denied for table project_site_access_cards
HINT:  Grant the required privileges … GRANT SELECT ON public.project_site_access_cards TO anon;

select count(*) from people_directory;
ERROR:  permission denied for table studio_contacts
```

Both refused at the grant, before any policy runs — matches r10-tests Finding 5's
already-documented, local-only behaviour (carried forward, still MINOR).

**A genuine cross-tenant admin, read AND write** (the check this round added
beyond r10's scope): first attempt used `a0000000-0000-0000-0000-000000000003`
(`uid_studio_mgr`) as the "outside" actor — this turned out to be a **false
alarm on my own part**, not a finding: that account is seeded as an `admin` of
`Local Dev Studio` itself (`organization_members`), so its non-zero reads and one
successful `UPDATE` were legitimate same-tenant access, not a leak. Re-run
against `cf100000-0000-4000-8000-000000000001`, an owner of `Phase One Synthetic
Studio` (`cf120000-…`) with **zero** membership row in `Local Dev Studio` or
`Leah Hartwell`:

```
site_access_cards | 0
authority_grants  | 0
compliance_docs   | 0
directory_seats   | 0
access_grants     | 1   <- checked: this caller's OWN studio_member grant on
                            their OWN org (cf120000-…), unrelated to the seeded
                            Okonkwo fixture — not a leak
people_directory (Dana Kowalski / Pete Rusk / Chidi Okonkwo) | 0

UPDATE project_site_access_cards SET lockbox_version = lockbox_version || '-hacked'
  WHERE project_id = (the seeded Okonkwo project)             -> UPDATE 0
UPDATE studio_compliance_documents SET verified_at = now()
  WHERE holder_id = Dana Kowalski's card                      -> UPDATE 0
```

Both writes refused, all reads zero. No cross-tenant read or write reachable
through the four new tables. Consistent with — and now independently confirmed
outside — test block 13's own live assertion.

## 4. The four named fixture people, checked against `briefing/fixture.md`

| ID | Name | fixture.md reach | fixture.md consent | fixture.md docs | **live reach_state** | **live consent_status** | **live paper_state** | Match? |
|---|---|---|---|---|---|---|---|---|
| F-11 | Dana Kowalski | field link | granted (Okonkwo row set 2026-10-12) | COI lapsed 2026-03-31 | `field_link` | `granted` | `lapsed` | **yes** |
| F-12 | Pete Rusk | field link | opted_out (STOP, Lindqvist, 3 Dec 2025) | COI current (exp 2027-01-15) | `field_link` | `opted_out` | `current` | **yes** — r10 F2 confirmed fixed |
| F-16 | Amara Osei | on paper (has an account, unlinkable) | granted (web form, 2026-10-14) | COI/W-9 held, no expiry stated | `on_paper` | `granted` | `lapses_soon`* | yes |
| F-27 | Ray Thao | on paper | n/a (never texted) | n/a — lender/inspector never owed paper | `on_paper` | `not_asked` | `not_on_file`† | yes |

\* Lakeshore Painting's COI is seeded `CURRENT_DATE + 23` on purpose, so this
always reads `lapses_soon`; fixture.md states no expiry, so this is a seed
choice, not a contradiction (per `w1b-report.md` §6, unchanged since r10-tests).

† `not_on_file` is the correct SQL-level fact for a lender/inspector with no
documents; the room prints no paper word for these two roles as a **display**
rule (R-A/C13/PR-e), asserted in SQL by test block 12g. Not a bug.

**All four now match.** F-12 was the one open item from r10-tests (Finding 2 /
MAJOR there); confirmed fixed and holding, live, independent of the suite.

**Confirmed live also**: the raw `studio_channel_consent` rows behind these
verdicts carry the dates fixture.md states — e.g. `+16125550109` (Dana's Okonkwo
number) `granted` `2026-10-12 16:00:00+00`, `+16125550112` (Pete) `opted_out`,
`opt_out_at 2025-12-03 21:00:00+00` ("Replied STOP on the Lindqvist thread, 3 Dec
2025") — see Finding 1 below for what happens to these dates once they reach the
view.

## 5. Every reader of `people_directory` / `v_project_roster` columns

Re-ran the plain-string grep from r10-tests and it under-counts: several
consumers (`person-profile.tsx`, `nurture-view.tsx`, `outreach-view.tsx`,
`portfolio-view.tsx`, `audiences-tab.tsx`, `command-bar.tsx`,
`directory/person-row.tsx`) never spell the literal string "people_directory" —
they consume the row shape through an imported type or hook. Re-ran keyed on
the actual surface (`PeopleDirectoryRow`, `usePeopleDirectory`, `usePerson`,
`useProjectRoster`, `ProjectRosterRow`) to get the true reader set:

```
$ grep -rln "PeopleDirectoryRow\|usePeopleDirectory\|usePerson\b\|useProjectRoster\|ProjectRosterRow" apps packages --include="*.ts" --include="*.tsx" | grep -v "__tests__\|\.test\."
```

**`people_directory` readers** — same 14 as r10-tests §5, unchanged:
`packages/supabase/src/hooks/use-people.ts` (`usePeopleDirectory`, `usePerson`,
both `select('*')`) · `packages/supabase/src/hooks/index.ts` (barrel) ·
`.../lib/document/people-derivation.ts` · `.../lib/document/desk-derivation.ts` ·
`.../lib/document/roster-derivation.ts` ·
`.../components/document/people/people-room.tsx` ·
`.../people/views/directory-view.tsx` · `.../people/directory/person-row.tsx` ·
`.../people/views/person-profile.tsx`, `nurture-view.tsx`, `outreach-view.tsx`,
`portfolio-view.tsx` · `.../people/outreach/audience-rules.ts`,
`audiences-tab.tsx` · `.../people/party-profile-sheet.tsx` ·
`.../document/command-bar.tsx` · `.../document/desk-reconnect.tsx`.

**`v_project_roster` readers via `useProjectRoster`/`ProjectRosterRow`** — the
broader grep surfaces **two more files than r10-tests §5 named**:
`packages/supabase/src/hooks/use-coordination.ts` (`useProjectRoster`, line
1008) · `.../roster/call-sheet-mount.tsx` · `.../roster/call-sheet.tsx` ·
`.../roster/roster-row.tsx` · `.../lib/document/roster-derivation.ts` ·
`apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` (line 2161) ·
`.../components/document/plans/plan-issue-ceremony.tsx` (line 109) ·
`.../components/document/roster/rolodex-picker.tsx` (line 160) ·
`.../components/document/roster/roster-groups.tsx` (type-only) ·
`.../components/document/roster/kickoff-band.tsx` (type-only) ·
`.../components/document/roster/project-team-roster.tsx` (line 37).

**Checked, cleared, not a finding**: `v_project_roster` is untouched by any
migration in this wave (00623–00627 never mention it), so none of the six extra
readers is newly exposed to anything this review needs to grade — the
`project_consent_org()`/`_primary_studio_for()` residue on that view is r10-
tests' already-cleared Finding 3 (R-BD's own named debt, not fresh). Listed here
only because the task asked for every reader, not just the ones a narrower grep
happens to catch.

## 6. Type-checks

```
$ pnpm --dir …/agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(clean, no output, exit 0)

$ pnpm --dir …/agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, no output, exit 0)
```

No type breaks — expected, since `database.types.ts` did not move (§2).

---

## Prior findings, re-checked

| # | r10-tests verdict | This round |
|---|---|---|
| Finding 2 (MAJOR) — seed omits Pete Rusk's field link | Open at r10-tests | **FIXED**, confirmed live (§3, §4) and in the suite (block 12, block "F2" language) |
| Finding 1 (MINOR) — `w1b-report.md` stale relative to HEAD | Open | **STILL OPEN** — the report still reads `compliance_state(holder)`, `reach_state_for(profile_id, card_id, party_id)`, and its last test-block quote is "12. …passed" with no r10 language. Not regenerated across r10 either. Re-confirmed by grep, §"Prior findings" below. |
| Finding 3 — `v_project_roster` checked, cleared | Cleared | Still cleared; re-checked with a wider reader list (§5), no new exposure |
| Finding 4 (MINOR) — `people_directory_scope_test.sql` red (12 vs 17 cols) | Open | **STILL OPEN**, unchanged assertion, unchanged failure (§1) |
| Finding 5 (MINOR) — anon `people_directory` hard-errors instead of returning empty | Open | **STILL OPEN**, unchanged behaviour (§3) |

---

## New findings this round

### Finding 6 — MINOR — the CONTACT branch never joins consent evidence, so every carded identity's Directory row carries no consent dates at all

**File**: `supabase/migrations/00626_people_directory_v4_seats.sql:1366-1401` (the
CONTACTS branch of `people_directory`), contrast `:1159-1301` (the PARTY branch).

**Claim**: r4 MAJOR-4 (`identity_consent_evidence()`, W1b MAJOR-4 / R-BC) fixed
the PARTY branch so `meta.sms_consented_at` / `meta.sms_opt_out_at` come off the
`studio_channel_consent` record that decided the printed verdict (verified live,
§4: Dana's/Pete's/Amara's real dates sit in `studio_channel_consent`). That fix
was wired into the party branch's `meta` (`:1178-1179`,
`ev.consented_at`/`ev.opt_out_at` from a `LEFT JOIN LATERAL
identity_consent_evidence(...)`). The CONTACTS branch — which is now home to
**every carded human** (49 of the studio's 50 `role='contact'`/`sub` Directory
rows, including all four fixture people this review round checked) — computes
its consent **word** the equivalent way
(`identity_consent_status(sc.organization_id, sc.id::text, sc.phone_e164)`,
`:1391`) but its `meta` object (`:1377-1386`) carries no
`sms_consented_at`/`sms_opt_out_at` keys at all — confirmed live:

```
display_name  | consent_status | consented_at | opt_out_at
Amara Osei    | granted        |              |
Dana Kowalski | granted        |              |
Pete Rusk     | opted_out      |              |
Ray Thao      | not_asked      |              |
```

`identity_consent_evidence(p_organization_id, p_identity_key,
p_card_phone_e164)` (`:916-950`) is already the exact three-argument shape the
CONTACTS branch would need — `identity_consent_evidence(sc.organization_id,
sc.id::text, sc.phone_e164)` — the same three values already passed one line
above to `identity_consent_status()`. The omission is mechanical, not a design
choice stated anywhere: neither `w1b-report.md` §4 nor R-BC's own wording
scopes the dates fix to "the party branch only" — R-BC reads "consent dates on
**a directory row**" (unscoped), and the view's own `COMMENT ON VIEW`
(`:1437-1439`) says "00626 moves the two consent DATES onto the record **too**"
without a branch qualifier.

**Failure scenario**: not live today — grepped every consumer of
`PeopleDirectoryRow`/`usePeopleDirectory`/`usePerson` in `apps` and `packages`
(§5) and **none** reads `meta.sms_consented_at` or `meta.sms_opt_out_at` off a
`people_directory` row; the only live readers of those two column names are
`use-coordination.ts` reading them straight off `project_parties` (a different,
frozen-column path, R-AX) and two test fixtures. So no shipped or W2-planned
reader disagrees with the record — this doesn't meet the MAJOR bar. But it is a
real gap the moment anything renders a consent date off a Directory row for a
carded human: R-Q's "one consent sentence wording everywhere" ("Written consent,
2 May 2025, on the Lindqvist kitchen.") needs a source date, and for 49 of 50
Directory rows in this studio's own seed, `people_directory`'s `meta` has none
to give it — the caller would have to re-derive it from
`studio_channel_consent` directly, defeating the point of having moved the
dates onto the view.

**Fix**: mirror the party branch's `LEFT JOIN LATERAL
identity_consent_evidence(sc.organization_id, sc.id::text, sc.phone_e164)` into
the CONTACTS branch's `FROM` clause and add `'sms_consented_at'`,
`'sms_opt_out_at'` to its `meta` `jsonb_build_object(...)` (`:1377-1386`),
mirroring `:1178-1179`. Not urgent — no reader is broken — but worth doing before
W2 (R-BE) builds the person-card consent sentence against this view, so it
doesn't discover the gap mid-build.

---

## Summary

| # | Severity | Confidence | One-line |
|---|---|---|---|
| 1 | MINOR | CONFIRMED | `w1b-report.md` still describes pre-r9 code; still not regenerated across r10 either |
| 4 | MINOR | CONFIRMED | `people_directory_scope_test.sql` still asserts the pre-v4 12-column shape; red at HEAD |
| 5 | MINOR | CONFIRMED | Anon `SELECT * FROM people_directory` still hard-errors rather than returning empty; local-only |
| 6 | MINOR | CONFIRMED | The CONTACTS branch (49 of 50 Directory rows) carries no consent dates in `meta`, unlike the PARTY branch; no live reader broken today, but the gap sits directly under W2's R-BE work |

Zero BLOCKING, zero MAJOR. **Clean by the stated bar** (clean = zero BLOCKING and
zero MAJOR) — the one MAJOR open at r10-tests (Finding 2, Pete Rusk's field link)
is confirmed fixed and holding, both in the suite and independently live. Three
MINORs carried forward unchanged, one new MINOR found this round.

Both SQL suites pass on a fresh reset (0 failures, 20 W1b blocks). Generated
types show zero drift, confirmed twice across the DB-state scare in §0.
Both `type-check` gates are clean. The client role and a genuine cross-tenant
admin both read zero rows from every W1b-added sensitive object and cannot
write to any of them; every ruling in `rulings.md` §3 — R-AW through R-BH —
held in every probe run this round.
