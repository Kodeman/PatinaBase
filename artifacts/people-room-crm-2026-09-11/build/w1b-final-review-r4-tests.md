# W1b — final-run round 4: tests, types, behaviour review

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Supabase only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) — this wave's sole
owner for the duration of this review. No `supabase db push`, no `supabase functions deploy`, no
`supabase link`, no prod act of any kind. `git -C .../agent-people-build status` was clean
(working tree clean, up to date with origin) both before and after this review — nothing here
edited the branch.

**Verdict: CLEAN.** Zero BLOCKING, zero MAJOR. One MINOR (fresh, this round). Every finding r3's
fix log claimed fixed is independently confirmed fixed, in code and in a green re-run.

---

## 0. Prior findings, re-checked

r3 handed over three findings; the fix log at
`build/w1b-final-fix-log-r3.md` claims all three fixed and everything else (r2's carried MINORs
plus r3 MINOR-26…30) untouched and still open.

| Finding | Claimed fix | Re-check | Status |
|---|---|---|---|
| r3 migrations MAJOR-1 — an already-lapsed successor, and `blocks`' empty default | Two new legs on `assert_compliance_holder()`: `compliance_successor_already_lapsed`, `compliance_successor_drops_a_gate` | Both exception strings present, `00623_studio_compliance_documents.sql:383,393`; test legs 2p/2p0/2p1 (door c) and 2q0–2q3 (door d) present in `w1b_compliance_authority_directory_test.sql:533-617`; suite block 2 passed | **CONFIRMED FIXED** |
| r3 migrations MAJOR-2 — a client/lead/maker/team row claimed a `seat_count` it cannot nest | `seat_count` is `0::integer` on those four branches, not `identity_seat_count(<profile id>)` | `00626_people_directory_v4_seats.sql:550,586(≈632),797` all read `0::integer AS seat_count`; test legs 4l/4m/4n present at `:1072,1079,1088`; suite block 4 passed | **CONFIRMED FIXED** |
| r3 tests-review MAJOR-1 — the PARTY branch's consent word read the winning seat's number, not the identity | `identity_consent_status()` hoisted above the `DISTINCT ON`, keyed on `identity_key` | `00626_people_directory_v4_seats.sql:728-730` — `COALESCE(public.identity_consent_status(project_consent_org(q0.project_id), q0.identity_key, NULL), 'not_asked')` wraps `q0`, the `DISTINCT ON` subquery; test legs 4e6–4e11 present at `:965,999`; w1a leg 37c2/37c3 present at `w1a_identity_channels_consent_test.sql:4867,4872`; both suites passed | **CONFIRMED FIXED** |

All open MINORs from r2/r3 (MINOR-26…30 and r2's carried set) were not re-litigated item-by-item —
they were not handed to this round and the fix log's own scope statement says they remain open.
None of them bears on the BLOCKING/MAJOR classes this round grades on.

---

## 1. Both SQL test suites, run fresh

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  45h. a release that raises is a warning, not an aborted consent act (final-run MAJOR-3): passed
NOTICE:  All W1a assertions passed.
W1A_EXIT=0
```

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
NOTICE:  1. compliance_state: ... a gateless lapse that changes nothing until it holds a gate: passed
NOTICE:  2. the holder guard: ... a supersede must be the same paper covering at least as long ...
           a renewal must itself be in force and carry at least the gates it retires: passed
NOTICE:  3. people_directory v4: ... the consent word reduced worst-first over every number the
           identity carries — the card's and its seats': passed
NOTICE:  4. the uncarded identity: ... PR-c's login-stamped client_rep seats leave the client row
           claiming 0, and no row anywhere claims a count it cannot nest: passed
NOTICE:  5. project_party_authority: ... (PR-n): passed
NOTICE:  6. copy_to: ... passed
NOTICE:  7. the site access card: ... (PR-r) ... (PR-w): passed
NOTICE:  8. the key holder must be a seat on the card's own project: passed
NOTICE:  9. v_access_grants: ... (PR-d) ... (PR-l) ...: passed
NOTICE:  10. create_field_link: ... the 90-day fallback survives for a windowless seat and for a
           CLOSED one, no mint is dated in the past or revokes on behalf of one ...: passed
NOTICE:  11. the seat's new columns ... : passed
NOTICE:  12. the seeded fixture reads as the fixture: ... : passed
NOTICE:  All W1b assertions passed.
W1B_EXIT=0
```

Both exit 0. The w1b suite's block 2 and block 3/4 NOTICE text is richer than `w1b-report.md`'s
printed excerpt, confirming the r3 fixes' new legs actually run as part of the 12-block suite (not
appended separately and forgotten).

A full `pnpm --dir .../agent-people-build supabase:reset` preceded these runs (migrations
`00623`–`00627` applied, `people_crm_dev.sql` seeded, then `20260910152111`). The only line
matching `/error/i` in the whole reset log is the migration filename
`00458_sms_message_error_capture.sql`, exactly as the report claims. A second, independent reset
run reproduced the identical result. Seed replay against the already-seeded DB
(`psql -f supabase/seed/people_crm_dev.sql` a second time) is idempotent: `docs=36 seats(carded)=28
authority=11 site_cards=1 consent=7`, unchanged from the post-reset counts.

## 2. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
GEN_EXIT=0
$ git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty)
```

No drift between the checked-in types and a fresh `db:generate` off the reset database.

## 3. Role probes — designer, client, anon

Probed live with `SET LOCAL ROLE` + `request.jwt.claims`, inside `BEGIN…ROLLBACK`, against the
reset+seeded database.

**`designer@patina.dev`** (studio owner, `Local Dev Studio`) reads the full room:
`people_directory` 62 rows (client 7 / contact 49 / lead 5 / sub 1), `people_directory_seats` 31,
`project_site_access_cards` 1, `studio_compliance_documents` 36, `project_party_authority` 11,
`v_access_grants` 12 rows across `client_account`(3) / `field_link`(6) / `studio_member`(3) tiers —
all consistent with the report's §7 numbers.

**Client accounts** — two tried, `client@patina.dev` (a plain client with no seat in this studio)
and `client-solo@patina.dev` (the login PR-c's two `client_rep` seats are stamped with, per the r3
fix log's own probe92 walk). Both read:

```
project_site_access_cards  = 0
studio_compliance_documents = 0
project_party_authority     = 0
people_directory_seats      = 0
v_access_grants             = 0
people_directory             = 0 rows
```

No cross-tenant or cross-role leak on any of the five surfaces, for either account. `PR-w` ("no
client leg" on `project_site_access_cards`) holds under a live probe, not only in the SQL suite.

**`anon`** — refused before any policy runs, at the GRANT itself, on every table this wave added:

```
project_site_access_cards    → ERROR: permission denied for table project_site_access_cards
studio_compliance_documents  → ERROR: permission denied for table studio_compliance_documents
project_party_authority      → ERROR: permission denied for table project_party_authority
people_directory_seats       → ERROR: permission denied for view people_directory_seats
v_access_grants              → ERROR: permission denied for view v_access_grants
people_directory              → ERROR: permission denied for table studio_contacts
```

The last line is worth stating precisely because it differs in shape from the report's framing.
`people_directory` itself still carries the pre-existing local-only blanket `anon` SELECT grant
(confirmed: `information_schema.role_table_grants` shows `anon|SELECT` on the view, and
`studio_contacts` — a table the view's contacts branch reads — has no `anon` grant at all). Because
the view is `security_invoker=true`, querying it as `anon` fails outright on the first
ungranted underlying table rather than returning zero rows through RLS. That is a **harder**
refusal than "RLS filters to nothing," not a weaker one — there is no path by which `anon` reads
any row of `people_directory`, seeded or otherwise. Not a finding; noted because it's a more precise
statement than "anon reads nothing through RLS."

(One transient, self-resolving artefact during this probing: the `postgres` container briefly
showed `health: starting` moments after a `supabase db reset`'s "Restarting containers" step, and a
handful of queries in that exact window threw spurious `permission denied` on ordinary tables with
confirmed grants. Re-run after the container reported healthy reproduced clean, consistent results
every time; this is a reset-timing artefact of the *local* stack, not a grant or RLS defect, and is
called out only so it isn't mistaken for one if `run_in_background` reset+probe scripts are chained
closely together in a future round.)

## 4. The seeded Okonkwo people vs `fixture.md`

Queried `people_directory` as `designer@patina.dev` for `reach_state` / `consent_status` /
`paper_state`, compared against `briefing/fixture.md`'s "Patina reach today" / "Consent" / "Docs
held" columns for F-11, F-12, F-16, F-27.

```
 display_name  |  role   | reach_state | consent_status | paper_state | seat_count
---------------+---------+-------------+----------------+-------------+------------
 Amara Osei    | contact | on_paper    | granted        | lapses_soon |          1
 Dana Kowalski | contact | field_link  | granted        | lapsed      |          2
 Pete Rusk     | contact | on_paper    | opted_out      | current     |          2
 Ray Thao      | contact | on_paper    | not_asked      | not_on_file |          1
```

| ID | Fixture reach | DB reach | Fixture consent | DB consent | Fixture paper | DB paper |
|---|---|---|---|---|---|---|
| F-11 Dana Kowalski | field link | **field_link** ✓ | granted | **granted** ✓ | COI lapsed 2026-03-31 → lapsed | **lapsed** ✓ |
| F-12 Pete Rusk | field link | **on_paper** ✗ | opted_out | **opted_out** ✓ | COI current to 2027-01-15 → current | **current** ✓ |
| F-16 Amara Osei | on paper | **on_paper** ✓ | granted | **granted** ✓ | Lakeshore COI at CURRENT_DATE+23 → lapses_soon | **lapses_soon** ✓ (verified `expires_on = 2026-10-05`, 23 days from today `2026-09-12`) |
| F-27 Ray Thao | on paper | **on_paper** ✓ | n/a (do not text) → not_asked | **not_asked** ✓ | n/a → not_on_file (R-A display rule, fact still reported) | **not_on_file** ✓ |

11 of 12 words match exactly. **One mismatch: F-12 Pete Rusk's reach word.** Root cause traced to
the seed, not to `reach_state_for()`:

```sql
-- reach_state_for(): 'field_link' iff an ACTIVE, unexpired field_link_tokens row
-- exists on one of the identity's seats. No consent gating in the function.
```

```
-- supabase/seed/people_crm_dev.sql:895-911, the create_field_link mint loop:
FOREACH v_party IN ARRAY ARRAY[
  'd0e30000-…-008'::uuid,  -- F-08 Erin, Okonkwo
  'd0e30000-…-009'::uuid,  -- F-09 Luis, Okonkwo
  'd0e30000-…-011'::uuid,  -- F-11 Dana, Okonkwo
  'd0e30000-…-018'::uuid,  -- F-18 Joe, Okonkwo
  'd0e30000-…-006'::uuid,  -- F-06 Ngozi, Okonkwo
  'd0e40000-…-008'::uuid   -- F-28 Erin's second seat
] LOOP ...
```

Pete Rusk (F-12) is not in that list, and a direct query confirms zero rows in `field_link_tokens`
for either of his two seats. `reach_state_for()` is doing exactly what it's specified to do —
`consent_status = opted_out` and no live field link means `on_paper` is the honest word, and it
agrees with the underlying `field_link_tokens` record. This is **not** a reader-disagrees-with-record
defect (MAJOR class): the reader and the record agree perfectly. It is a **seed-vs-briefing-fixture
mismatch** — `fixture.md`'s "Patina reach today" column, which the legend defines as "the
`ReachState` the roster would derive," says `field link` for Pete, but the seed deliberately never
mints him one (he has no email on file per the same fixture row, and is opted out of text, so there
is arguably no channel left to deliver a field link through — which is plausibly the *right* real
product behavior, just not what the fixture states). Filed as MINOR below; it is a documentation/
seed-fidelity gap, not a consent or tenancy defect, and it does not touch anything the severity
classes call BLOCKING or MAJOR.

## 5. Every reader of `people_directory` / `v_project_roster`

Actual query call sites (`.from('people_directory')` / `.from('v_project_roster')`), not just
comment mentions, in `apps` and `packages`:

```
packages/supabase/src/hooks/use-people.ts:125   .from('people_directory').select('*')   (usePeopleDirectory)
packages/supabase/src/hooks/use-people.ts:161   .from('people_directory').select('*').eq('person_id', personId)   (usePerson)
packages/supabase/src/hooks/use-coordination.ts:1008   .from('v_project_roster')
```

Confirmed exactly the report's claim ("all directory reads go through `usePeopleDirectory` /
`usePerson`, both `select('*')`"). The `v_project_roster` call site is the one already named in the
report's "owed to W2" list (R-AV: Patina Field's roster reader is repointed in a different
program) — no new reader of either surface was found.

Consumers of the resulting row shape (via `PeopleDirectoryRow`, `usePeopleDirectory`, `usePerson`)
were enumerated by grep for those three symbols across `apps` and `packages`; the union matches the
report's §4 table (`use-people.ts`, `people-derivation.ts`, `desk-derivation.ts`,
`roster-derivation.ts`, `people-room.tsx`, `directory-view.tsx`, `person-row.tsx`,
`person-profile.tsx`/`nurture-view.tsx`/`outreach-view.tsx`/`portfolio-view.tsx`,
`audience-rules.ts`/`audiences-tab.tsx`, `party-profile-sheet.tsx`, `command-bar.tsx`,
`desk-reconnect.tsx`, `hooks/index.ts`) plus their test files, and several files
(`use-vendors.ts`, `use-coordination.ts`, `use-clients.ts`, `brief-section.tsx`, `roster-row.tsx`,
`household-sheet.tsx`, `makers-marketplace.tsx`, `person-bits.tsx`, `maker-profile.tsx`) that only
*mention* `people_directory` in a comment and issue no query against it. No file queries the view
directly other than the two `use-people.ts` call sites named above.

## 6. Type-checks

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
SUPABASE_TC_EXIT=0

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
DESIGNER_TC_EXIT=0
```

Both clean. No type break from the regenerated (in this case, byte-identical) `database.types.ts`.

## 7. Migration numbering

```
$ ls supabase/migrations | awk -F_ '{print $1}' | sort -n | awk '$1>=595 && $1<=627'
00621
00622
00623
00624
00625
00626
00627
```

00595–00620 untouched. 00621/00622 pre-exist (00622 is the R-AY consent-record pass, landed after
the brief was written — the report's §0 explanation for why W1b mints from 00623, not the brief's
stated 00622, checks out). W1b's own five files are exactly 00623–00627. No collision with the
reserved range.

`supabase/config.toml`'s two `[db.seed]` arrays (local and `[remotes.staging.db.seed]`) both list
`./seed/people_crm_dev.sql`, confirmed by direct grep — matches the report's §6/§8 statement
verbatim. That item is already flagged in the report as owed to Fable's ruling (whether the Okonkwo
fixture should reach staging), not reopened here.

---

## Findings

### MINOR-1 — Pete Rusk (F-12)'s reach word diverges from `fixture.md`'s stated target

- **File**: `supabase/seed/people_crm_dev.sql:895-911` (the `create_field_link` mint loop) vs.
  `artifacts/people-room-crm-2026-09-11/briefing/fixture.md:39` (F-12's "Patina reach today"
  column).
- **Claim**: `fixture.md` states Pete Rusk's derived reach should read `field link`. The seed does
  not mint him a `field_link_tokens` row on either of his two Okonkwo/Lindqvist seats (he is absent
  from the six-party mint loop, unlike F-06/F-08/F-09/F-11/F-18/F-28), so
  `people_directory.reach_state` for him reads `on_paper` — a real mismatch against the fixture's
  stated word, confirmed live against the reset+seeded database.
- **Why MINOR, not MAJOR**: `reach_state_for()` (the reader) and `field_link_tokens` (the record)
  agree completely — there is no reader-disagrees-with-record defect, and nothing here touches
  consent gating, tenancy, or a write path. It is a seed-data-vs-planning-fixture fidelity gap. It
  is arguably the *more correct* real-world behavior (Pete has no email on file per the same
  fixture row and is opted out of text, so there is no channel left to deliver a link through), but
  that argument belongs in a ruling or in an amended fixture note, not silently.
- **Fix**: either (a) add Pete's two seats to the seed's `create_field_link` mint loop so the built
  system matches the fixture's stated word, or (b) amend `fixture.md`'s F-12 "Patina reach today"
  cell to `on paper` with a one-line note explaining why (no channel survives the opt-out + no
  email), so a future fixture-driven walkthrough doesn't flag this line as a regression. Either is a
  one-line change; no schema or RLS change implied.
