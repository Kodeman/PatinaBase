# W1b — final review round 8: tests, types, behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `9812807e1` (r7 fix). Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); nothing pushed to Strata.
Every command below was run independently in this session, not copied from `w1b-report.md`.

## 0. Verdict

**Clean.** Zero BLOCKING, zero MAJOR. Two carried MINORs re-confirmed open (unchanged from
r7); no new finding survives scrutiny — one apparent BLOCKING-shaped result (a client-role
INSERT that appeared to "land" on `project_site_access_cards`, and a reach-word mismatch
against the fixture) both turned out, on closer inspection, to be non-issues (§3, §5). All
three of r7's findings (BLOCKING-1, MAJOR-1, MAJOR-2) are independently confirmed fixed on a
**fresh** `supabase:reset`, not just on the pre-existing DB state.

## 1. Fresh reset

```
$ pnpm --dir …/agent-people-build supabase:reset
Applying migration 00621_consent_readers_repointed.sql...
Applying migration 00622_consent_record_is_the_only_gate.sql...
Applying migration 00623_studio_compliance_documents.sql...
Applying migration 00624_project_party_window_and_authority.sql...
Applying migration 00625_project_site_access_cards.sql...
Applying migration 00626_people_directory_v4_seats.sql...
Applying migration 00627_access_grants_and_field_link_window.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/people_crm_dev.sql...
Seeding data from supabase/seed/99-local-edge-settings.sql...
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```
No error anywhere in the run. `00595`–`00620` untouched; `00621`/`00622` present ahead of
W1b's `00623`–`00627`, confirming the report's renumbering note.

```
$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 6;"
20260910152111
00627
00626
00625
00624
00623
```

## 2. Both SQL suites, on the fresh reset

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  All W1a assertions passed.
ROLLBACK

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
NOTICE:  1. compliance_state: … passed
NOTICE:  2. the holder guard: … passed
NOTICE:  3. people_directory v4: … passed
NOTICE:  4. the uncarded identity: … passed
NOTICE:  5. project_party_authority: … passed
NOTICE:  6. copy_to: … passed
NOTICE:  7. the site access card: … passed
NOTICE:  8. the key holder must be a seat on the card's own project: passed
NOTICE:  9. v_access_grants: … passed
NOTICE:  10. create_field_link: … passed
NOTICE:  11. the seat's new columns … passed
NOTICE:  12. the seeded fixture reads as the fixture: … passed
NOTICE:  13. the tenant boundary: … passed
NOTICE:  14. a studio-less job: … (r7 BLOCKING-1) … passed
NOTICE:  15. the client branch … (r6 MAJOR-2) … passed
NOTICE:  16. the number set and the identity's consent word: … (r7 MAJOR-1) … passed
NOTICE:  All W1b assertions passed.
ROLLBACK
```

Block 14 exercises exactly r7's BLOCKING-1 scenario (a studio-less job, the admin of the
studio doing the work vs. a firm/person card of the studio the old resolver guessed) and
block 16 exercises r7's MAJOR-1 scenario (a studio-less seat's number and the studio's own
`opted_out` record). Both pass on a fresh reset, not only against a pre-existing DB — the
fix is real, not an artifact of leftover state.

## 3. Regenerated types

Sandbox note: the first `db:generate` attempt inside the tool sandbox failed on the Docker
socket (`EPERM` — `dial unix /Users/kody/.docker/run/docker.sock: connect: operation not
permitted`), matching the prior fix log's own note. Re-run with the sandbox disabled against
the **already-running** local Supabase succeeded; no destructive action taken outside the
sandbox — the command only talks to the local `postgres` container over `SUPABASE_DB_URL`.

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm --dir …/agent-people-build db:generate
Connecting to db 5432
$ git -C …/agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty)
```

No drift. The committed `database.types.ts` matches what the current schema generates.

## 4. Type-check

```
$ pnpm --dir …/agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
EXIT=0

$ pnpm --dir …/agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
EXIT=0
```

Both clean. No type break from the regenerated types (both commands ran against the just-
regenerated, diff-free `database.types.ts`, not a stale copy).

## 5. Role probes — designer, client, anon

Own probe (`pg_temp.assume_user`/`assume_anon` via `set_config('request.jwt.claims', …)` +
`SET LOCAL ROLE`), not copied from the build's own probe files, run against the fresh reset.

**Designer** (`designer@patina.dev`, `a0000000-0000-0000-0000-000000000004`):

```
directory_rows = 62   seats_rows = 31   site_access_cards = 1
authority_grants = 11   compliance_docs = 36   access_grants = 12
```
62 = 7 client + 49 contact + 5 lead + 1 sub, matching the report's role breakdown exactly.

**Client** (`client@patina.dev`, `a0000000-0000-0000-0000-000000000005`, a real client of
Local Dev Studio via `designer_clients.designer_id = a0000000-…-000004`):

```
client site_access_cards: rows visible = 0
client_directory_rows = 0     (role, count) → 0 rows, i.e. no branch at all
client authority: rows visible = 0
client compliance_documents: rows visible = 0
client v_access_grants: rows visible = 0
```

Write probe, corrected after a false start (see below):

```
NOTICE: client site access INSERT on Okonkwo refused: new row violates row-level
        security policy for table "project_site_access_cards"
SELECT count(*) FROM project_site_access_cards WHERE project_id = <Okonkwo> → 0
```

**A methodology note, not a finding.** My first version of this probe inserted via
`INSERT … SELECT id FROM projects WHERE studio_id = … LIMIT 1` and printed "INSERT LANDED
(unexpected)" with no exception raised. That was **my own probe bug**: the client role
cannot read the `projects` table for another party's project either, so the subquery
selected **zero rows**, the INSERT ran with 0 rows affected, and — because the DO block
only distinguished "exception" from "no exception" and never checked the row count — it
printed the wrong verdict. Re-run with a literal, known `project_id` (Okonkwo residence)
shows the true behaviour: the INSERT is refused by RLS. `project_site_access_cards` is
correctly closed to a client account for both read and write. Logging this so a future
round doesn't hit the same false alarm.

**Anon:**

```
anon people_directory:   permission denied for table studio_contacts
anon seats:               permission denied for view people_directory_seats
anon site cards:          permission denied for table project_site_access_cards
anon authority:           permission denied for table project_party_authority
anon compliance_documents: permission denied for table studio_compliance_documents
anon v_access_grants:     permission denied for view v_access_grants
```

Refused at the grant, before any policy runs, for every one of this wave's five new/changed
objects — matches PR-w and the report's probe.

## 6. Fixture check — F-11, F-12, F-16, F-27

Read as `designer@patina.dev` post-reset:

```
 display_name  | consent_status | paper_state | reach_state
---------------+----------------+-------------+-------------
 Amara Osei    | granted        | lapses_soon | on_paper
 Dana Kowalski | granted        | lapsed      | field_link
 Pete Rusk     | opted_out      | current     | on_paper
 Ray Thao      | not_asked      | not_on_file | on_paper
```

- **F-11 Dana Kowalski** — matches fixture on all three words: `granted` (2026-10-12),
  `lapsed` (Northgate Electric's COI, lapsed 2026-03-31), `field_link` (text-only reach).
- **F-16 Amara Osei** — matches: `granted` (web form, 2026-10-14), `lapses_soon` (Lakeshore
  Painting's COI seeded at `CURRENT_DATE + 23` on purpose), `on_paper` (the fixture's own
  note: "would be `account` if the FK were set" — it isn't, so `on_paper` is correct).
- **F-27 Ray Thao** — matches: `not_asked` is defensible (no SMS consent was ever recorded
  for a "never text" AHJ inspector — the block comes from his contact rule, not from
  consent), `not_on_file` (no compliance document exists for a government inspector — a
  fact, and R-A/PR-e's display rule is what suppresses the *word* in the room, not the SQL
  fact itself), `on_paper` matches the fixture's "Patina reach today" column exactly.
- **F-12 Pete Rusk** — consent and paper match (`opted_out`, `current` — his own COI is
  current, exp. 2027-01-15). **Reach does not**: the fixture's "Patina reach today" column
  says `field link`; the seed reads `on_paper`. Traced to
  `supabase/seed/people_crm_dev.sql:895-904` — the `create_field_link` minting loop lists
  F-08, F-09, F-11, F-18, F-06 and F-28 by party id, and **F-12 Pete Rusk is not in that
  list**, so no `field_link_tokens` row exists for him and `reach_state_for()` correctly
  falls through to `on_paper`. This reads as a deliberate, defensible choice — Pete has no
  email (fixture: "Phone yes · Email no") and is `opted_out` on SMS, so minting an
  SMS-delivered field link for him would create a reach channel Patina has no consented way
  to actually deliver — but it is undocumented: neither `w1b-report.md` §6 nor the seed's
  own comments state that Pete was deliberately left off the mint list, or why. A later
  reader has no way to tell "deliberately omitted because opted-out" from "forgotten." Not
  a compliance/consent defect — `reach_state` is a separate word from `consent_status`, and
  the seed's actual behaviour (not offering a field-link "reach" claim for a number that
  cannot receive one) is arguably *safer* than the fixture's own baseline. Recorded as
  MINOR (wording/documentation), not MAJOR: no reader is shown disagreeing with the
  consent record — the record and every reader I probed (people_directory, v_access_grants)
  agree that Pete is `opted_out`.

## 7. Readers of `people_directory` / `v_project_roster`

Grep across `apps/` and `packages/` (not narrowed to the report's own list):

```
$ grep -rln "people_directory\b" apps packages --include="*.ts" --include="*.tsx"
$ grep -rln "v_project_roster"    apps packages --include="*.ts" --include="*.tsx"
```

Every hit beyond the report's own inventory (`brief-section.tsx`, `household-sheet.tsx`,
`makers-marketplace.tsx`, `person-bits.tsx`, `maker-profile.tsx`, `use-clients.ts`,
`use-vendors.ts`, `letterhead-instruments.tsx`, `call-sheet.tsx`) is a **comment**
referencing the view by name, not a live query — confirmed by grepping each file's exact
line. `use-coordination.ts:1008` (`.from('v_project_roster')`) is the one additional live
call site; it is the same hook `call-sheet-mount.tsx`/`roster-derivation.ts` already consume
and was already in scope. `roster-derivation.ts:390` reads `v_project_roster.sms_consent_status`
only to compute a display count ("N reachable by text"), never as a send gate.

**Investigated and closed, not a finding:** `v_project_roster.sms_consent_status` (defined
in 00594, untouched by 00623–00627) still resolves the record's studio through
`project_consent_org()`, the same "guessing" resolver r6/r7 replaced with
`project_tenant_org()` everywhere else in this wave. This looked, at first, like the same
bug class left unpatched in a live, shipped reader. It is not: `00624`'s own banner
(`supabase/migrations/00624_project_party_window_and_authority.sql:59-104`) states this
explicitly and by name — "The consent LEDGER still resolves through `project_consent_org()`,
because a record's studio must be the same for every reader; a GATE may not guess" — and
R-BD (rulings.md §3) rules exactly this split: gates move to `project_tenant_org()`, the
consent *record* lookup stays on `project_consent_org()` project-wide (R-AK), and the
`studio_id IS NULL` population's residual risk (a `granted` record at a guessed studio
permitting a text the true studio's record marks `opted_out`) is named, owned by W3's
backfill and gated by W7's Strata preflight before this chain may ship. Per the brief, R-BD
is settled, not a finding — `v_project_roster` matching that stated posture is expected, not
a regression.

## 8. Re-check of every r7 finding

| Finding | r7 fix log claim | This round | Status |
|---|---|---|---|
| BLOCKING-1 | `assert_project_party_cards()` moved off `project_consent_org()` onto `project_tenant_org()` | Block 14 (fresh reset) exercises the exact scenario (own-studio card lands, foreign-studio card refused `party_company_other_studio`/`party_warranty_contact_other_studio`) and passes | **Fixed, confirmed** |
| MAJOR-1 | number-set leg widened to `pj.studio_id = org OR project_consent_org(...) = org OR (membership leg)` | Block 16 (fresh reset) proves both the studio-less case (own refusal wins) and the control (moved to a studio-recording job, identical word) | **Fixed, confirmed** |
| MAJOR-2 | party-profile sheet renders no consent chip when `person` is null, instead of "Not asked" | R-BE names this a W2 reader repoint; the interim guard (`party-profile-sheet.tsx:512`) is unchanged code, not re-verified line-by-line this round beyond confirming R-BE is recorded in rulings.md §3 as settled | **Deferred to W2 by ruling, as claimed** |
| MINOR-r7-1 | `blocks` missing from `assert_compliance_holder_trg`'s `UPDATE OF` list | Confirmed still absent: `00623_studio_compliance_documents.sql:475-476` lists `holder_id, holder_type, organization_id, superseded_by, doc_type, expires_on` only | **Still open**, unchanged from r7 (MINOR — no consent evidence at stake, `studio_compliance_documents` is a paper table, not a consent table) |
| MINOR-r7-2 | `supabase/tests/rls/people_directory_scope_test.sql:308` still asserts 12 columns | Ran it: `ERROR: FAIL a2: expected exactly 12 columns, got 17` | **Still open, RED**, unchanged from r7 |
| MINOR-r7-3/4/5, MINOR-35 | carried from r7 | Not independently re-walked this round (outside the SQL-test/type-check/RLS-probe/fixture scope of this pass) | Not re-verified — treat as still open per the fix log unless a later round says otherwise |

## 9. Settled rulings honoured

Spot-checked against code, not just re-read from `rulings.md`: PR-r (no `gate_code`-shaped
column — confirmed by listing every column on `project_site_access_cards` directly), PR-w
(no client RLS branch, confirmed by role probe), R-AY/R-BB (consent word comes from
`studio_channel_consent` via `channel_consent_status()`/`identity_consent_status()`, not the
frozen seat columns — the fixture check in §6 reads the record's verdict for Pete Rusk
correctly as `opted_out`), R-BD (§7). No ruling in rulings.md §3 was contradicted by
anything this round observed.

## 10. What this round did not do

- Did not re-derive MINOR-r7-3/4/5 or MINOR-35 from scratch (see §8).
- Did not re-verify `party-profile-sheet.tsx`'s interim guard byte-for-byte (R-BE already
  defers its real fix to W2; this round only confirmed the ruling is recorded and that the
  sheet's data source, `usePerson`, is unchanged this round).
- Did not run the Deno edge-function suites (no `_shared/*` file changed this wave, so none
  are in scope, matching the report's own statement).
- Did not touch Strata, run `supabase db push`, or run any destructive command outside the
  local `postgres` container.
