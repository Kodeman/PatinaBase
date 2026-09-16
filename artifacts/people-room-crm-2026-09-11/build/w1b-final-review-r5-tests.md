# W1b — final-run round 5: tests, types, behaviour review

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Supabase only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) — this wave's sole
owner for the duration of this review. No `supabase db push`, no `supabase functions deploy`, no
`supabase link`, no prod act of any kind, no `next build`, no `pnpm dev`. `git -C .../agent-people-build
status --short` showed only an uncommitted addition to `artifacts/people-room-crm-2026-09-11/rulings.md`
(R-AZ…R-BC, recording the r4 migrations fixes) both before and after this review — nothing here edited
the branch.

**Verdict: CLEAN.** Zero BLOCKING, zero MAJOR. One MINOR, carried forward from r4-tests and
independently reconfirmed still open (not touched by the r4 fix log, whose stated scope was the four
migrations-track MAJORs only).

---

## 0. Prior findings, re-checked

r4-tests handed over one finding (MINOR-1, Pete Rusk's reach word). `w1b-final-fix-log-r4.md`'s stated
scope is explicitly the four **migrations-track** findings (MAJOR-1…4); it says every open MINOR,
including "carried MINOR-11", stays open "except… carried MINOR-11", and does not claim to touch the
tests-track MINOR-1 at all.

| Finding | Claimed fix | Re-check | Status |
|---|---|---|---|
| r4 migrations MAJOR-1 — the fourth supersede door (undated successor retiring a dated, gating lapse) | Both successor legs key on the paper's own date, not an enumerated `doc_type` list | `00623_studio_compliance_documents.sql` — fresh suite run, block 2 NOTICE now reads "for ALL NINE types, keyed on the paper's own date and not on a vocabulary"; legs 2h/2h1/2r0–2r4 present and passed | **CONFIRMED FIXED** |
| r4 migrations MAJOR-2 — a person's own gating lapse invisible when they carry a firm | New `identity_paper_state(card_id, company_id)` reduces worst-first over both holders | `00626_people_directory_v4_seats.sql` — block 3 NOTICE now reads "the paper word reduced worst-first over the person's own card AND their firm"; suite passed | **CONFIRMED FIXED** |
| r4 migrations MAJOR-3 — `identity_consent_status()` failed open under RLS | Number set lifted into SECURITY DEFINER `identity_phone_numbers()`, gated on `is_active_studio_member` | Verdict function stays INVOKER; block 3 legs 3w–3x2 present and passed | **CONFIRMED FIXED** |
| r4 migrations MAJOR-4 — party branch's consent word and its two dates came off different numbers | New `identity_consent_evidence()` returns the dates of the record whose verdict won | Block 4 legs 4e12–4e17 present and passed | **CONFIRMED FIXED** |
| r4 tests-review MINOR-1 — Pete Rusk (F-12)'s reach word diverges from `fixture.md`'s stated target | Not in the r4 fix log's scope; left open | Reproduced independently this round (§4 below): `people_directory.reach_state` for Pete Rusk still reads `on_paper`, `field_link_tokens` still has zero rows for either of his two Okonkwo/Lindqvist seats, `reach_state_for()` and the seed still agree with each other and still disagree with `fixture.md`'s F-12 cell | **STILL OPEN** (untouched, as expected — not this round's scope either) |

No ruling in `rulings.md` §3 (R-A…R-BC, including R-AW/R-AY) is reopened or relitigated below.

---

## 1. Both SQL test suites, run fresh, after a full `supabase:reset`

Sandbox note: `pnpm supabase:reset` and `db:generate` need `dangerouslyDisableSandbox: true` — the
CLI writes `~/.supabase/telemetry.json` and needs the Docker socket, both outside the default
sandbox allowlist. Filesystem/socket refusals only, never a SQL or code defect.

```
$ pnpm supabase:reset   (sandbox disabled)
... Applying migration 00623_studio_compliance_documents.sql...
... Applying migration 00624_project_party_window_and_authority.sql...
... Applying migration 00625_project_site_access_cards.sql...
... Applying migration 00626_people_directory_v4_seats.sql...
... Applying migration 00627_access_grants_and_field_link_window.sql...
... Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/people_crm_dev.sql...
Seeding data from supabase/seed/99-local-edge-settings.sql...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql ... -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 6;"
20260910152111
00627
00626
00625
00624
00623
```

The seed runs on reset, unforced, as one of the wired `[db.seed] sql_paths` entries — confirmed by
the "Seeding data from supabase/seed/people_crm_dev.sql..." line and the fixture counts in §4/§5
below matching `w1b-report.md`'s arithmetic exactly (49 contact rows = 28 people + 21 firms).

```
$ psql ... -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  45h. a release that raises is a warning, not an aborted consent act (final-run MAJOR-3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
$ echo $?
0

$ psql ... -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
NOTICE:  1. compliance_state: four words, the 30-day boundary both ways, worst-first precedence,
          a superseded lapse released, and a gateless lapse that changes nothing until it holds
          a gate: passed
NOTICE:  2. the holder guard: ... for ALL NINE types, keyed on the paper's own date and not on
          a vocabulary — a DATED paper may only be retired by a dated successor that is itself
          in force and carries at least the gates it retires: passed
NOTICE:  3. people_directory v4: ... the consent word reduced worst-first over every number the
          identity carries — the card's and its seats', including a seat outside the caller's
          visibility — and the paper word reduced worst-first over the person's own card AND
          their firm: passed
NOTICE:  4. the uncarded identity: ... the consent word AND its two dates come off the one
          record that decided them rather than off the winning seat's number ...: passed
NOTICE:  5. project_party_authority: ... (PR-n): passed
NOTICE:  6. copy_to: ... passed
NOTICE:  7. the site access card: ... (PR-r) ... (PR-w): passed
NOTICE:  8. the key holder must be a seat on the card's own project: passed
NOTICE:  9. v_access_grants: ... (PR-d) ... (PR-l) ...: passed
NOTICE:  10. create_field_link: ... no mint is dated in the past or revokes on behalf of one ...: passed
NOTICE:  11. the seat's new columns ...: passed
NOTICE:  12. the seeded fixture reads as the fixture: ...: passed
NOTICE:  All W1b assertions passed.
ROLLBACK
$ echo $?
0
```

Both exit 0. The block-2/3/4 NOTICE text carries the r3/r4 fix language verbatim, confirming the
fixes actually run as part of the 12-block suite rather than having been appended and forgotten.

## 2. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate   (first run, immediately after supabase:reset)
GEN_EXIT=0 (no error printed)
$ git diff --stat packages/supabase/src/database.types.ts
packages/supabase/src/database.types.ts | 38012 +------------------------
 1 file changed, 9 insertions(+), 38003 deletions(-)
```

**This first run silently truncated the file to 179 lines** (only the `graphql_public` schema, no
`public` schema tables/views/functions at all) despite printing `GEN_EXIT=0` and no visible error.
Re-running the identical command immediately after reproduced the full 38,173-line file with an
**empty** diff against the committed one:

```
$ SUPABASE_DB_URL=... pnpm --dir .../agent-people-build db:generate   (second run, no changes between)
$ wc -l packages/supabase/src/database.types.ts
38173
$ git diff --stat packages/supabase/src/database.types.ts
(empty)
```

Running `supabase gen types typescript --db-url ...` directly (unredirected) immediately after the
truncated run printed the full `public` schema correctly on the first try, so the truncation is not
a durable connectivity problem — it self-resolved on retry and is consistent with the same
"container briefly reports `health: starting` right after `supabase db reset`'s `Restarting
containers` step" timing artefact r4-tests already documented for ordinary table queries in that
same window, now observed for `db:generate` specifically. **Not elevated to a finding**: the
regenerated file, once the container is warm, is byte-identical to the committed one — no schema
drift, and the r4-tests precedent for this exact class of artefact was "not a finding; noted". Flagged
here only as an operational note: a `reset && db:generate` pipeline run as one uninterrupted shot
(rather than two separate commands with time between them, as this review ran them) risks generating
and committing a truncated types file with a misleadingly clean exit code. Worth a `wc -l` or column-
count sanity check in whatever script chains these two commands, but that is a process suggestion, not
a code defect in this branch.

## 3. Role probes — designer, client, anon

Probed live with `SET LOCAL ROLE` + `request.jwt.claims`, inside `BEGIN…ROLLBACK`, against the
reset+seeded database, using the same helper shape the shipped test suite uses.

**`designer@patina.dev`** (`a0000000-0000-0000-0000-000000000004`, owner of `Local Dev Studio`
`b0000000-…-0001`) reads the full room:

```
directory_rows=62  seat_rows=31  site_access_cards_visible=1
authority_grants_visible=11  compliance_docs_visible=36
```

**`client@patina.dev`** (`a0000000-0000-0000-0000-000000000005`, a client-role account with no seat
in this studio) reads nothing on any of the five new/changed surfaces:

```
directory_rows_visible=0  site_access_cards_visible=0  authority_grants_visible=0
compliance_docs_visible=0  seat_rows_visible=0
```

Confirms PR-w ("no client leg" on `project_site_access_cards`) live, not only in the SQL suite.
Read the policies directly to be sure the RLS shape itself has no client branch:

```
project_site_access_cards_studio_select | r | is_studio_comember(project_designer(project_id))
project_site_access_cards_studio_insert | a |                                    (WITH CHECK only)
project_site_access_cards_studio_update | w | is_studio_comember(project_designer(project_id))
project_site_access_cards_studio_delete | d | is_studio_comember(project_designer(project_id))
```

Four policies, all `is_studio_comember`, no client leg, no `show_to_client` column exists to make
one. `is_studio_comember()`'s own body additionally excludes `role = 'guest'` on both sides of the
comembership check, so a client-role account cannot qualify even indirectly.

**`anon`** — refused at the GRANT, before any policy runs, on every table this wave added:

```
project_site_access_cards    → ERROR: permission denied for table project_site_access_cards
project_party_authority      → ERROR: permission denied for table project_party_authority
studio_compliance_documents  → ERROR: permission denied for table studio_compliance_documents
people_directory              → ERROR: permission denied for table studio_contacts
```

The last line matches r4-tests' precise framing: `people_directory` itself still carries the
pre-existing local-only blanket `anon` SELECT grant, but because the view is `security_invoker` it
fails outright on the first ungranted underlying table (`studio_contacts`) rather than returning
rows through RLS — a harder refusal than "RLS filters to nothing." Not a finding.

**Cross-tenant read, a genuinely isolated foreign studio owner** (`cf100000-…-0001`, sole membership
`cf120000-…-0001`, confirmed via `organization_members` to hold no membership anywhere near the seed
studio — the r4 probes' own account):

```
directory=0  seats=0  site_access_cards=0  compliance_docs=0  authority_grants=0
access_grants=1   ← their OWN organization's studio_member grant, not a leak (verified by content)
okonkwo_site_card_direct(by project_id)=0   okonkwo_directory_row_direct(by name)=0
```

**Cross-tenant write, same foreign owner, against real (not self-selected) Okonkwo target ids**
queried independently as `postgres`:

```
INSERT project_site_access_cards (project_id='d0e00000-…-000a', ...)          → RLS policy violation
INSERT project_party_authority (engagement_id='d0e30000-…-0004' [Adaeze Okonkwo's real seat], ...)
                                                                                → RLS policy violation
INSERT studio_compliance_documents (organization_id='b0000000-…-0001', ...)   → RLS policy violation
```

(An earlier pass of this same probe used `INSERT ... SELECT ... FROM project_parties WHERE
project_id = ... LIMIT 1` to source the seat id; because `project_parties` itself is RLS-filtered to
zero rows for a foreign owner, that form inserts zero rows and reports success without an exception —
a test-methodology artefact, not a security hole. Redone above with a real seat id supplied directly
in the `VALUES` clause, independent of what the actor's own RLS view can see, and refused correctly.
Noted here so the same false-positive shape isn't repeated in a future round.)

No cross-tenant read or write succeeded on any of the five new/changed surfaces, for either a
plain client role or a genuinely isolated foreign studio owner.

## 4. The seeded Okonkwo people vs `fixture.md` — F-11, F-12, F-16, F-27

Queried `people_directory` as `designer@patina.dev`:

```
 display_name  | reach_state | consent_status | paper_state
---------------+-------------+----------------+-------------
 Amara Osei    | on_paper    | granted        | lapses_soon
 Dana Kowalski | field_link  | granted        | lapsed
 Pete Rusk     | on_paper    | opted_out      | current
 Ray Thao      | on_paper    | not_asked      | not_on_file
```

| ID | Fixture reach | DB reach | Fixture consent | DB consent | Fixture docs | DB paper |
|---|---|---|---|---|---|---|
| F-11 Dana Kowalski | field link | **field_link** ✓ | granted | **granted** ✓ | COI lapsed 2026-03-31 | **lapsed** ✓ |
| F-12 Pete Rusk | field link | **on_paper** ✗ | opted_out | **opted_out** ✓ | COI current to 2027-01-15 | **current** ✓ |
| F-16 Amara Osei | on paper | **on_paper** ✓ | granted | **granted** ✓ | Lakeshore COI, CURRENT_DATE+23 | **lapses_soon** ✓ |
| F-27 Ray Thao | on paper | **on_paper** ✓ | n/a (do not text) | **not_asked** ✓ | n/a (AHJ never owed paper) | **not_on_file** ✓ (display rule hides the word in the room, per R-A/C13) |

11 of 12 words match. The one mismatch (F-12 Pete Rusk's reach word) is **r4-tests' MINOR-1**,
independently reconfirmed: `field_link_tokens` has zero rows for either of Pete's two seats (the
seed's `create_field_link` mint loop at `people_crm_dev.sql:895-911` names Erin/Luis/Dana/Joe/Ngozi/
Erin's-second-seat but not Pete), `reach_state_for()` and the seed agree with each other, and both
disagree with `fixture.md:39`'s F-12 "Patina reach today" cell. Not a reader-vs-record defect — see
the Findings section.

## 5. Every reader of `people_directory` / `v_project_roster`

Actual query call sites (`.from('people_directory' | 'v_project_roster')`) in `apps` and `packages`:

```
packages/supabase/src/hooks/use-people.ts:125    .from('people_directory').select('*')            (usePeopleDirectory)
packages/supabase/src/hooks/use-people.ts:161    .from('people_directory').select('*').eq('person_id', personId)  (usePerson)
packages/supabase/src/hooks/use-coordination.ts:1008  .from('v_project_roster')                    (useProjectRoster)
```

No other file in `apps` or `packages` issues a query against either object directly. Consumers of
the resulting row shape (grepped for `usePeopleDirectory`/`usePerson(`/`PeopleDirectoryRow` and,
separately, for `useProjectRoster`) match `w1b-report.md` §4's table and r4-tests' §5 exactly:
`use-people.ts`, `use-coordination.ts`, `people-derivation.ts`, `desk-derivation.ts`,
`roster-derivation.ts`, `people-room.tsx`, `directory-view.tsx`, `person-profile.tsx`,
`nurture-view.tsx`, `outreach-view.tsx`, `portfolio-view.tsx`, `audience-rules.ts`,
`audiences-tab.tsx`, `party-profile-sheet.tsx`, `command-bar.tsx`, `desk-reconnect.tsx`,
`call-sheet.tsx`/`call-sheet-mount.tsx`, `letterhead-instruments.tsx`, `hooks/index.ts`, plus their
test files. No new reader found, and no reader anywhere reads a frozen `project_parties.sms_consent_*`
column directly (`grep -rn "sms_consent_status\|sms_consented_at\|sms_opt_out_at" apps packages
--include=*.ts --include=*.tsx` turns up only the hook/type layer and the already-disclosed
`PunchCourtResolver`/`SupabaseSiteRequestService`/`v_project_roster` debt named in `w1b-report.md`
§8 as owed to W2 — unchanged by this wave, not a fresh finding).

## 6. Type-checks

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(clean, exit 0)

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, exit 0)
```

Both clean against the freshly-regenerated (byte-identical) `database.types.ts`. No type break.

## 7. Migration numbering

```
$ ls supabase/migrations | tail -10
00594_studio_channel_consent.sql
00621_consent_readers_repointed.sql
00622_consent_record_is_the_only_gate.sql
00623_studio_compliance_documents.sql
00624_project_party_window_and_authority.sql
00625_project_site_access_cards.sql
00626_people_directory_v4_seats.sql
00627_access_grants_and_field_link_window.sql
20260910152111_create_contact_messages.sql
_pending
```

00595–00620 untouched (reserved for the other program). 00621/00622 pre-exist. W1b's own five files
are exactly 00623–00627, matching the report's corrected numbering (the brief's stated "mints from
00622" could not hold because 00622 already existed as the R-AY pass — already explained and settled
in `w1b-report.md` §0). No collision.

---

## Findings

### MINOR-1 — Pete Rusk (F-12)'s reach word still diverges from `fixture.md`'s stated target (carried from r4-tests, still open)

- **File**: `supabase/seed/people_crm_dev.sql:895-911` (the `create_field_link` mint loop) vs.
  `artifacts/people-room-crm-2026-09-11/briefing/fixture.md:39` (F-12's "Patina reach today" cell).
- **Claim**: `fixture.md` states Pete Rusk's derived reach should read `field link`. The seed still
  does not mint him a `field_link_tokens` row on either of his two Okonkwo/Lindqvist seats (absent
  from the six-party mint loop, unlike F-06/F-08/F-09/F-11/F-18/F-28), so
  `people_directory.reach_state` for him still reads `on_paper` — confirmed live against a fresh
  reset+seeded database this round, identical to r4-tests' finding.
- **Why MINOR, not MAJOR**: `reach_state_for()` (the reader) and `field_link_tokens` (the record)
  agree completely — there is no reader-disagrees-with-record defect under this round's severity
  classes, and nothing here touches consent gating, tenancy, or a write path. It is a seed-data-vs-
  planning-fixture fidelity gap, and arguably the more correct real-world behaviour (Pete has no
  email on file per the same fixture row and is opted out of text, so there is no channel left to
  deliver a field link through).
- **Fix**: either (a) add Pete's two seats to the seed's `create_field_link` mint loop so the built
  system matches the fixture's stated word, or (b) amend `fixture.md`'s F-12 cell to `on paper` with
  a one-line note explaining why, so a future fixture-driven walkthrough doesn't flag this line as a
  regression. One-line change either way; no schema or RLS change implied. Untouched by the r4 fix
  log (whose scope was the four migrations-track MAJORs only) and untouched by this round (out of
  this round's scope too — carried forward for whichever round is asked to clear MINORs).

No other finding. Everything else probed — both SQL suites, generated types (once past the reset-
timing artefact noted in §2, not elevated to a finding), role/RLS/grant behaviour for designer,
client and anon, cross-tenant read and write, the reader inventory, and both type-checks — is clean.
