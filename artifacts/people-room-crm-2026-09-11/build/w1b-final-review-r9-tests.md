# W1b — final review round 9, tests/types/behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); nothing touched on
Strata. Prior scope: `build/w1b-final-fix-log-r8.md` (BLOCKING-1 second design
studio, MAJOR-1 roster ungated consent word) — both re-checked below.

## Operational note: a mid-review DB restart

Partway through this round the local Postgres container
(`supabase_db_supabase`) dropped its connection (`connection refused`, then a
query against it returned migration `00309` and no `project_parties` table —
another process reset it out from under this session). A second
`pnpm supabase:reset` (also mid-flight) hit
`FATAL: terminating connection due to unexpected postmaster exit (SQLSTATE
57P01)` and failed. A third reset completed cleanly. This is not a code
finding — it is recorded here because the brief states this wave is the DB's
sole owner and that was not true for part of this run. All results below are
from resets taken *after* the disruption (verified clean twice more,
including one final rerun of both suites), so nothing in this report rests on
the corrupted intermediate state.

## Prior findings, re-walked

| Finding | Status |
|---|---|
| r8 BLOCKING-1 (second design studio admitted to site access card + money authority grant on a studio-less job) | **Still fixed.** `project_recorded_studio()` / `project_party_recorded_studio()` present in 00624/00625; all 8 policies on `project_party_authority` and `project_site_access_cards` read the recorded-studio resolver, confirmed by direct `pg_policy` read-back (below) — byte-identical to the r8 fix log's shipped expressions. Suite blocks 14 and 17 pass. |
| r8 MAJOR-1 (`v_project_roster` printed `not_asked` over an unreadable `opted_out`) | **Still fixed.** `roster-row.tsx:101` reads `row.sms_consent_status` directly (no coalesce); `ConsentChip` in `person-bits.tsx` renders `data-consent-dot="no_record"` / "No record" for null — confirmed by direct grep of the shipped files, not just the report's claim. Suite block 38 (w1a) and blocks 14/17 (w1b) pass. |

Read-back of the policy expressions (`pg_policy` on both tables), matching
the r8 fix log verbatim:

```
project_party_authority_studio_select | is_active_studio_member(project_party_recorded_studio(engagement_id)) AND is_studio_comember(project_party_designer(engagement_id))
project_party_authority_studio_insert | ... AND (scope <> ALL ('{money,draw_certify}') OR is_org_admin_or_owner(project_party_recorded_studio(engagement_id)))
project_site_access_cards_studio_select | is_active_studio_member(project_recorded_studio(project_id)) AND is_studio_comember(project_designer(project_id))
```

No anon grant exists on `project_party_authority`, `project_site_access_cards`,
or `studio_compliance_documents` (`information_schema.role_table_grants`
shows only `authenticated`, `postgres`, `service_role` on all three) —
matches PR-w/probe1's claim independently.

## SQL test suites — full runs, pasted

### `supabase/tests/people/w1a_identity_channels_consent_test.sql`

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f w1a_identity_channels_consent_test.sql
...
NOTICE:  38. one resolver for the seat's studio: reader and writer agree, no view prints another studio's consent word (close-review r1 MAJOR-1), and an unreadable record degrades to NULL rather than to the affirmative `not_asked` (w1b final review r8 MAJOR-1): passed
...
NOTICE:  44. the site-request rail asks the record and writes no seat, and a record-granted / seat-refused number is sendable (R-AW): passed
NOTICE:  45h. a release that raises is a warning, not an aborted consent act (final-run MAJOR-3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
EXIT=0
```

Ran clean twice on two independent resets (post-disruption).

### `supabase/tests/people/w1b_compliance_authority_directory_test.sql`

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f w1b_compliance_authority_directory_test.sql
NOTICE:  1. compliance_state: four words, the 30-day boundary both ways, worst-first precedence, a superseded lapse released, and a gateless lapse that changes nothing until it holds a gate: passed
NOTICE:  2. the holder guard: ... for ALL NINE types, keyed on the paper's own date and not on a vocabulary — a DATED paper may only be retired by a dated successor that is itself in force and carries at least the gates it retires: passed
NOTICE:  3. people_directory v4: one row per identity, Dana's two seats beneath it, her four fixture words, no person-level stage, an honest 28 + 21, the consent word reduced worst-first over every number the identity carries ... and the paper word reduced worst-first over the person's own card AND their firm: passed
NOTICE:  4. the uncarded identity: ...: passed
NOTICE:  5. project_party_authority: a member records selections and is refused money and draw certification, an owner records both, and a non-member reads nothing (PR-n): passed
NOTICE:  6. copy_to: a seat on another job is refused, a seat on this one lands: passed
NOTICE:  7. the site access card: no code column and no client toggle (PR-r), four studio policies, a client reads nothing and anon is refused at the grant (PR-w): passed
NOTICE:  8. the key holder must be a seat on the card's own project: passed
NOTICE:  9. v_access_grants: ...: passed
NOTICE:  10. create_field_link: ...: passed
NOTICE:  11. the seat's new columns are writable by a member, the eight consent columns are still frozen, the stage vocabulary is closed, and the firm pointer must be a firm in this studio: passed
NOTICE:  12. the seeded fixture reads as the fixture: five granted numbers, Pete's Lindqvist refusal answering on Okonkwo, Joe invited, Frank routed to Rosa, Ray never texted, the lender's paper reported as a fact, Chidi's $2,500 line in cents, Erin preparing only, and Ngozi holding the key: passed
NOTICE:  13. the tenant boundary: ...: passed
NOTICE:  14. a studio-less job: ...: passed
NOTICE:  15. the client branch inherits designer_clients' own posture exactly ...: passed
NOTICE:  16. the number set and the identity's consent word: ...: passed
NOTICE:  17. the designer's SECOND DESIGN STUDIO on a studio-less job: ...: passed
NOTICE:  All W1b assertions passed.
ROLLBACK
EXIT=0
```

All 17 assertion blocks pass. Ran clean on three independent resets.

## Reset determinism

```
$ pnpm supabase:reset   (run #1, post-disruption)   → EXIT=0, no /^ERROR/ lines, people_crm_dev.sql seeded
$ pnpm supabase:reset   (run #2)                     → EXIT=0, no /^ERROR/ lines
$ psql ... -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 6;"
20260910152111
00627
00626
00625
00624
00623
```

Migration ledger matches the report's claim on every run: W1b mints 00623–00627,
00595–00620 untouched.

## Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir .../agent-people-build db:generate
Connecting to db 5432
$ git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty)
```

No drift — the checked-in `database.types.ts` is exactly what a fresh
`db:generate` against the reset DB produces. (Docker-socket access and the
`~/.supabase/telemetry.json` write both needed the sandbox lifted — genuine
sandbox restrictions, not project issues; noted for completeness, not a
finding.)

## Role probes: designer, client, anon

`designer@patina.dev` = `a0000000-0000-0000-0000-000000000004`,
`client@patina.dev` = `a0000000-0000-0000-0000-000000000005` (from
`supabase/seed/dev-accounts.sql:15,16`).

```sql
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','<uid>','role','authenticated')::text, true);
```

| Caller | `people_directory` | `project_site_access_cards` | `project_party_authority` |
|---|---|---|---|
| designer@patina.dev (studio owner) | 62 rows (49 contact + 7 client + 5 lead + 1 sub — matches the report's own table) | 1 | 11 |
| client@patina.dev | 0 | **0** | 0 |
| anon | `permission denied for table project_site_access_cards` (refused at the GRANT) | same | — |

**Confirms the brief's assertion literally: a client role cannot see
`project_site_access_cards`** (0 rows, not merely an empty result of a
broader filter — the client account here has no studio-comember standing at
all, so this is the RLS/grant boundary doing its job, consistent with PR-w's
"no client leg" policy shape read back above). Anon is refused before any
policy runs, matching probe1/PR-w.

## Fixture-word cross-check: F-11, F-12, F-16, F-27

Queried `people_directory` directly as `designer@patina.dev`:

```
 display_name  |  role   | reach_state | consent_status | paper_state | seat_count
---------------+---------+-------------+----------------+-------------+------------
 Amara Osei    | contact | on_paper    | granted        | lapses_soon |          1
 Dana Kowalski | contact | field_link  | granted        | lapsed      |          2
 Pete Rusk     | contact | on_paper    | opted_out      | current     |          2
 Ray Thao      | contact | on_paper    | not_asked      | not_on_file |          1
```

Against `briefing/fixture.md` §2 (columns: Reach reality | **Patina reach
today** | Phone | Email | **Consent** | Docs held):

| ID | Fixture reach | DB reach | Fixture consent | DB consent | Fixture paper | DB paper |
|---|---|---|---|---|---|---|
| F-11 Dana Kowalski | field link | `field_link` ✓ | granted | `granted` ✓ | COI exp 2026-03-31, **LAPSED** | `lapsed` ✓ |
| F-12 Pete Rusk | **field link** | **`on_paper`** ✗ | opted_out | `opted_out` ✓ | COI exp 2027-01-15 (in force) | `current` ✓ |
| F-16 Amara Osei | on paper | `on_paper` ✓ | granted | `granted` ✓ | COI/W-9 yes (no dates given; report names Lakeshore as the deliberate `CURRENT_DATE+23` demo row) | `lapses_soon` — consistent, not a mismatch |
| F-27 Ray Thao | on paper | `on_paper` ✓ | n/a (do not text) | `not_asked` — the closest fact the 4-word vocabulary has for "nobody solicited SMS consent," consistent with PR-e (no fifth word) | n/a (site inspection, pass/fail) | `not_on_file` — the DB fact; R-A/R-N suppress printing it on screen, which is a display rule, not a data defect |

**Finding: F-12 Pete Rusk's reach word does not match the fixture.**
Traced to `supabase/seed/people_crm_dev.sql:895-911` — the
`create_field_link()` mint loop names six parties (F-08 Erin, F-09 Luis, F-11
Dana, F-18 Joe, F-06 Ngozi, F-28 Erin's second seat) and Pete is not among
them, on either of his two seats (`d0e30000-…-012` Okonkwo `awarded`,
`d0e40000-…-012` Lindqvist `warranty`). With no `field_link_tokens` row for
either seat and no Patina account, `reach_state_for()` correctly falls
through to `on_paper` per its own documented order (account → live field link
→ on paper) — this is the view computing exactly what the seed gives it. The
mismatch is a seed-data gap against `fixture.md`'s own table, not an RLS,
consent, or logic defect: nothing about Pete's opt-out is affected (his
`opted_out` consent word is correct and independently verified above), and no
gate reads `reach_state` for anything but display. Suite block 12's "the
seeded fixture reads as the fixture" NOTICE checks Pete's *consent* only, not
his reach word, so this went unasserted. Not covered by rulings §3 as settled.

## Readers of `people_directory` and `v_project_roster`

Grepped `apps/` and `packages/` for both, then narrowed to actual `.from(...)`
call sites (the rest are comments naming the view, which the report's own §4
table also lists as commentary):

- **`people_directory`** — exactly two live query sites, both in
  `packages/supabase/src/hooks/use-people.ts`: `:125` (`usePeopleDirectory`,
  `select('*')`) and `:161` (`usePerson`, `select('*').eq('person_id', ...)`).
  Matches the report's claimed reader list exactly; no other `.from('people_directory')`
  call exists in `apps/` or `packages/`.
- **`v_project_roster`** — exactly one live query site:
  `packages/supabase/src/hooks/use-coordination.ts:1008`. Consumers
  (`roster-row.tsx`, `roster-derivation.ts`, `call-sheet.tsx`,
  `call-sheet-mount.tsx`, `person-bits.tsx`, `letterhead-instruments.tsx`)
  all read the hook's derived rows, not the view directly.
- Verified the r8 MAJOR-1 fix is actually shipped in these files (not just
  claimed): `roster-row.tsx:101` — `const consent = row.sms_consent_status;`
  (no `??`/coalesce); `person-bits.tsx` `ConsentChip` sets
  `dotKey = noRecord ? 'no_record' : key` and renders "No record" for a null
  status.

## Types and lint gates

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(exit 0, no output)

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(exit 0, no output)
```

Both clean. No type breaks from the regenerated `database.types.ts` (which,
per the diff above, did not change at all against the checked-in file).

## Sandbox notes (not findings)

Two commands needed the bash sandbox lifted to succeed, both clearly
sandbox-caused and unrelated to the code under review:
`pnpm supabase:reset` (writes `~/.supabase/telemetry.json.tmp.*`,
`EPERM`) and `pnpm --filter @patina/supabase generate` (needs the Docker
socket to inspect the running `supabase_db` container). Recorded for anyone
re-running this review.

## Summary

- Both SQL suites pass in full (48 + 17 assertion blocks), on three
  independent resets, including two taken after an unrelated mid-review DB
  restart from another process.
- `db:generate` produces zero diff against the checked-in
  `database.types.ts`; both `type-check` gates (`@patina/supabase`,
  `@patina/designer-portal`) are clean.
- Role probes independently confirm: the client account reads 0 rows from
  `project_site_access_cards` (and `people_directory`/`project_party_authority`
  alike), anon is refused at the grant before any RLS policy runs, and the
  designer/studio-owner reads the full seeded set (62 directory rows / 1 site
  access card / 11 authority grants) — all matching the report's own probe
  output.
- Both r8 findings (BLOCKING-1 second-design-studio gate, MAJOR-1 roster
  ungated consent word) are independently re-verified fixed by reading the
  shipped policy expressions and the shipped React code, not by trusting the
  fix log's prose.
- One new finding: F-12 Pete Rusk's `reach_state` (`on_paper`) does not match
  `fixture.md`'s "field link" — a seed-data omission (Pete's two seats are
  excluded from the `create_field_link()` mint loop in
  `people_crm_dev.sql:895-911`), not a consent, RLS, or cross-tenant defect.
  Graded MINOR: no gate anywhere reads `reach_state`, and Pete's `opted_out`
  consent word — the fact that actually governs sending — is correct and
  independently verified.

No BLOCKING or MAJOR findings survive or newly appear in this round.

## Findings

### MINOR-1 — F-12 Pete Rusk's seeded `reach_state` does not match `fixture.md`

- **File**: `supabase/seed/people_crm_dev.sql:895-911`
- **Claim**: The `create_field_link()` mint loop names six parties (F-08,
  F-09, F-11, F-18, F-06, F-28) and omits Pete Rusk's two seats
  (`d0e30000-0000-0000-0000-000000000012`, `d0e40000-0000-0000-0000-000000000012`).
  With no active `field_link_tokens` row and no linked account, `people_directory`
  reports `reach_state = 'on_paper'` for Pete, while `briefing/fixture.md:39`
  states his "Patina reach today" is "field link" — confirmed live against
  the reset DB as `designer@patina.dev`.
- **Failure scenario**: None operationally — `reach_state` is a display-only
  fact (PR-e: three words, never gates a send); Pete's `consent_status =
  'opted_out'` (the field that actually governs whether he can be texted) is
  correct and matches the fixture. The only consequence is that a designer
  viewing Pete's Directory row sees "On paper" instead of "Field link,"
  and the fixture's own acceptance table is not fully realized by the seed.
- **Fix**: Either add Pete's Okonkwo seat to the `create_field_link()` loop
  in `people_crm_dev.sql` (matching the fixture), or correct
  `fixture.md`'s F-12 "Patina reach today" cell to "on paper" if the seed's
  choice (no field link while `stage = 'awarded'`, before mobilization) is
  the intended behavior — and add a suite assertion for F-12's reach word
  alongside block 12's existing consent check so a future seed change can't
  silently reintroduce or hide the same gap.
