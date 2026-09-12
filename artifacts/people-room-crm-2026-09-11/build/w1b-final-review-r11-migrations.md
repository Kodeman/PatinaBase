# W1b — final review, round 11 (migrations)

Adversarial review of `build/w1b-report.md` and the five migrations it names, read in full, against
`rulings.md` §3 (R-A … R-BH, **all settled and not findings**), `synthesis/direction.md` §2.2/§3.8/§7/§8,
`synthesis/crm-model.md` §1/§2/§4/§5, `briefing/current-state.md` §B–§E, `build/inventory.md`,
`briefing/fixture.md`, `build/w1a-report.md`, `build/w1a-close-review-r6-migrations.md` / `-tests.md`,
and the prior round (`w1b-final-review-r10-migrations.md` + `w1b-final-fix-log-r10.md`).

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11` (HEAD `e2ab4d523`). Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **Nothing touched on Strata.**

**Verdict: NOT clean — 0 BLOCKING, 3 MAJOR, 15 MINOR.**

All three MAJORs are new this round, and none of them was reachable by any prior round's method:

* **M1** is a live regression the repo's own test suite already guards and **never runs** — the file
  aborts three cases earlier on a column-count assertion W1b itself invalidated. Relaxing that one
  assertion turns the rest of the suite green **except** case (h3), which is a real defect.
* **M2** is a cost, not a predicate: the Directory's new per-row `identity_seat_count()` makes
  `SELECT * FROM people_directory` — literally `use-people.ts:125` — exceed `authenticated`'s own
  8-second `statement_timeout` at ordinary studio size. Every prior round measured the fixture's
  62 rows.
* **M3** is r9 MAJOR-2's consequence walked through the door the r9 guard deliberately left on the
  caller-relative resolver.

---

## 0. What I ran, and what it said

### Environment — the reset is unambiguously local

```
$ ls -la .../apps/designer-portal/ | grep -i env
.---------  .env.example                 # no .env.local in this worktree
$ ls .../supabase/.temp/
cli-latest  start-secrets                # no project-ref
$ docker ps | grep supabase_db
supabase_db_supabase       0.0.0.0:54322->5432/tcp   (this wave's)
supabase_db_patina-hours   0.0.0.0:54422->5432/tcp   (the other program's, a different port)
```

### Reset, twice, with the grants regenerated first

```
$ python3 scripts/generate-legacy-grants.py
wrote .../supabase/seed/00-legacy-grants.sql — baseline + 2719 replayed statements
$ git diff --numstat -- supabase/seed/00-legacy-grants.sql
   (no output — the committed seed already matches the migrations' GRANT/REVOKEs)

$ pnpm --dir .../agent-people-build supabase:reset          # pass 1
RESET1_EXIT=0     no /^error/ or /error:/ lines
   555 "Applying migration" lines; all 30 seed files ran, people_crm_dev.sql among them
$ pnpm --dir .../agent-people-build supabase:reset          # pass 2
RESET2_EXIT=0     no /^error/ or /error:/ lines

$ psql … -At -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
555|20260910152111
$ psql … -At -c "select string_agg(version,' ' order by version) … where version>='00590' …"
00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627
   # 00595–00620 untouched and reserved
```

⚠ One operational note for whoever runs this next: `supabase db reset` ends with
`Restarting containers...`, and for ~20 s afterwards `:54322` answers from a **half-built** database
(my first read after pass 1 returned `384 | 00403`, then `relation "public.organizations" does not
exist`). Poll the ledger until it reads `555` before running anything. Not a finding — an artefact of
the CLI — but it will read as a replay failure to anyone who does not wait.

### Both W1b/W1a suites, after each reset

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0    49 'passed' lines, then 'All W1a assertions passed.'
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0    21 'passed' lines, then 'All W1b assertions passed.'
   (identical after reset pass 2; seed replays identically —
    36 compliance documents · 11 authority grants · 1 site access card ·
    7 consent records · 7 active field links)
```

### Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
   (no output — the committed types already match the local schema)
```

### Catalog posture of all 26 new / edited routines (`probe183`, §3 of `p1.sql`)

Every SECURITY DEFINER pins `search_path=public` (or `public, extensions, pg_temp` for the two
`create_field_link` arities, which need `extensions`); the two IMMUTABLE pure functions
(`party_identity_key`, `party_kind_in_directory`) omit it deliberately — `normalize_channel_value()`'s
posture. No `PUBLIC` and no `anon` on any of the 26. The four `assert_*` trigger functions are
`postgres`/`service_role` only.

### Relations, RLS and grants

```
           relname           | relkind | rls | policies | auth_sel | anon_sel | anon_ins
-----------------------------+---------+-----+----------+----------+----------+----------
 people_directory            | v       | f   |        0 | t        | t        | t   ← m7
 people_directory_seats      | v       | f   |        0 | t        | f        | f
 project_party_authority     | r       | t   |        4 | t        | f        | f
 project_site_access_cards   | r       | t   |        4 | t        | f        | f
 studio_compliance_documents | r       | t   |        4 | t        | f        | f
 v_access_grants             | v       | f   |        0 | t        | f        | f
```

All twelve policies read as the file says: `studio_compliance_documents` on
`is_active_studio_member(organization_id)`; `project_site_access_cards` on
`is_active_studio_member(project_recorded_studio(project_id)) AND
is_studio_comember(project_designer(project_id))` — **four policies, no client leg, no
`show_to_client`, no code-like column** (PR-r/PR-w); `project_party_authority` the same shape through
`project_party_recorded_studio()`, with PR-n's `scope NOT IN ('money','draw_certify') OR
is_org_admin_or_owner(...)` on insert, update and delete.

### Cross-tenant sweep (`probe173`, `probe174`)

Five callers, every new object:

```
                              compliance  authority  site cards  seats  directory  v_access_grants
 designer@patina.dev  (LDS owner)      36        11           1     31         62  13
 studio_manager@…     (LDS admin)      36        11           1     31         62  13
 cf-phase1-alice@…    (other studio)    0         0           0      0          0   1 (own studio_member)
 client@patina.dev    (a client)        0         0           0      0          0   0
 admin@patina.dev     (no org at all)   0         0           0      0          1   1
```

And a plain member of **Leah Hartwell** — the designer of record's second design studio, never a
member of Local Dev Studio:

```
NOTICE:  Z member of Local Dev Studio? f
NOTICE:    seats: 0 · site access cards: 0 · authority grants: 0 · compliance docs: 0
NOTICE:    v_access_grants by tier: client_account=2 field_link=7 studio_member=2
NOTICE:    raw project_parties (RLS): 31 · raw field_link_tokens (RLS): 7   ← the shipped doors
```

The seven `field_link` rows are identical to what `field_link_tokens` already hands that caller, which
is m3's recorded posture — not a new door. **No cross-tenant read of any object this wave adds.**

### Reader-vs-record sweep (`probe186`)

```
NOTICE:  seat lines disagreeing with the record: 0
NOTICE:  Directory rows printing `granted` over a number the record does not: 0
NOTICE:  Directory rows losing a recorded refusal: 0
NOTICE:  paper words disagreeing with compliance_state: 0
```

`normalize_phone_studio_contacts` (a `BEFORE INSERT OR UPDATE` trigger on `studio_contacts`) keeps
`phone_e164` in step with `phone`, so the displayed number and the number the verdict is resolved on
cannot drift — the one way this sweep could have been vacuous.

### Consent gates still gate (checked because the rubric's BLOCKING class turns on it)

`fc_dispatch_optin_invite()` is `AFTER INSERT OR UPDATE` on `project_parties` **for every column**, so
00624's `UPDATE project_parties SET stage = …` backfill fires it on every seat of every completed
project. It is inert: the body returns early unless `NEW.sms_consent_status = 'pending'` with complete
evidence AND the OLD row was not already in that state, and the backfill changes none of those columns.
No migration-time send.
`fc_dispatch_task_assignment()` still gates on
`channel_consent_status(project_consent_org(project_id),'sms', phone_e164) = 'granted'` wrapped in
`COALESCE(…, false)` — fail-closed, record-based (see m14 for the test that reads the old string).

### Re-check of every r10 finding

| r10 finding | Status | Evidence |
|---|---|---|
| **M1 MAJOR** — the reader-side supersede reckoning was one hop | **FIXED** | `00623:635-673` is a depth-capped `WITH RECURSIVE` walk carrying the ROOT's gates; suite block 19 (`19n`–`19u`) green on both resets; `probe185` finds 0 paper words disagreeing with `compliance_state` |
| **M2 MAJOR** — `identity_seat_count()` had no tenant leg | **FIXED as a predicate; NEW cost — see MAJOR-2** | `00626:370-381` now carries `people_directory_seats`' `WHERE` verbatim (the `projects` join, the tenant leg and the three co-member legs); `probe183`: 0 Directory rows claim a seat_count they cannot nest |
| **F2 MAJOR (tests)** — Pete Rusk's field link missing from the seed | **FIXED** | `probe183`: `Pete Rusk reach/consent: field_link / opted_out`; 7 active field links seeded |
| m1 `project_review` reports `revoked_by` as `granted_by` | **OPEN** | `00627:491`; view text still contains `pra.revoked_by` |
| m2 the 00627 banner's grant premise is false | **OPEN** | `00627:32`, `:36-39` unchanged; `w1b-report.md:205-209`, `:580-583` unchanged |
| m3 `v_access_grants`' invoker branches | **OPEN** | re-walked above: 6→7 `field_link` rows for the second studio, identical to the shipped door |
| m4 `evidence_upload` tier unreachable | **OPEN** | `00627:459-478`; 0 rows for the studio owner (0 tokens exist locally, so code-grounded) |
| m5 rule clause is the winning seat's | **OPEN** | `00626:1197` still `contact_rule_summary('engagement', q.id)` |
| m6 all firm rows carry a consent word | **OPEN** | 21 of 21 company rows carry `consent_status` |
| m7 no `REVOKE … FROM anon` on `people_directory` | **OPEN** | `00626:1497`; `has_table_privilege('anon','public.people_directory','SELECT') = t` |
| m8 two portal writers of the frozen columns | **OPEN** | `use-coordination.ts:715` (`sms_consent_status: 'opted_out'`), `:884` (`sms_consent_status: 'pending'`) |
| m9 `blocks` freely member-editable, no audit | **OPEN** | `00623:136`, `:661`, `:665` |
| m10 red SQL suites | **OPEN and broader — see m10 below** | six red files, not two |
| m11 no pass over existing `studio_contact_id` stamps | **OPEN** | `00624:587-600` guards writes only; no validation SELECT anywhere in the file |
| m12 `w1b-report.md` has drifted | **OPEN** | `:333` says 2701 replayed statements (2719), `:353-369` says a 12-block suite (21 blocks), `:383` claims a `654 7` types diff (there is none), `:435-438`'s probe transcript still shows the pre-r8 site-access policies, `:580-583` still carries the retracted ruling request |
| m13 eleven definer uuid→fact oracles | **OPEN** | catalog table above; unchanged |

---

## 1. MAJOR-1 — a designer who belongs to no design studio loses **every** party row from `people_directory` and `people_directory_seats`, while `project_parties` and `v_project_roster` still carry the seat; the repo's own case (h) says this population must be unchanged, and the file that says so aborts three cases earlier on an assertion W1b itself invalidated

`supabase/migrations/00626_people_directory_v4_seats.sql:1290` (the party branch's tenant leg),
`:1610` (the seats view's), `supabase/tests/rls/people_directory_scope_test.sql:298` (the assertion
that aborts the file), `:582-619` (case (h), never reached), `:599-600` (h3).

00594's party branch carried **no tenant leg at all** — three co-member legs and nothing else
(`00626:1291-1293` is where they still are). r5 MAJOR-1/MAJOR-3 added
`is_active_studio_member(project_tenant_org(pp.project_id))` beside them, and r6 MAJOR-1 moved that
leg onto the caller-relative resolver so the admin of the studio doing the work would keep their seats
on a `studio_id IS NULL` job. Both fixes are right for a caller who is in **some** design studio.
`project_tenant_org()`'s second leg (`00624:182-199`) requires the caller to hold an active non-guest
seat in a design-studio organization that the job's designer also belongs to. A designer who belongs
to **no** organization satisfies neither leg: `studio_id` is NULL and there is no membership to rank.
`is_active_studio_member(NULL)` is false (00417), and the whole party branch drops.

### The walk (`probe171-w1b-final-r11-solo-designer.sql`)

One designer belonging to no organization, one project of theirs recording no studio, one unstamped
`gc` seat on it — the shape `people_directory_scope_test.sql:217-242` already seeds as "S":

```
NOTICE:  organizations this designer belongs to: 0
NOTICE:  project_tenant_org(their own project) = NULL  (is_active_studio_member -> f)
NOTICE:  the seat read straight off project_parties (RLS): 1  <-- the record
NOTICE:  people_directory rows for that seat: 0  <-- the reader
NOTICE:  people_directory_seats rows for that seat: 0
NOTICE:  v_project_roster rows on their own job: 1  (the shipped roster view)
```

### The control (`probe172-w1b-final-r11-solo-designer-control.sql`)

Which leg does it, measured against 00594's own predicate on the same row:

```
NOTICE:  co-member leg (their own designer id) = t   tenant leg = f
NOTICE:  v4 party-branch predicate (WITH the tenant leg): 0 row(s)
NOTICE:  CONTROL — 00594 party-branch predicate (no tenant leg): 1 row(s)  <-- what shipped
```

### Why ten rounds did not see it

`tests/rls/people_directory_scope_test.sql` is the file that guards this. Under `ON_ERROR_STOP` it
aborts at `:298` (`FAIL a2: expected exactly 12 columns, got 17`) — an assertion **W1b invalidated by
appending five columns** — so cases (b) through (k) never run. r10 m10 named the abort and reasoned
that the hidden cases were the wave's tenant argument; it did not run them. I did, by relaxing that
one assertion:

```
$ psql … -f <the same file, with `ASSERT v_total = 12` relaxed>
NOTICE:  people_directory_scope: case (a) passed.   … (b) … (c) … (d) … (e) … (f) … (g) passed.
psql:…:620: ERROR:  FAIL h3: solo designer's party should read scope=mine, got NULL
```

and then, with h3 relaxed as well, **everything else is green**:

```
… (h) passed. … (i) passed. … (j) passed. … (k) passed.
NOTICE:  All people_directory scope assertions passed.
EXIT=0
```

So the file is hiding exactly one real defect, and the column-count assertion is what hides it. That
is a sharper reading than r10's: m10 is not only test staleness.

### Why this is MAJOR

- `people_directory` is the shipped feed for `usePeopleDirectory` / `usePerson`
  (`use-people.ts:125`, `:161`) and through them for the People room's head count
  (`people-room.tsx:383`), `directory-view.tsx`, `person-row.tsx`, `command-bar.tsx`'s search,
  `desk-reconnect.tsx` and `desk-derivation.ts`'s dormancy. Every one of them goes blank for this
  population while the roster on the same job still lists the crew.
- It is a **regression**, not a new object failing to appear: 00594's party branch had no tenant leg,
  so these rows are on screen today.
- It needs no adversarial act and no unusual data — it is what a designer who has not joined a studio
  sees, and the repo has an explicit, named case asserting that population is unchanged.
- rulings §6 ships this at 100% with no flag.

### The fix

The tenant leg has to admit the job's own designer when the record names no studio and the caller is
the designer of record (or lead designer, or creator) — the population `project_tenant_org()` cannot
resolve because there is no organization to resolve to. Either widen the leg in the two views to
`is_active_studio_member(project_tenant_org(pp.project_id)) OR pj.designer_id = auth.uid() OR
pj.lead_designer_id = auth.uid() OR pj.created_by = auth.uid()`, or give `project_tenant_org()` a third
leg that is explicit about it. Whichever is chosen, `identity_seat_count()` must carry the same
change, because it is now the seats view's predicate verbatim (`00626:370-381`) and MAJOR-2 below
turns on the two staying identical.

Suite legs owed, in `tests/rls/people_directory_scope_test.sql`: rewrite `a2`/`a1` to assert the
**twelve prefix columns in order** (the property that protects `select('*')` readers) instead of a
total of twelve, so cases (b)–(k) run again; case (h3) then becomes the regression test.

---

## 2. MAJOR-2 — `identity_seat_count()` runs a full RLS-filtered scan of `project_parties` once per Directory row, so `SELECT * FROM people_directory` — exactly what `use-people.ts:125` issues — is cancelled by `authenticated`'s own 8-second `statement_timeout` at ordinary studio size

`supabase/migrations/00626_people_directory_v4_seats.sql:364-381` (`identity_seat_count`),
`:1198` and `:1399` (the two call sites), `:257-260` (the expression index that does not help),
`packages/supabase/src/hooks/use-people.ts:125` (`.select('*')`, no limit).

`identity_seat_count()` is `LANGUAGE sql STABLE SET search_path` — the `SET` clause blocks inlining —
so each call is its own query. Its body joins `project_parties` to `projects` under the caller's RLS
and filters on `party_identity_key(...) = p_identity_key`. The expression index
`idx_project_parties_identity_key` (`:257-260`) cannot be used, because `project_parties`' RLS filter
is not leakproof and is applied in the same scan. The plan, at 631 seats
(`probe182-w1b-final-r11-seatcount-plan.sql`):

```
->  Seq Scan on project_parties pp (actual rows=0 loops=1)
      Filter: (is_project_team_member(project_id, …) OR EXISTS(SubPlan 1) OR … )
              AND (COALESCE(studio_contact_id::text, profile_id::text, …) = '…')
              AND is_active_studio_member(project_tenant_org(project_id))
      Rows Removed by Filter: 631
      SubPlan 1 -> Index Scan using projects_pkey (actual rows=1 loops=631)
 Execution Time: 21.249 ms      ← per Directory row
```

The view calls it once per row on two branches (`:1198`, `:1399`), so the cost is
`rows × seats`. Measured, one caller (`designer@patina.dev`), the seeded fixture grown by N extra
rolodex cards and N extra seats (`probe180-w1b-final-r11-directory-growth-curve.sql`):

```
NOTICE:  cards+seats added=0   -> people_directory SELECT * :   62 rows in 00:00:00.101
NOTICE:  cards+seats added=100 -> people_directory SELECT * :  262 rows in 00:00:01.320
NOTICE:  cards+seats added=200 -> people_directory SELECT * :  662 rows in 00:00:07.147
NOTICE:  cards+seats added=400 -> people_directory SELECT * : 1462 rows in 00:00:32.495
NOTICE:  cards+seats added=800 -> people_directory SELECT * : 3062 rows in 00:02:20.045
```

and the column it is (`probe177-w1b-final-r11-directory-cost-decomposition.sql`, at 449 cards / 631
seats):

```
NOTICE:  contacts branch skeleton:            449 rows in 00:00:00.005
NOTICE:    + identity_seat_count only:        449 rows in 00:00:08.165   ← the whole cost
NOTICE:    + identity_consent_status only:     49 rows in 00:00:00.119
NOTICE:    + identity_paper_state only:       449 rows in 00:00:00.081
```

`authenticated` carries `statement_timeout=8s` in its own `rolconfig`
(`select rolname, rolconfig from pg_roles` → `authenticated | {statement_timeout=8s}`), which is what
PostgREST runs under. At 649 cards and 631 seats — one studio, one busy job
(`probe181-w1b-final-r11-directory-statement-timeout.sql`):

```
--- the query use-people.ts:125 issues, as PostgREST runs it ---
ERROR:  canceling statement due to statement timeout
CONTEXT:  SQL function "is_project_team_member" statement 1
        SQL function "identity_seat_count" statement 1
```

### Why this is MAJOR

- The reader does not disagree with the record — it returns **57014** and shows nothing at all, on the
  one surface this whole program exists to build, at a size Leah's studio reaches inside a year.
  `usePeopleDirectory` has no limit, no pagination and no fallback.
- The same blowup hits `usePerson` (`:161`), which filters `people_directory` on `person_id` — the
  filter is applied **above** the view, so every row's `identity_seat_count()` still runs.
- It is not the r10 fix's doing: the pre-r10 body measures the same 8.16 s on the same fixture, because
  the RLS-filtered sequential scan, not the tenant leg, is the cost. But `identity_seat_count()` is a
  function this wave introduces, and the six-branch view it replaces had no per-row function of any
  kind, so the regression is the wave's.
- rulings §6 ships it at 100%, unflagged, in one chain.

### The fix

Count the seats **once**, in a set-returning join, rather than once per row: a
`LEFT JOIN LATERAL` or a grouped CTE over `project_parties` keyed on `party_identity_key()` computed a
single time for the whole view, joined to both branches on the identity key. That also keeps the
"one definition of this identity's seats" property r10 M2 bought, because the CTE would then literally
be `people_directory_seats`' own predicate, evaluated once. Whatever shape is chosen, the gate is the
measurement: `SELECT * FROM people_directory` under `SET statement_timeout='8s'` at ≥600 cards and
≥600 seats must return rows, and `probe180`'s growth curve must be linear rather than quadratic.

---

## 3. MAJOR-3 — on a `studio_id IS NULL` project, a member of the designer's **second** design studio can stamp a seat on the working studio's job with a card from their own rolodex; `assert_project_party_cards()` accepts it, and the working studio then reads the seat under an identity it cannot open

`supabase/migrations/00624_project_party_window_and_authority.sql:542` (`v_org :=
project_tenant_org(NEW.project_id)`), `:587-600` (the `studio_contact_id` leg), `:516-524` (the file's
own claim about the cost), `00626:1270` (the party branch excludes every stamped seat),
`00626:1534-1548` (`people_directory_seats.person_id` COALESCEs to the stamp).

r9 MAJOR-2 closed the **stamped** path by giving `studio_contact_id` a card guard, and the guard
resolves `project_tenant_org()` deliberately — `00624:516-524` argues a record-only resolver there
would be r7 BLOCKING-1's inversion, which is right. What the file then says is that it "costs nothing
on the shipped data: all five studio-less local projects carry 0 seats." That is true of the data and
false of the door: `project_tenant_org()` is **caller-relative** on exactly that population, so the
guard checks the card against *the writer's own studio*, and a writer in the designer's second studio
passes.

### The walk (`probe184-w1b-final-r11-foreign-card-stamp.sql`)

`Z` is a plain member of Leah Hartwell — the designer of record's second design studio — and of
nothing else. `Aspen Loft Refresh` is one of the five local projects that record no `studio_id`; Local
Dev Studio is the studio doing the work.

```
NOTICE:  Z member of Local Dev Studio? f   of Leah Hartwell? t
NOTICE:  project_tenant_org(Aspen Loft, as Z) = 729e8fd0-…   (Leah Hartwell)
NOTICE:  Z filed a card in Leah Hartwell: 3c1263bc-…
NOTICE:  the stamped seat LANDED on Local Dev Studio's job: 8215b8d3-…
           <-- assert_project_party_cards accepted it
NOTICE:  --- as Local Dev Studio's admin ---
NOTICE:    project_tenant_org(Aspen Loft, as the LDS admin) = b0000000-…-0001
NOTICE:    can the LDS admin read that rolodex card? 0 row(s)
NOTICE:    can the LDS admin read the seat itself? 1 row(s)
NOTICE:    the seat nests under person_id = 3c1263bc-…  (the foreign card)
NOTICE:    Directory rows the LDS admin can open for that person_id: 0
             <-- the human is unreachable
```

Everything ROLLBACKs.

### Why this is MAJOR, and what it is not

- It is r9 MAJOR-2's own consequence sentence, verbatim: a seated human present on the roster and
  absent from the working studio's Directory, nesting under a card that studio cannot read. The r9
  guard closes it wherever `projects.studio_id` is set and leaves it open where it is not — which is
  **5 of 8 projects locally**, and an unknown count on Strata that R-BD already owes.
- **It is not a new read door.** `project_parties`' shipped RLS (00584) already lets a co-member of the
  designer insert and update seats on that job; `probe174` shows the same caller reading all 31 party
  rows directly. What is new is that `studio_contact_id` is now the identity key, so the write decides
  which studio's Directory the human appears in.
- R-BD settles the *population* (W3 backfills `projects.studio_id`, W7 counts the remainder); it does
  not settle a guard that accepts a foreign card. r10 §4 recorded the studio-less residue as a list of
  **refusals** (0 cards, 0 grants, 0 seats for the second studio) — an accepted foreign stamp is the
  other direction and is not in that list.

### The fix, or the ruling

Two shapes, both consistent with r7 BLOCKING-1: keep `project_tenant_org()` for the *refusal* path but
add a second conjunct that the card's `organization_id` must also equal
`project_recorded_studio(NEW.project_id)` **whenever that is non-NULL**, and where it is NULL require
the card's studio to be one the job's designer of record actively belongs to *and* that the writer is
not merely a co-member — or simply refuse a `studio_contact_id` stamp outright on a project that
records no studio (`party_card_project_has_no_studio`), which costs the studio-less population the
stamp until R-BD's backfill and cannot invert r7's guard, because that guard was about the working
studio's **own** cards being refused, not about foreign ones being accepted. This is a ruling as much
as a fix; it should not be decided in the migration without Fable.

---

## 4. MINOR findings

r10's thirteen are all still open and are re-evidenced in §0's table. Restated here only where this
round changed what is known; two are new.

### m1 — `v_access_grants`' `project_review` tier reports the **revoker** as the grantor (carried, **open**)

`00627:491`. `project_review_access` has no grantor column, so `granted_by` is NULL for every live
grant and becomes the person who **closed** the door once revoked, on a view whose stated purpose is
"who opened it" (`00627:15-17`). The adjacent `evidence_upload` branch gets the same situation right
and says so (`00627:461-464`). Fix: `NULL::uuid` with the same one-line note.

### m2 — the 00627 banner's grant premise is factually wrong, and `w1b-report.md` §5/§8 asks Kody to rule on it (carried, **open**)

`00627:32`, `:36-39`, `:144-146`, `:235-237`; `w1b-report.md:205-209`, `:580-583`. Both tables carry
**column-level** grants, so their shipped `FOR ALL TO authenticated` policies do fire; the definer
readers project `created_by` and `updated_at`, which those column lists withhold, so the readers do
widen the effective ACL. The ruling request to Kody rests on a false premise and, acted on, would
expose both tables' `token_hash`. Withdraw or restate it before Kody sees it.

### m3 — `v_access_grants`' seven invoker branches inherit predicates broader than the tenant conjunct this wave applies everywhere else (carried, **open**)

`00627:342-497`. Re-walked this round: the second-studio member reads 7 `field_link` rows, identical
to what `field_link_tokens` hands them directly. Not a new door; direction §7 defers this view's RLS to
each base table. It belongs in the view's COMMENT the way r6 MAJOR-2's four branches belong in
`people_directory`'s.

### m4 — the `evidence_upload` tier is unreachable for the studio that minted the door (carried, **open**)

`00627:459-478`. `fulfillment_evidence_upload_tokens`' only `authenticated` SELECT policy is gated on a
platform `user_roles` row. 0 rows for the studio owner; 0 tokens exist locally, so this stays
code-grounded. Read-only, no leak; a completeness gap owed a line in the branch's comment.

### m5 — the Directory row's rule clause is the winning seat's, not the identity's (carried, **open**, medium confidence)

`00626:1197`: `contact_rule_summary('engagement', q.id)` over the `DISTINCT ON` winner, while
`reach_state`, `consent_status` and `seat_count` on the same row were all lifted to the identity.
An uncarded identity whose per-job override sits on the non-winning seat prints "no rule on file"
while the seat line beneath prints the rule — against R-S. Still not walkable on the fixture (the one
uncarded identity holds one seat and no engagement-subject rule is seeded). Reduce it the way the
other three reduce, or say in the COMMENT that it is deliberately the winning seat's.

### m6 — every firm card carries a `consent_status` word R-G gives the company row no column for (carried, **open**)

`00626:1391`. 21 of 21 company rows. R-G fixes the company row at two bordered word columns (paper,
payee marker) with no consent column, so this is a display rule left in the app — the same posture as
R-A/C13's paper word, which the view's COMMENT names explicitly (`00626:1425-1427`). This split is
unstated. One sentence, so a later reader does not print it.

### m7 — `people_directory` is the only relation of this wave with no explicit `REVOKE … FROM anon` (carried, **open**)

`00626:1497` is a bare `GRANT SELECT … TO authenticated`, while `people_directory_seats` (`:1649`) and
`v_access_grants` (`00627:515`) both `REVOKE ALL … FROM PUBLIC, anon` first. Locally
`has_table_privilege('anon','public.people_directory', …)` is `t` for SELECT **and INSERT**, from
`seed/00-legacy-grants.sql`'s blanket; the view is `security_invoker` and not auto-updatable, so
neither is reachable. No exposure; one line, since the wave's own rule is "revoked explicitly rather
than left to creation defaults" (`00625:30`).

### m8 — two live portal UPDATE writers of the frozen consent columns will raise the moment this chain ships (carried, **open**)

`packages/supabase/src/hooks/use-coordination.ts:715` (the phone-correction path, which also writes
`phone`/`phone_e164` — frozen by R-AX) and `:884` (the field opt-in attestation). Both are fail-closed
(the write is refused, nothing is lost) and both are already owed to W2 in `w1a-report.md` §8 and
`w1b-report.md` §8 — restated because these are two ordinary studio acts that will hard-error in
production and rulings §6 ships the chain unflagged.

### m9 — `compliance_state()`'s whole gating reckoning rests on a freely member-editable `blocks` with no audit trail (carried, **open** — a ruling)

`00623:136`, `:661`, `:665`. One `UPDATE studio_compliance_documents SET blocks='{}'` by a plain admin
flips a holder from `lapsed` to `current` with the lapsed certificate untouched. Record and reader
agree afterwards, which is why it is MINOR — but it means the r3/r4/r9/r10 guard family can never
deliver the invariant its COMMENT claims (`00623:463-465`). If `blocks` is the studio's own judgement,
say so; if it is load-bearing for the `site_access`/`draw` gates it wants the `verified_by`/
`verified_at` treatment or an append-only change record.

### m10 — **six** SQL suites are red on this branch, not two; none is in `KNOWN_FAILURES.md`; none is named in `w1b-report.md` §7 or §8 (carried from r10, **open and broader**)

Measured on the twice-reset database:

```
=== tests/rls/people_directory_scope_test.sql               EXIT=3  FAIL a2: expected exactly 12 columns, got 17
=== tests/rls/field_parties_test.sql                        EXIT=3  ERROR: consent_legacy_column_frozen
=== tests/field/project_task_field_capture_ref_test.sql     EXIT=3  FAIL 4b: the dispatch trigger lost its consent gate
=== tests/site_requests/00471_authority_and_action_detail_test.sql  EXIT=3  canonical mobile send did not enqueue an exact granted-consent dispatch
=== tests/site_requests/00472_binder_exact_studio_privacy_test.sql  EXIT=3  canonical send did not enqueue granted-consent dispatch
=== tests/site_requests/security_and_lifecycle_test.sql     EXIT=3  send must transition not_asked consent to pending
```

(`tests/commercial/{executed_on_paper,trade_rfq,trade_scope}_test.sql` are also red and **are** listed
in `KNOWN_FAILURES.md`; `tests/rls/{project_roster,00584_studio_comember_rls_sweep,studio_contacts_backfill,sms_tables}`
and `tests/field/field_links_test.sql` are green.)

Three things r10 did not establish:

1. `people_directory_scope_test.sql`'s abort hides a **real regression** — MAJOR-1. The file is
   otherwise green.
2. `project_task_field_capture_ref_test.sql:209` is a **source-text proxy**: it asserts
   `pg_get_functiondef('fc_dispatch_task_assignment')` contains `sms_consent_status` and `granted`.
   R-AY repointed that gate to `channel_consent_status()`, so the string is gone and the gate is not —
   I read the live body and it is fail-closed and record-based. The assertion needs rewriting to the
   record's function name, not the frozen column's.
3. The three `site_requests` failures are the same family (the rail repointed to the record by 00621/
   00622 while the tests still stage consent on the seat). They are W1a's changes, but they are red in
   the branch W1b ships in, and `w1b-report.md` §7 presents verification as two green suites.

Either fix the six or list them in `KNOWN_FAILURES.md` — the repo's own mechanism, currently silent on
all six.

### m11 — the `studio_contact_id` guard covers future writes only; nothing counts or repairs existing stamps, and R-BD's W7 preflight is scoped to `studio_id IS NULL` alone (carried, **open**)

`00624:587-600`, `:635-640`. The migration adds no validation pass over existing rows. Any legacy seat
on Strata whose `studio_contact_id` names a card in another studio survives the deploy carrying r9
MAJOR-2's consequence. One SELECT belongs beside R-BD's in the W7 preflight — and, after MAJOR-3, the
same query is the only way to measure that door's existing blast radius:

```sql
SELECT count(*) FROM project_parties pp
  JOIN projects pj ON pj.id = pp.project_id
  JOIN studio_contacts sc ON sc.id = pp.studio_contact_id
 WHERE pp.studio_contact_id IS NOT NULL
   AND (pj.studio_id IS NULL OR sc.organization_id <> pj.studio_id);
```

### m12 — `w1b-report.md` has drifted from the code it describes (carried, **open**)

Re-verified against HEAD `e2ab4d523`: `:333` says 2701 replayed grant statements (2719); `:353`,
`:357-369` describe a 12-block suite (21 blocks, and the NOTICE text for blocks 4, 12 and 19 has
changed); `:383` claims a `654 7` diff on `database.types.ts` (there is none — the committed types
already match); `:435-438`'s probe transcript still shows the pre-r8 site-access policies
(`is_studio_comember(project_designer(project_id))` alone, where the live policies carry
`is_active_studio_member(project_recorded_studio(project_id))` first); `:580-583` still carries the
ruling request m2 retracts. Eleven rounds of fixes have not been folded back, and this is the artefact
Fable and Kody read.

### m13 — eleven definer uuid→fact oracles answer any authenticated caller (recorded, not new)

`00624:173`, `:238`, `:310`, `:342`; `00625:64`. `project_recorded_studio()`,
`project_party_recorded_studio()`, `project_designer()`, `project_tenant_org()` and
`project_party_org()` are all SECURITY DEFINER with `GRANT EXECUTE … TO authenticated` and no
membership gate — the shipped posture of `project_consent_org()` (00594) and
`project_party_designer()` (00592) they were grafted from. Named again only because the count keeps
growing and a gate resolver is among them.

### m14 — the dev seed writes `studio_channel_consent` by raw `ON CONFLICT DO UPDATE`, bypassing `record_channel_consent()`'s R-AG/R-AL gates, and is wired into the **staging** seed array (new)

`supabase/seed/people_crm_dev.sql:489-545`, `supabase/config.toml:60` and `:88`. The upsert overwrites
`status`, `consented_at`, `source`, `evidence`, `opt_out_at`, `opt_out_source`, `opt_out_evidence`,
`refusal_unanswered` and `origin_project_id` on conflict. `studio_channel_consent` carries no trigger
enforcing R-AG ("no status change may null or overwrite consent evidence; a change restates evidence or
is refused") — those invariants live only in the `record_channel_consent()` RPC:

```
$ psql … -c "select tgname from pg_trigger where tgrelid='public.studio_channel_consent'::regclass and not tgisinternal;"
 set_updated_at_studio_channel_consent
 site_request_consent_granted_dispatch
```

So on any database where a record for one of those seven numbers already exists at
`b0000000-…-0001`, replaying the seed flips it — including an `opted_out` to `granted` — **with no
newly recorded consent**. On a local `db reset` the table is empty first, so nothing is lost; the
reason this is MINOR rather than BLOCKING is that the only write path is service_role during a seed,
and the numbers are the `+1612555011x` fixture range. It is worth naming because `w1b-report.md` §6
already asks Fable to rule on `people_crm_dev.sql` being in `[remotes.staging.db.seed]`, and this is the
concrete cost of answering "yes". Either route the seed through `record_channel_consent()`, or make the
upsert `ON CONFLICT DO NOTHING`, or take the line out of the staging array.

### m15 — `supabase db reset` leaves `:54322` answering from a half-built database for ~20 s after it prints "Finished" (new, environmental)

Not a defect in this wave, recorded because it will read as one. Immediately after
`RESET1_EXIT=0` the ledger read `384 | 00403` and then
`ERROR: relation "public.organizations" does not exist`; three polls later it read
`555 | 20260910152111` and stayed there. The CLI's closing `Restarting containers...` recreates
`supabase_db_supabase`. Any runbook or CI step that reads the ledger or runs a suite straight after
`supabase db reset` should poll until the count settles.

---

## 5. Recorded, not findings

- **`compliance_state()`'s transitive walk is sound under adversarial writes.** The head-of-chain guard
  (`00623:408-415`) keeps `superseded_by` acyclic; the recursive step terminates on a NULL `succ`; the
  `retired` CTE requires each reachable successor to be in force **and** to contain the **root's**
  gates, and the write guard chains `A.blocks ⊆ B.blocks ⊆ C.blocks`, so no chain can retire a lapse
  without a genuine in-force certificate carrying its gates. `probe186`: 0 paper words disagree with
  `compliance_state` over the holder pair.
- **The 00624 backfill fires no send.** `fc_optin_invite_dispatch` is `AFTER INSERT OR UPDATE` on every
  column of `project_parties`, but its body's own guards make it inert for a `stage`-only update
  (§0 above). Worth keeping in the file's comment, since a future column added to that backfill's
  `SET` list could change the answer.
- **`contact_rule_summary()` is safe against multiple rules**: `studio_contact_rules` carries
  `idx_studio_contact_rules_subject UNIQUE (subject_type, subject_id)`.
- **`normalize_phone_studio_contacts`** keeps `studio_contacts.phone_e164` in step with `phone`, so the
  Directory's displayed number and the number its consent verdict is resolved on cannot drift.
- **The local DB was this wave's sole owner** for this review: the other program's stack is a separate
  container on `:54422`. The ledger read `555 / 20260910152111` before the first probe and after the
  last; every probe ends in `ROLLBACK`; `git status` under `supabase/`, `packages/` and `apps/` is
  clean.

---

## 6. Findings, ranked

| # | Severity | Confidence | Where | Claim |
|---|---|---|---|---|
| M1 | MAJOR | high | `00626:1290`, `:1610`; `tests/rls/people_directory_scope_test.sql:298`, `:599-600` | A designer belonging to no design studio loses every party row from `people_directory` and `people_directory_seats` while `project_parties` and `v_project_roster` still carry the seat — a regression on 00594, walked with a control, guarded by the repo's own case (h3), which never runs because the file aborts on a column-count assertion W1b invalidated |
| M2 | MAJOR | high | `00626:364-381`, `:1198`, `:1399`; `use-people.ts:125` | `identity_seat_count()` runs a full RLS-filtered `project_parties` scan per Directory row (21 ms each, measured), so `SELECT * FROM people_directory` is cancelled by `authenticated`'s own 8 s `statement_timeout` at 649 cards / 631 seats; growth curve 0.1 s → 7.1 s → 32 s → 140 s |
| M3 | MAJOR | high | `00624:542`, `:587-600`, `:516-524` | On a `studio_id IS NULL` project the card guard resolves the caller-relative `project_tenant_org()`, so a member of the designer's second design studio lands a foreign rolodex card as `studio_contact_id` on the working studio's seat; that studio then reads the seat and can open no Directory row for the human — r9 MAJOR-2's consequence, walked |
| m1 | MINOR | high | `00627:491` | The `project_review` tier reports `revoked_by` as `granted_by` |
| m2 | MINOR | high | `00627:32`, `:36-39`; `w1b-report.md:205-209` | The banner's "no ACL moved / dead policies" premise is false, and the report's ruling request to Kody rests on it |
| m3 | MINOR | high | `00627:342-497` | The seven invoker branches inherit `is_studio_comember(designer)`; walked — 7 `field_link` rows, identical to the shipped door. Belongs in the COMMENT |
| m4 | MINOR | high | `00627:459-478` | The `evidence_upload` tier returns 0 rows for every studio member |
| m5 | MINOR | medium | `00626:1197` | The Directory row's rule clause is the winning seat's, not the identity's |
| m6 | MINOR | high | `00626:1391` | All 21 firm rows carry a `consent_status` word R-G gives the company row no column for |
| m7 | MINOR | high | `00626:1497` | `people_directory` is the wave's only relation with no explicit `REVOKE … FROM anon` (`anon` holds SELECT and INSERT locally) |
| m8 | MINOR | high | `use-coordination.ts:715`, `:884` | Two live portal UPDATE writers of the frozen consent columns will raise `consent_legacy_column_frozen` |
| m9 | MINOR | high | `00623:136`, `:661`, `:665` | `blocks` is freely member-editable with no audit, so the gating reckoning can be undone in one untraceable write — a ruling |
| m10 | MINOR | high | six test files, `KNOWN_FAILURES.md` | Six SQL suites are red on this branch, not two; none is listed; one hides M1; one asserts a consent gate by a source string R-AY retired while the gate itself is intact |
| m11 | MINOR | medium | `00624:587-600`, `:635-640` | The stamp guard covers new writes only; no pass counts or repairs existing stamps, and R-BD's W7 preflight does not look for them — now also the only way to size M3 |
| m12 | MINOR | high | `w1b-report.md:333`, `:353-369`, `:383`, `:435-438`, `:580-583` | The report has drifted from the code across eleven fix rounds |
| m13 | MINOR | high | `00624:173`, `:238`, `:310`, `:342`; `00625:64` | Five more definer uuid→fact oracles answer any authenticated caller; the platform count is eleven |
| m14 | MINOR | high | `seed/people_crm_dev.sql:489-545`; `config.toml:60`, `:88` | The dev seed upserts consent records directly, bypassing `record_channel_consent()`'s R-AG/R-AL gates (no trigger enforces them), and is wired into the staging seed array |
| m15 | MINOR | high | environmental | `supabase db reset` leaves `:54322` answering from a half-built database for ~20 s after it prints "Finished" |

Probe files written this round, all under `artifacts/people-room-crm-2026-09-11/build/`
(`git add -f`), every one read-only or `ROLLBACK`ed:
`probe171-w1b-final-r11-solo-designer.sql`,
`probe172-w1b-final-r11-solo-designer-control.sql`,
`probe173-w1b-final-r11-cross-tenant-sweep.sql`,
`probe174-w1b-final-r11-second-studio.sql`,
`probe177-w1b-final-r11-directory-cost-decomposition.sql`,
`probe180-w1b-final-r11-directory-growth-curve.sql`,
`probe181-w1b-final-r11-directory-statement-timeout.sql`,
`probe182-w1b-final-r11-seatcount-plan.sql`,
`probe183-w1b-final-r11-prior-findings-recheck.sql`,
`probe184-w1b-final-r11-foreign-card-stamp.sql`,
`probe186-w1b-final-r11-consent-divergence-sweep.sql`.
