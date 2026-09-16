# W1b — final review, round 7 (tests, types, behaviour)

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`, head `c363aae2f` (unchanged by this round — read-only review). Local Supabase only, `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Nothing pushed to Strata.

**Verdict: CLEAN.** Zero BLOCKING, zero MAJOR. Two MINOR notes below, neither new to the program (one already carried, one a clarification this round adds).

Prior fix log re-checked: `w1b-final-fix-log-r6.md`'s three findings (BLOCKING-1, MAJOR-1, MAJOR-2) — re-verified fixed, not just re-read. See §6.

---

## 1. Full reset, seed included

```
$ pnpm supabase:reset
(sandbox note: the first attempt failed on a telemetry-file EPERM unrelated to the
 database — /Users/kody/.supabase/telemetry.json.tmp write blocked by the harness
 sandbox, not by anything in this branch. Re-ran with the sandbox override.)

Applying migration 00623_studio_compliance_documents.sql...
Applying migration 00624_project_party_window_and_authority.sql...
Applying migration 00625_project_site_access_cards.sql...
Applying migration 00626_people_directory_v4_seats.sql...
Applying migration 00627_access_grants_and_field_link_window.sql...
Applying migration 20260910152111_create_contact_messages.sql...
...
Seeding data from supabase/seed/people_crm_dev.sql...
Seeding data from supabase/seed/99-local-edge-settings.sql...
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql ... -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 3;"
20260910152111
00627
00626
```

The seed ran on reset with no error, in the order `config.toml`'s `[db.seed]` array wires it (after `cloudflare-phase1-staging.sql`, before `99-local-edge-settings.sql`). Reset/replay: **not a finding.**

## 2. Both SQL suites, run to completion

```
$ psql ... -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
... (45 blocks; last one printed)
NOTICE:  45h. a release that raises is a warning, not an aborted consent act (final-run MAJOR-3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
$ echo $?
0
```

```
$ psql ... -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
NOTICE:  1. compliance_state: ... a gateless lapse that changes nothing until it holds a gate: passed
NOTICE:  2. the holder guard: ... a DATED paper may only be retired by a dated successor that is itself in force and carries at least the gates it retires: passed
NOTICE:  3. people_directory v4: ... the paper word reduced worst-first over the person's own card AND their firm: passed
NOTICE:  4. the uncarded identity: ... a mixed-kind identity nests every seat it claims ... no row anywhere claims a count it cannot nest: passed
NOTICE:  5. project_party_authority: a member records selections and is refused money and draw certification, an owner records both, and a non-member reads nothing (PR-n): passed
NOTICE:  6. copy_to: a seat on another job is refused, a seat on this one lands: passed
NOTICE:  7. the site access card: no code column and no client toggle (PR-r), four studio policies, a client reads nothing and anon is refused at the grant (PR-w): passed
NOTICE:  8. the key holder must be a seat on the card's own project: passed
NOTICE:  9. v_access_grants: ... no bearer credential is in the ledger, and the four grant-closed sources read without raising: passed
NOTICE:  10. create_field_link: ... no mint is dated in the past or revokes on behalf of one, and the supersede and 00284's ownership guard are untouched: passed
NOTICE:  11. the seat's new columns are writable by a member, the eight consent columns are still frozen, the stage vocabulary is closed, and the firm pointer must be a firm in this studio: passed
NOTICE:  12. the seeded fixture reads as the fixture: ... Ngozi holding the key: passed
NOTICE:  13. the tenant boundary: a co-member of another studio reads no site access card, no authority grant, no seat row, no party-branch Directory row and no access-grant row of the seeded studio through any of 00627's four definer readers ... while the studio's own owner and admin still read all of it: passed
NOTICE:  14. a studio-less job: the admin of the studio doing the work reads its seat, its site access card and its authority grant and may record both, the consent word on that seat reads NULL rather than the affirmative one ... (r6 MAJOR-1): passed
NOTICE:  15. the client branch inherits designer_clients' own posture exactly (6 row(s) each) while every tenant-scoped object of this wave stays shut to the same caller — r6 MAJOR-2 is a ruling of record, not a silent inconsistency: passed
NOTICE:  All W1b assertions passed.
ROLLBACK
$ echo $?
0
```

Both exit 0, both suites entirely inside a rolled-back transaction (no seed data was consumed by the tests).

## 3. Generated types — one environment trap, then a clean diff

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm --dir .../agent-people-build db:generate
```

First two attempts failed for reasons that turned out to be **environment, not code**:

1. Sandboxed: `permission denied ... docker.sock` — the harness sandbox blocks the
   Docker socket by default; re-ran with the sandbox override.
2. Un-sandboxed but still wrong: the workspace's `db:generate` script shells out to
   whatever `supabase` binary resolves first on `PATH`, and this machine has
   **Homebrew `supabase` v2.117.0** ahead of the workspace's pinned
   **`packages/supabase/node_modules/.bin/supabase` v2.77.0**
   (`packages/supabase/package.json:35` pins `^2.67.1`). The v2.117.0 binary's
   introspection silently drops ~290 underscore-prefixed helper functions
   (`_agreement_*`, `_apply_board_room_state_*`, `_place_product_in_project_v2_*`,
   etc. — all pre-existing, unrelated to this branch) that the pinned v2.77.0
   binary includes. Running with the wrong CLI version produced a **24,000-line
   diff** against the committed file that had nothing to do with W1b.
   Re-ran against the pinned binary directly
   (`packages/supabase/node_modules/.bin/supabase gen types typescript --db-url ...`):

```
$ packages/supabase/node_modules/.bin/supabase gen types typescript --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres" > /tmp/.../regen.ts
   38174 lines   (committed file: 38174 lines)
$ cp /tmp/.../regen.ts packages/supabase/src/database.types.ts
$ git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty)
```

**Types are exactly in sync with the branch as committed.** This is the same
result the report claims (§7, "GEN_EXIT=0 ... NO DRIFT"); the trap above is worth
recording for whoever runs this next — `db:generate` on this machine needs the
workspace `node_modules/.bin/supabase`, not whatever `supabase` is first on `PATH`.
Flagging under MINOR (§7) since it is a local toolchain hazard, not a program defect.

## 4. Role probes — designer, client, anon

```sql
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004", ...}', true);
```

**As designer@patina.dev** (`a0000000-...004`, Local Dev Studio owner):

```
=== F-11/F-12/F-16/F-27 from people_directory ===
 display_name  |  role   | reach_state | consent_status | paper_state | contact_rule_summary                          | seat_count
 Amara Osei    | contact | on_paper    | granted        | lapses_soon |                                                |     1
 Dana Kowalski | contact | field_link  | granted        | lapsed      |                                                |     2
 Pete Rusk     | contact | on_paper    | opted_out      | current     |                                                |     2
 Ray Thao      | contact | on_paper    | not_asked      | not_on_file | Never text. Use: email, office, portal_311... |     1

project_site_access_cards → 1 row (the seeded Okonkwo card)
```

**As client@patina.dev** (`a0000000-...005` — a generic dev client account, member
of no organization and party to no project; used as the negative-control "some
authenticated non-studio user" the way PR-w's own guarantee is written — no
client-typed account of any kind can ever satisfy `is_studio_comember`):

```
project_site_access_cards → 0
people_directory           → 0 rows (no role)
project_party_authority    → 0
studio_compliance_documents → 0
```

**As anon:**

```
SELECT count(*) FROM public.project_site_access_cards;
ERROR:  permission denied for table project_site_access_cards
HINT:  Grant the required privileges to the current role with: GRANT SELECT ON public.project_site_access_cards TO anon;
```

Refused at the GRANT, before RLS — matches report §3 and probe58's `anon`
line exactly.

## 5. F-11 / F-12 / F-16 / F-27 against `fixture.md`

| Row | Fixture consent | Actual `consent_status` | Fixture docs | Actual `paper_state` | Fixture "Patina reach today" | Actual `reach_state` |
|---|---|---|---|---|---|---|
| F-11 Dana Kowalski | granted (2025 Lindqvist, carried by phone; Okonkwo row set granted 2026-10-12) | **granted** ✓ | COI exp 2026-03-31 **LAPSED** | **lapsed** ✓ | field link | **field_link** ✓ |
| F-12 Pete Rusk | opted_out (STOP on 2025 Lindqvist thread; Okonkwo row itself created `not_asked`) | **opted_out** ✓ | COI exp 2027-01-15, not lapsed | **current** ✓ | field link | **on_paper** — see note |
| F-16 Amara Osei | granted (web form, 2026-10-14) | **granted** ✓ | COI/W-9 held, no expiry stated (seed: `CURRENT_DATE+23`) | **lapses_soon** ✓ | on paper (account unlinkable, G-5) | **on_paper** ✓ |
| F-27 Ray Thao | n/a (never text; AHJ) | **not_asked** ✓ (no consent sought, consistent with "n/a") | n/a (AHJ owed no paper, R-A/C13) | **not_on_file** ✓ (the fact; display rule to hide it is left in the app per report §4) | on paper | **on_paper** ✓ |

Consent and paper words match the fixture's stated facts on all four rows,
including the one row (F-12) where the match is the *interesting* one: the
fixture's own parenthetical says the Okonkwo **seat**'s frozen column reads
`not_asked`, and the directory correctly overrides that with the **record's**
`opted_out` verdict carried from the Lindqvist STOP — which is R-AY's whole
point, and exactly what block 12 of the SQL suite asserts by name ("Pete's
Lindqvist refusal answering on Okonkwo").

**F-12's reach word is the one cell that doesn't match the fixture's "Patina
reach today" column, and it is not a bug.** That column is explicitly defined
in the fixture's own legend as "the `ReachState` the roster **would derive**
... today" — a pre-build gap diagnostic, not a target for the rebuilt column.
The seed's field-link minting block (`supabase/seed/people_crm_dev.sql:895-905`)
names exactly six parties to mint a live field link for — F-08, F-09, F-11,
F-18, F-06, and F-28 (Erin's second seat) — and Pete Rusk (F-12) is
deliberately not one of them (`field_link_tokens` has zero rows for either of
his two party ids, confirmed by direct query). With no live link,
`reach_state_for()` correctly falls through to `on_paper`, which is the
function computing correctly against the seed's actual state, not a
mismatch in the compliance/consent logic. Recorded as a MINOR clarification
(§7) rather than a defect: the fixture's diagnostic column and the seed's own
minted-link roster diverge for this one row, worth a comment in either file
so a future reader doesn't mistake it for drift.

## 6. Re-checking `w1b-final-fix-log-r6.md`'s three findings

All three land, independently re-verified this round (not re-read — re-run):

- **BLOCKING-1** (the three definer readers gated on `is_studio_comember` alone) —
  fixed. Suite block 13 passed; my own designer/client/anon role probes above
  corroborate the tenant boundary (§4) — the client and anon accounts read
  nothing from any of the gated objects.
- **MAJOR-1** (`project_consent_org()` misused as a gate resolver, naming the
  wrong studio on a `studio_id IS NULL` project) — fixed via the new
  `project_tenant_org()` resolver. Suite block 14 passed (studio-less job: the
  working studio's admin reads and writes; a foreign-org co-member reads and
  writes nothing; the consent word reads NULL rather than an affirmative
  fail-open).
- **MAJOR-2** (the four designer-scoped Directory branches) — ruled, not
  code-changed, and the ruling stands (rulings.md §3, R-BB is the compliance/
  consent-specific successor; the client/lead/maker/team branches' posture is
  unchanged and documented in the view's own COMMENT). Suite block 15 passed
  (client branch = `designer_clients`' own row count, 6 = 6, while every
  object this wave actually gates stays shut to the same caller).

Nothing else was touched by r6 and nothing regressed here: r1–r5's blocks
(1–12) are still green in the same run.

## 7. Type-check gates

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(clean, no output)

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, no output)
```

No type breaks from the regenerated `database.types.ts` (which is byte-identical
to the committed one — §3).

## 8. Every reader of `people_directory` / `v_project_roster` columns

```
$ grep -rliE "people_directory|PeopleDirectoryRow|usePeopleDirectory|usePerson\b" apps packages --include="*.ts" --include="*.tsx" | grep -v "\.test\.|__tests__|\.spec\."
```

Matches the report's §4 list exactly, plus several files that mention
`people_directory` **only in a comment** (verified line-by-line, not just by
grep hit):

- `apps/designer-portal/src/components/document/brief-section.tsx:77` — comment only
- `.../overlays/household-sheet.tsx:22` — comment only
- `.../people/directory/makers-marketplace.tsx:10` — comment only
- `.../people/person-bits.tsx:71,122` — comment only
- `.../people/profile/maker-profile.tsx:9` — comment only
- `.../roster/call-sheet-mount.tsx:16` — comment only
- `.../roster/roster-row.tsx:88` — comment only
- `packages/supabase/src/hooks/use-clients.ts:411` — comment only
- `packages/supabase/src/hooks/use-coordination.ts:442,510,932` — comment only
- `packages/supabase/src/hooks/use-vendors.ts:350,406` — comment only

None of these actually consume the row shape or the five new columns; they are
narrative comments cross-referencing the table. The **actual** readers are the
fourteen files the report names in §4 (`use-people.ts`'s two `select('*')`
hooks, `people-derivation.ts`, `desk-derivation.ts`, `roster-derivation.ts`,
`people-room.tsx`, `directory-view.tsx`, `person-row.tsx`,
`person-profile.tsx`/`nurture-view.tsx`/`outreach-view.tsx`/`portfolio-view.tsx`,
`audience-rules.ts`/`audiences-tab.tsx`, `party-profile-sheet.tsx`,
`command-bar.tsx`, `desk-reconnect.tsx`, and the `hooks/index.ts` barrel) — the
list is complete; no missed reader found.

`v_project_roster` readers: `letterhead-instruments.tsx`, `call-sheet-mount.tsx`,
`call-sheet.tsx`, `roster-derivation.ts`, `use-coordination.ts` — none of these
touch W1b's changed objects (`v_project_roster` is untouched by 00623–00627);
listed for completeness since the brief asked for both.

The one behavioural consequence already on record — every carded seat now
reads `role='contact'` in `people_directory`, so `directory-view.tsx`'s
role→band chip mapping will read oddly until W2's mixed-list UI lands — is
**settled** (rulings.md §6: 100% rollout, no flag, Kody's ruling) and restated,
not re-flagged, here.

## Findings

None at BLOCKING or MAJOR. Two MINOR:

1. **MINOR** — `db:generate` on a machine with a newer Homebrew `supabase` CLI
   ahead of the workspace's pinned binary on `PATH` silently produces a
   different (smaller) type file, because newer CLI versions drop
   underscore-prefixed helper functions from introspection. Not a code defect
   in this branch — a toolchain footgun worth a one-line note in
   `patina-local-dev` or the `db:generate` script itself (e.g. resolve the
   binary via `pnpm exec` / the workspace path explicitly rather than relying
   on `PATH` order).
2. **MINOR** — F-12 Pete Rusk's `reach_state` (`on_paper`) does not match
   `fixture.md`'s "Patina reach today" column (`field link`), because the
   seed's field-link minting list intentionally excludes him. The function is
   computing correctly against the actual seed; the fixture's diagnostic
   column and the seed's minted-link roster simply describe two different
   things for this one row. Worth a one-line note in either file so a future
   reviewer doesn't read it as drift.

## Commands run, for the record

```
pnpm supabase:reset
psql ... -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
psql ... -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
SUPABASE_DB_URL=... pnpm --dir .../agent-people-build db:generate   # PATH trap, see §3
packages/supabase/node_modules/.bin/supabase gen types typescript --db-url ...   # the fix
git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts   # empty
pnpm --dir .../agent-people-build --filter @patina/supabase type-check
pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
# role probes: SET LOCAL ROLE authenticated + request.jwt.claims (designer@patina.dev,
#   client@patina.dev), SET LOCAL ROLE anon — ad hoc SQL, inline above
grep -rliE "people_directory|PeopleDirectoryRow|usePeopleDirectory|usePerson\b" apps packages
```
