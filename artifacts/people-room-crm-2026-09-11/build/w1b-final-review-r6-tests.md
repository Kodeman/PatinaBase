# W1b — final review, round 6 (tests, types, behavior)

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No `supabase db
push`, no `supabase functions deploy`, no `supabase link`, no Strata connection, no Strata
credential read. `git status` / `git diff` show nothing changed since the r5 fix commit
(`7d444949d`) — this round reviews the exact content r5's own fix log validated, plus everything
r1–r5 left open.

```
$ git log --oneline -3 -- supabase/migrations/0062[3-7]*.sql
7d444949d fix(people-room): w1b r5 — one studio on both sides of the number set, the seat, the card and the grant
f19b6cd69 fix(people-room): w1b r4 — close the fourth supersede door, the person-held paper word, the RLS-softened consent reduction, and the word/date split
5af2ad6ce fix(people-crm): w1b r3 — close the third supersede door, the unnestable seat count, and the party branch's consent word
$ git status --short   # (nothing but pre-existing sandbox-denied .env.example reads, unrelated)
$ git diff --stat      # empty
```

## 1. Every SQL test under `supabase/tests/people`, run twice (before and after a full reset)

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  All W1a assertions passed.
ROLLBACK
EXIT=0   (49 "passed" lines, zero ERROR lines)

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
...
NOTICE:  13. the tenant boundary: ... : passed
NOTICE:  All W1b assertions passed.
ROLLBACK
EXIT=0   (14 "passed" lines, zero ERROR lines)
```

Then, because the live local DB's grant state had drifted from what the migrations + seed
establish (see §6 — a session artifact from earlier probing, not a code defect), I ran
`pnpm supabase:reset` **twice** and reran both suites again on the freshly-reset database:

```
$ pnpm supabase:reset                                    RESET1_EXIT=0
$ pnpm supabase:reset                                    RESET2_EXIT=0
$ psql ... -At -c "select version from supabase_migrations.schema_migrations
                    order by version::bigint desc limit 6;"
20260910152111 00627 00626 00625 00624 00623
$ psql ... -f supabase/tests/people/w1a_identity_channels_consent_test.sql   EXIT=0, 49 passed
$ psql ... -f supabase/tests/people/w1b_compliance_authority_directory_test.sql EXIT=0, 14 passed
```

Both suites are fully green, on a genuinely fresh reset, not just on whatever state r5 left behind.
`00595`–`00620` remain untouched and reserved; `00621`/`00622` pre-exist on the branch; W1b's own
files are exactly `00623`–`00627`, confirmed by directory listing.

## 2. Generated types — no drift

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
(nothing)
```

(The first attempt hit `permission denied ... docker.sock` — a Bash-sandbox restriction on the
Docker socket, not a real failure; retried with the sandbox override and it generated cleanly.)

## 3. Role probes — designer (studio owner), client, anon — replayed fresh, not reused from r5

Acting as `designer@patina.dev` (`a0000000-…-0004`), owner of `Local Dev Studio`
(`b0000000-…-0001`, the studio `project_consent_org('d0e00000-…-000a')` resolves to for the
Okonkwo fixture):

```
people_directory            62
people_directory_seats      31
project_party_authority     11
project_site_access_cards    1
studio_compliance_documents 36
v_access_grants             12
```

These match the r5 fix log's own positive-control numbers exactly (62 / 31 / 11 / 1) — the fresh
reset reproduces the same fixture.

Acting as `client@patina.dev` (`a0000000-…-0005`, a real seeded homeowner client of a *different*
designer relationship, no seat on Okonkwo):

```
people_directory            0
people_directory_seats      0
project_party_authority     0
project_site_access_cards   0   (query succeeds — no error — RLS returns zero rows, not a grant refusal)
studio_compliance_documents 0
```

`project_site_access_cards` for the client returns **0 rows without an error** — this is PR-w's
"no client RLS branch" as written: the table is reachable at the grant level (so no client-facing
caller of it 500s), but no policy admits a client row, so every client read is empty. I did **not**
have a client-role seat scoped onto the Okonkwo project itself to test (client@patina.dev is a
homeowner elsewhere); block 7 of the w1b suite already builds that stronger case in-fixture
("a client reads nothing … (PR-w): passed") and it passed, so the code-level claim is covered even
though my manual probe is the weaker "no seat at all" case.

Acting as `anon`:

```
NOTICE:  anon SELECT on people_directory: insufficient_privilege (expected)
NOTICE:  anon SELECT on project_site_access_cards: insufficient_privilege (expected)
NOTICE:  anon SELECT on project_party_authority: insufficient_privilege (expected)
NOTICE:  anon SELECT on studio_compliance_documents: insufficient_privilege (expected)
NOTICE:  anon SELECT on v_access_grants: insufficient_privilege (expected)
```

Every sensitive object in this wave refuses `anon` at the grant, matching block 7's "anon is
refused at the grant (PR-w)".

## 4. Independent replay of r5's four findings, on fresh post-reset data, using a REAL foreign studio

r5's own probes hard-coded org ids the reviewer could not always reproduce (probe107/109 aborted
on FK violations against this run's ids). I instead used a real, persisted second studio that
already exists in the seed and that r5's own BLOCKING-1 evidence used —
`cf-phase1-alice@patina.invalid` (`cf100000-…-0001`), owner of **Phase One Synthetic Studio**
(`cf120000-…-0001`) — a genuinely different tenant from Local Dev Studio, not a scratch fixture
created and rolled back inside the test's own transaction.

```
member_of_own_studio = t, member_of_victim_studio = f

-- BLOCKING-1: my own org id + Dana Kowalski's phone as a foreign identity key
identity_phone_numbers(cf120000…, party_identity_key(phone='+16125550111')) -> (0 rows)

-- naming my own org id, over Dana's FIRM card uuid
identity_phone_numbers(cf120000…, party_identity_key(company_card=Northgate Electric)) -> (0 rows)

-- MAJOR-1 / MAJOR-3: direct table reads, naming only my own org
people_directory_seats        -> 0
project_site_access_cards     -> 0
project_party_authority       -> 0
studio_compliance_documents   -> 0
people_directory (Dana/Pete/Chidi rows) -> 0

-- write attempt: move the victim's lockbox
UPDATE project_site_access_cards SET lockbox_version='PWNED' WHERE project_id=<Okonkwo> -> UPDATE 0

-- positive control, same session, as the real studio owner
people_directory_seats -> 31, project_site_access_cards -> 1,
lockbox_version -> 'Lockbox, version 3'   (unchanged — the foreign UPDATE landed on 0 rows)
```

BLOCKING-1, MAJOR-1 and MAJOR-3 all hold on a fresh reset against a real foreign tenant: no
cross-tenant read, no cross-tenant write, the number-set oracle is closed, and the owner's own view
of the data is untouched.

**MAJOR-2** (the folded-refusal date leak), replayed with a synthetic phone attached to a real seat
on the Okonkwo project (so `identity_phone_numbers` has a real row to find — a bare consent record
with no seat resolves to `NULL`, correctly, per `identity_consent_status`'s own documented
contract, not a bug):

```
-- granted + refusal_unanswered = true
identity_consent_status(...)   -> opted_out
identity_consent_evidence(...) -> consented_at (blank), opt_out_at (blank)   -- suppressed, not invented
people_directory row           -> consent_status=opted_out, meta word=opted_out, no dates

-- the OTHER side: refusal_unanswered = false, same record otherwise
identity_consent_evidence(...) -> consented_at = 2025-05-02 00:00:00+00     -- prints again
```

One-sided suppression confirmed both ways, independent of the suite and of r5's own probes.

## 5. F-11 / F-12 / F-16 / F-27 against `fixture.md`, on the seeded Okonkwo data

Acting as the studio owner:

| Fixture row | reach_state | consent_status | paper_state | Against fixture.md |
|---|---|---|---|---|
| F-11 Dana Kowalski (Northgate Electric) | `field_link` | `granted` | `lapsed` | Matches: "Patina reach today: field link"; consent "granted … Okonkwo row set granted 2026-10-12"; COI "exp 2026-03-31" is in the past relative to the fixture's 2026-10 setting, i.e. lapsed — this is exactly G-14's fix, the feature this wave built |
| F-12 Pete Rusk (Rusk Mechanical) | `on_paper` | `opted_out` | `current` | Consent matches exactly (fixture: "opted_out … STOP on the 2025 Lindqvist thread … Okonkwo row created not_asked" — the identity-level record correctly overrides the row's own `not_asked`, which is G-3's fix and test block 12b/12c's exact assertion). Paper matches (COI exp 2027-01-15, not lapsed → `current`). **Reach differs from the fixture's "Patina reach today: field link" column** — see note below; this is not a regression |
| F-16 Amara Osei (Lakeshore Painting Co.) | `on_paper` | `granted` | `lapses_soon` | Reach and consent match fixture ("Patina reach today: on paper (would be account if the FK were set)"; "granted, web form, 2026-10-14"). `lapses_soon` is a seed-data choice for her COI expiry (fixture gives no exact date for her docs); not contradicted by the fixture |
| F-27 Ray Thao (City of Minneapolis CPED) | `on_paper` | `not_asked` | `not_on_file` | Matches. `contact_rule_summary` reads "Never text. … portal_311 …" (test 12f). Fixture: "never texted … n/a (do not text)" |

**Note on F-12's reach column.** The fixture's "Patina reach today" column is explicitly documented
in the fixture's own preamble as "the `ReachState` the roster **would derive**" — i.e. a
description of the *pre-this-wave, legacy* derivation, used throughout the fixture to name gaps
(G-3, G-5, G-13, G-14) the build is meant to close, not a literal acceptance target for every
column. `reach_state_for_identity()` (00626) computes reach from an **active, non-expired**
`field_link_tokens` row; the dev seed (`people_crm_dev.sql:888-908`) deliberately mints field links
for only six specific parties (F-06, F-08, F-09, F-11, F-18, F-28) — Pete Rusk (F-12) and Amara
Osei (F-16) are not in that list, so both correctly read `on_paper` under the new, expiry-aware
logic. This is consistent with, not contradicted by, the fixture: F-16's own annotation says
outright "The reach chip reads on paper for someone who logs in" (a known, deferred gap, G-5, out
of W1b's scope). I checked the actual seed rather than assume drift.

**One low-confidence, out-of-band note, not filed as a finding against W1b's code.** Ruling R-D
("Dana Kowalski's seat window runs to substantial completion, 13 Aug 2027") does not match the
seed's actual Okonkwo window for Dana (`on_site_from 2026-10-19`, `on_site_to 2027-06-30`,
`people_crm_dev.sql:712`). R-D sits in the rulings log's "kept the specimens moving" section
alongside R-C ("Seventh specimen state is Bring forward"), which strongly suggests it binds the
**static HTML panel specimens** built earlier in the program, not this wave's SQL seed — an
electrician plausibly finishes well before substantial completion on a design-build remodel, which
is what the seed shows. I could not confirm which artifact R-D binds without reading the specimens
themselves (out of this round's scope), so I am not filing this as a finding; flagging it only so
Kody can rule on it if it matters.

## 6. The grant-drift I found, and why it is not a finding against this wave's code

Before resetting, `authenticated`'s privileges on `public.designer_clients` read `REFERENCES,
TRIGGER, TRUNCATE` only — no `SELECT`/`INSERT`/`UPDATE`/`DELETE` — which is the **opposite** of
what migration `00555` grants and what the regenerated `00-legacy-grants.sql` seed also grants
(both explicitly `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`). Querying
`people_directory` (a `security_invoker` view that joins `designer_clients`) as `authenticated`
therefore raised `permission denied for table designer_clients` on the pre-reset live database.

After `pnpm supabase:reset`, the grant read correctly (`anon=SELECT`,
`authenticated=SELECT,INSERT,UPDATE,DELETE,TRIGGER`), and `people_directory` queried cleanly for
every role. This is local session drift — almost certainly a stray `REVOKE` issued outside a
transaction by an earlier round's ad hoc probing on this shared, single-owner local DB, not
something any migration, the seed, or this wave's code did. `generate-legacy-grants.py` reports no
drift against the committed seed file either before or after. Recorded here as a process note
(future rounds probing this DB directly with `REVOKE`/`GRANT` outside a transaction should always
wrap them in `BEGIN; … ROLLBACK;`), not as a BLOCKING/MAJOR/MINOR finding — it is not reproducible
from the committed code on a clean reset, which I verified twice.

## 7. Legacy grants — no drift

```
$ python3 scripts/generate-legacy-grants.py
wrote .../supabase/seed/00-legacy-grants.sql — baseline + 2713 replayed statements
$ git diff --numstat -- supabase/seed/00-legacy-grants.sql
(nothing)
```

## 8. Type-checks

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
EXIT=0, no output

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
EXIT=0, no output
```

No type breaks from the regenerated `database.types.ts` (which itself has zero diff — see §2).

## 9. Every reader of `people_directory` / `people_directory_seats` / `v_project_roster` in `apps/` and `packages/`

```
$ grep -rln "people_directory\b" apps packages --include="*.ts" --include="*.tsx" | grep -v database.types.ts
$ grep -rln "people_directory_seats" apps packages --include="*.ts" --include="*.tsx" | grep -v database.types.ts
$ grep -rln "v_project_roster" apps packages --include="*.ts" --include="*.tsx" | grep -v database.types.ts
```

- **`people_directory`** has exactly one live query call site:
  `packages/supabase/src/hooks/use-people.ts:125` and `:161`
  (`supabase.from('people_directory').select('*')`). The row shape is a **hand-authored**
  `PeopleDirectoryRow` interface (`use-people.ts:56-90`) with an `as PeopleDirectoryRow[]` cast —
  it does not derive from `database.types.ts`, so the view's five new columns
  (`reach_state`/`consent_status`/`paper_state`/`contact_rule_summary`/`seat_count`, all present
  in the `select('*')` payload at runtime) are simply not yet typed or consumed. This is exactly
  the "W2 owns those readers" scoping the report already states, and it type-checked clean (§8).
  Every other file matching `people_directory` (roster/directory-view.tsx, people-derivation.ts,
  desk-derivation.ts, roster-derivation.ts, party-profile-sheet.tsx, use-vendors.ts,
  use-coordination.ts, use-clients.ts, etc.) is a **comment or type reference**, not a query — no
  behavior change reaches them from this wave.
- **`people_directory_seats`** has **zero** matches anywhere in `apps/` or `packages/` — no
  TypeScript caller exists yet. Confirmed by the empty grep above.
- **`v_project_roster`** is queried at `packages/supabase/src/hooks/use-coordination.ts:1008`
  (`.from('v_project_roster')`), plus comment references in `letterhead-instruments.tsx`,
  `call-sheet.tsx`/`call-sheet-mount.tsx`, and `roster-derivation.ts`. This view is **unchanged by
  W1b** (00626/00627 do not touch it) and still reads the frozen `project_parties.sms_consent_*`
  columns, which is the pre-existing W2 debt `w1b-report.md` §8 and r5's fix log both already name
  — not a new gap this round introduces, and not something this round's four migrations could fix
  without exceeding scope.
- **`project_site_access_cards`** and **`project_party_authority`** (00625/00624): also **zero**
  matches in `apps/` or `packages/` — confirmed no live UI reads either new table yet, so the
  authority/site-access RLS surface probed in §3–4 has no reachable client-side regression risk
  today.

## 10. Migration numbering

```
$ ls supabase/migrations | grep -E "^00(59[5-9]|6[01][0-9]|620)"
(nothing — 00595-00620 untouched, as reserved)
$ ls supabase/migrations | sed -n '/^00621/,/^00627/p'
00621_consent_readers_repointed.sql
00622_consent_record_is_the_only_gate.sql
00623_studio_compliance_documents.sql
00624_project_party_window_and_authority.sql
00625_project_site_access_cards.sql
00626_people_directory_v4_seats.sql
00627_access_grants_and_field_link_window.sql
```

No collision with the reserved range; W1b's five files are exactly `00623`–`00627` as the report
states.

## 11. Prior findings (r5), rechecked

| Finding | Status this round | Evidence |
|---|---|---|
| r5 BLOCKING-1 (cross-tenant phone-number oracle) | **FIXED**, reconfirmed on fresh reset against a real second tenant | §4 |
| r5 MAJOR-1 (fail-open consent word at two call sites) | **FIXED**, reconfirmed | §4 |
| r5 MAJOR-2 (dated consent claim beside a refusal) | **FIXED**, reconfirmed with a fresh synthetic record both folded and unfolded | §4 |
| r5 MAJOR-3 (site access card / authority / seats scoped through the designer, not the studio) | **FIXED**, reconfirmed | §4 |
| MINOR-27 (people_directory_scope_test 12→17 column count) | Still open, out of `supabase/tests/people` scope (lives in `supabase/tests/rls/`), untouched this round; not rerun (outside this round's instructed scope) | r5 fix log §6 |
| MINOR-33 (missing `search_path` on `party_identity_key`/`party_kind_in_directory`) | Still open, untouched | r5 fix log §6 |
| MINOR-35 (`w1b-report.md` five rounds stale) | Still open, untouched (this review does not edit the report) | r5 fix log §6 |
| MINOR-38 (double reduction in `identity_consent_evidence`) | Incidentally resolved by MAJOR-2's CTE hoist (per r5), reconfirmed no double-reduction structurally present | §4 code path exercised cleanly |
| MINOR-39 (missing gate test leg) | Addressed by new block 13's `13j`-`13n1` legs, present and passing | §1 |

## 12. New findings this round

None. Every SQL test under `supabase/tests/people` passes on two independent fresh resets;
`database.types.ts` has zero drift; `@patina/supabase` and `@patina/designer-portal` type-check
clean; every RLS boundary I probed (designer/client/anon, plus a real foreign-tenant replay of all
four r5 findings) held; the seed runs cleanly on reset; a client role reads zero rows of
`project_site_access_cards` with no error, and `anon` is refused at the grant on every sensitive
object in this wave; no TypeScript reader exists yet for `people_directory_seats`,
`project_site_access_cards`, or `project_party_authority`, and `people_directory`'s one reader is
untyped-cast and unaffected; legacy grants show no drift; migration numbering has no collisions.

## 13. Settled, not reopened

Every ruling in `rulings.md` §3, R-AW included, stands as given. Nothing above disputes a ruling —
§5's R-D note is flagged as a cross-artifact question for Kody, not a claim that R-D itself is
wrong.
