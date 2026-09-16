# W1b final review, round 1 — tests, types, and role-probed behavior

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Local Supabase only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), this wave's sole owner for the
session. Nothing pushed to Strata. Reviewed against `artifacts/people-room-crm-2026-09-11/build/w1b-report.md`
and `artifacts/people-room-crm-2026-09-11/rulings.md` §3 (every ruling there, including R-AW, is settled —
not re-litigated below).

## Verdict

**clean = true.** Zero BLOCKING, zero MAJOR. Two MINOR findings below.

## 1. Both SQL suites, run directly

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  45h. a release that raises is a warning, not an aborted consent act (final-run MAJOR-3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
$ echo $?   # 0
```
48 individual assertions + the summary NOTICE = 49 lines matching `passed`, unchanged from the W1a close-out.

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
NOTICE:  1. compliance_state: four words, the 30-day boundary both ways, worst-first precedence, and a superseded lapse released: passed
NOTICE:  2. the holder guard: a person is not a firm, a document belongs to one studio, other_named needs its label, and blocks is a closed vocabulary: passed
NOTICE:  3. people_directory v4: one row per identity, Dana's two seats beneath it, her four fixture words, no person-level stage, and an honest 28 + 21: passed
NOTICE:  4. the uncarded identity: two seats on two jobs collapse to one row keyed on the phone, pointing at the newest seat: passed
NOTICE:  5. project_party_authority: a member records selections and is refused money and draw certification, an owner records both, and a non-member reads nothing (PR-n): passed
NOTICE:  6. copy_to: a seat on another job is refused, a seat on this one lands: passed
NOTICE:  7. the site access card: no code column and no client toggle (PR-r), four studio policies, a client reads nothing and anon is refused at the grant (PR-w): passed
NOTICE:  8. the key holder must be a seat on the card's own project: passed
NOTICE:  9. v_access_grants: F-08's field link ends with the engagement (PR-d), her warranty seat's link takes the later date (PR-l), no bearer credential is in the ledger, and the four grant-closed sources read without raising: passed
NOTICE:  10. create_field_link: the engagement window sets the expiry and outranks a caller date, warranty answers alone, the 90-day fallback survives for a windowless seat, the supersede and 00284's ownership guard are untouched: passed
NOTICE:  11. the seat's new columns are writable by a member, the eight consent columns are still frozen, the stage vocabulary is closed, and the firm pointer must be a firm in this studio: passed
NOTICE:  12. the seeded fixture reads as the fixture: five granted numbers, Pete's Lindqvist refusal answering on Okonkwo, Joe invited, Frank routed to Rosa, Ray never texted, the lender's paper reported as a fact, Chidi's $2,500 line in cents, Erin preparing only, and Ngozi holding the key: passed
NOTICE:  All W1b assertions passed.
ROLLBACK
$ echo $?   # 0
```

Both outputs are byte-for-byte the same wording as `w1b-report.md` §7.

**Reproduced on a fresh reset**, not just the worktree's live DB (see §2) — reran both suites
immediately after `pnpm supabase:reset`; identical `passed` output, exit 0 both times.

## 2. `pnpm supabase:reset`, including the seed

```
$ pnpm supabase:reset
Applying migration 00623_studio_compliance_documents.sql...
Applying migration 00624_project_party_window_and_authority.sql...
Applying migration 00625_project_site_access_cards.sql...
Applying migration 00626_people_directory_v4_seats.sql...
Applying migration 00627_access_grants_and_field_link_window.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
...
Seeding data from supabase/seed/people_crm_dev.sql...
Seeding data from supabase/seed/99-local-edge-settings.sql...
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

Clean exit, no error. Migration order is exactly the ledger in §0 of the report: 00623→00627, sandwiched
between 00594/00621/00622 and the pre-existing `20260910152111_create_contact_messages.sql`. 00595–00620
untouched, confirmed by `ls supabase/migrations/` showing the gap. The seed runs on every reset, as claimed.

(Sandbox note: `supabase status`/`reset` needed `dangerouslyDisableSandbox` — the CLI's telemetry writer hit
`EPERM` on `~/.supabase/telemetry.json.tmp.*` under the default sandbox. Not a project defect.)

## 3. `db:generate` and the types diff

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir <worktree> db:generate
GEN_EXIT=0
$ git -C <worktree> diff --stat -- packages/supabase/src/database.types.ts
(empty)
```

No drift: a fresh regeneration against the reset DB reproduces the committed `database.types.ts` exactly.

## 4. Role probes — designer, client, anon, and a genuinely unrelated studio

All via `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"<uid>","role":"authenticated"}'`
inside a rolled-back transaction, against the freshly reseeded DB.

**designer@patina.dev** (`a0000000-…-0004`, owner of Local Dev Studio `b0000000-…-0001`):

| relation | count |
|---|---|
| people_directory | 62 |
| people_directory_seats | 31 |
| project_site_access_cards | 1 |
| studio_compliance_documents | 36 |
| project_party_authority | 11 |
| v_access_grants | 12 |

Matches the report's own probe (§7, "the room's own reads") and the seed's stated counts (36 documents, 11
authority grants, 1 site access card).

**client@patina.dev** (`a0000000-…-0005`, no `organization_members` row at all): all six relations return
**0**. Confirms the report's §7 "what a CLIENT account reads" table.

**A studio member who is NOT a designer but IS a co-member** (`studio_manager@patina.dev`,
`a0000000-…-0003`, `admin` on Local Dev Studio): sees the identical 62/31/1/36/11/12 — expected, correct
studio-co-member behavior, not a leak. (Caught this by hand while looking for a cross-tenant probe subject;
the account is legitimately in the same organization, so it should agree.)

**A genuinely unrelated studio owner** (`cf-phase1-alice@patina.invalid`, `cf100000-…-0001`, owner of a
*different* organization with **zero** membership in Local Dev Studio):

| relation | count |
|---|---|
| people_directory | 0 |
| people_directory_seats | 0 |
| project_site_access_cards | 0 |
| studio_compliance_documents | 0 |
| project_party_authority | 0 |
| v_access_grants | 1 |

The single `v_access_grants` row was investigated directly (`SELECT * FROM v_access_grants` under her
claims) — it is her own `studio_member` grant for her own organization (`cf120000-…-0001`), not anything
belonging to Local Dev Studio or the Okonkwo project. **No cross-tenant leak.** `is_studio_comember()`
(read via `pg_get_functiondef`) requires either `p_owner = auth.uid()` or a shared, active,
non-`guest`-role `organization_members` row on both sides — structurally excludes an unrelated owner
regardless of any accidental project association, which is why this check is meaningful and not just an
artifact of the seed having no cross-links.

**anon**: every one of the six relations raises `permission denied` (verified directly for
`people_directory`: `ERROR: permission denied for table studio_contacts`, since the view is
`security_invoker` and the underlying `studio_contacts` table was never granted to `anon` — this is a
GRANT-level refusal, not an RLS filter, which is a *stronger* guarantee than "reads zero rows," though it
means the report's phrase "anon reads nothing through RLS" undersells the mechanism slightly — it's refused
before RLS ever runs). `project_site_access_cards` matches the report's own probe: refused at the grant.

**A client cannot see `project_site_access_cards`**: confirmed twice — the client account probe above (0
rows) and structurally, since the table's four policies (`is_studio_comember(project_designer(project_id))`)
have no client leg at all (read directly from `supabase/migrations/00625_project_site_access_cards.sql:181-208`
and confirmed live via `pg_policy`).

## 5. Type-checks

```
$ pnpm --dir <worktree> --filter @patina/supabase type-check
SUPABASE_TC=0
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check
DESIGNER_TC=0
```

Both clean, matching the report. No type breaks from the regenerated `database.types.ts`.

## 6. Every reader of `people_directory` / `v_project_roster`

Grepped `apps/` and `packages/` (not just the report's own list) for both view names:

- **`people_directory`** literal-string hits beyond the report's §4 table: `brief-section.tsx`,
  `overlays/household-sheet.tsx`, `people/directory/makers-marketplace.tsx`, `people/person-bits.tsx`,
  `people/profile/maker-profile.tsx`, `roster/call-sheet-mount.tsx`, `roster/roster-row.tsx`,
  `use-clients.ts`, `use-coordination.ts`, `use-vendors.ts`. **Checked each**: every one of these is a prose
  comment referencing `people_directory` conceptually (e.g. "the People Room reads this same edit through
  people_directory") — none of them actually queries the view or reads its row shape. The report's reader
  list is complete for actual readers.
- **`v_project_roster`** hits: `letterhead-instruments.tsx`, `roster/call-sheet.tsx`,
  `roster/call-sheet-mount.tsx`, `roster-derivation.ts`, `use-coordination.ts`. This view is untouched by
  W1b (last redefined in `00594_studio_channel_consent.sql:1120`, confirmed by `grep` across all
  migrations — no W1b file redefines it). Its `sms_consent_status` column already reads
  `channel_consent_status()` (the record, R-AS/R-AV posture) — confirmed by reading the view body directly
  — so `roster-row.tsx:95`'s `row.sms_consent_status` is reading the record's verdict, not a frozen seat
  column. Not a W1b concern, and not made worse by this wave.
- **The five new `people_directory` columns** (`reach_state`, `consent_status`, `paper_state`,
  `contact_rule_summary`, `seat_count`) are read **nowhere** in `apps/` or `packages/` outside
  `database.types.ts` — grepped each column name individually. This matches the report's own statement
  that W2 owns consuming them; nothing is silently broken because nothing yet depends on them. See Finding
  2 below for the one loose end this leaves.

## Findings

### MINOR-1 — F-12 Pete Rusk's seeded reach word doesn't match fixture.md

`fixture.md:39`'s "Patina reach today" column for F-12 (Pete Rusk / Rusk Mechanical) states `field link`.
The seeded Directory row reads `on_paper`:

```
 display_name | reach_state | consent_status | paper_state | seat_count
---------------+-------------+----------------+-------------+------------
 Pete Rusk     | on_paper    | opted_out      | current     |          2
```
(reproduced identically before and after a fresh `supabase:reset`)

Root cause, read from `reach_state_for()` (`00626_people_directory_v4_seats.sql`) and confirmed with a
direct query: no row in `field_link_tokens` exists for either of Pete's two `project_parties` seats
(Lindqvist `awarded`, Okonkwo `warranty`). `reach_state_for()` is correctly computing `on_paper` given the
actual seed data — this is a **seed-fidelity gap**, not a logic bug in the view or the function. By
contrast, F-11 (Dana Kowalski, `field_link`/`granted`/`lapsed`), F-16 (Amara Osei, `on_paper`/`granted`/
`lapses_soon`, matching fixture's explicit "would be account if the FK were set" note), and F-27 (Ray Thao,
`on_paper`/`not_asked`/`not_on_file`, with the contact-rule sentence matching fixture's "phone and email
only; NEVER texted; scheduled through 311 portal" verbatim) all match fixture.md exactly.

Consequence: none for consent/security (Pete is `opted_out` regardless of reach, so no send risk), but a
future prod-walk or W2 screenshot against this fixture will show "on paper" for a subcontractor the design
brief itself describes as field-link-reachable. `seat_count = 2` and the consent word are both correct.

**Fix**: mint a `field_link_tokens` row for at least one of Pete's two seats in
`supabase/seed/people_crm_dev.sql` (via the `create_field_link` RPC, per the seed's own stated convention
for Erin Sato/Dana Kowalski), or note the deliberate omission in the report if it's intentional (e.g. "opted
out parties don't get seeded links") — the report is currently silent on Pete's reach at all.

### MINOR-2 — `PeopleDirectoryRow` (hand-authored TS interface) wasn't widened for the five new columns

`packages/supabase/src/hooks/use-people.ts:57-88` declares `PeopleDirectoryRow` — the type
`usePeopleDirectory()`/`usePerson()` actually return (`use-people.ts:123-165`, both `select('*')` cast to
this interface). It still lists only the pre-W1b twelve columns. The generated
`Database['public']['Views']['people_directory']['Row']` type in `database.types.ts:28981-28999` *does*
carry all five new columns (`reach_state`, `consent_status`, `paper_state`, `contact_rule_summary`,
`seat_count`) — confirmed by reading both side by side.

The report's §4 claim — "the widening is type-safe... so the widening is type-safe and no query moves" — is
true for today's consumers (verified: nothing currently reads the five new fields, and both `type-check`
runs are clean), but it's not quite the full picture: nobody can *type-safely consume* the new columns
through the documented hook surface yet, because the hand-authored interface hides them. This isn't a type
break today, but it is an item W2 will hit on day one and the report doesn't name it under "Owed to W2" (§8)
alongside the UI-migration items it does name.

**Fix**: add the five fields to `PeopleDirectoryRow` (types can be tightened past the generated `string |
null` — e.g. `reach_state: 'account' | 'field_link' | 'on_paper'`, `consent_status:
'not_asked'|'pending'|'granted'|'opted_out'`, `seat_count: number`) as part of W2's first PR, or now if
preferred — either is fine, it just needs to be on the list.

## What this review did not re-litigate

Every ruling in `rulings.md` §3, including R-AY (record-only consent) and R-AS/R-AV/R-AX (the freeze, the
repointed readers) — confirmed already-shipped and unmodified by W1b via `git log` (all predate
`f21cc0087`, W1b's only commit) and via the freeze-trigger probe (`00623`'s new table is untouched by the
consent freeze; `00624`'s ten new `project_parties` columns are confirmed absent from
`refuse_legacy_consent_write_trg`'s column list, both in the report's probe 9 and independently re-read from
the trigger definition).
