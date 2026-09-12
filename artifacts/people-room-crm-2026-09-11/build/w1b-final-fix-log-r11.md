# W1b — fix log, round 11

Three MAJORs from `w1b-final-review-r11-migrations.md`, fixed in place in the two
migrations that carry them (both unapplied on Strata) plus the two suites that
guard them. Nothing else was touched: the fifteen MINORs stay open, and this log
does not close any of them.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **Nothing on Strata.**

---

## M1 — a designer who belongs to no design studio lost every party row

`supabase/migrations/00626_people_directory_v4_seats.sql` — three sites, one
predicate.

`project_tenant_org()`'s second leg needs an active non-guest design-studio
membership shared with the job's designer. A designer who belongs to no
organization has none, so the resolver answers NULL,
`is_active_studio_member(NULL)` is false (00417), and the tenant leg erased the
whole party branch for that population while `project_parties` (RLS) and
`v_project_roster` still carried the seat. 00594's party branch had no tenant leg
at all, so this was a regression on shipped behaviour.

The leg is widened, identically, in all three places that state it — the
Directory's party branch (§3), `people_directory_seats`' `WHERE` (§4) and
`identity_seat_count()` (§2), which R-BG requires to stay the seats view's
predicate verbatim:

```sql
AND ( public.is_active_studio_member(public.project_tenant_org(pp.project_id))
   OR pj.designer_id      = (select auth.uid())
   OR pj.lead_designer_id = (select auth.uid())
   OR pj.created_by       = (select auth.uid()) )
```

It admits the three people the job itself names and nobody else, so r5
MAJOR-1/MAJOR-3 — a member of the designer's SECOND studio reading this studio's
seats — stays closed, and r6 MAJOR-1's admin of the studio doing the work still
comes in through the first leg.

**The suite that hid it** (`supabase/tests/rls/people_directory_scope_test.sql`):
case `a2` asserted a TOTAL of twelve columns, which W1b invalidated by appending
five, so the file aborted at `:298` under `ON_ERROR_STOP` and cases (b)–(k) never
ran — including (h3), written to assert exactly this population. `a1` already
asserts the twelve PREFIX columns in order and is unchanged; `a2` now asserts
`v_total >= 12` with the property in the message ("columns may be APPENDED after
scope; none may be inserted among the twelve or dropped"), and `a3` still pins
`scope` at position 12. (h3) is now the regression test, and it runs.

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/people_directory_scope_test.sql
EXIT=0   cases (a) … (k), then 'All people_directory scope assertions passed.'
```

`probe187-w1b-fix-r11-major1-solo-designer.sql` — probe171's fixture, plus the
negative control r5 demands:

```
NOTICE:  organizations this designer belongs to: 0   project_tenant_org(their own project) = NULL  (is_active_studio_member -> f)
NOTICE:  project_parties (RLS): 1   people_directory: 1   people_directory_seats: 1   v_project_roster: 1   seat_count on the row: 1
NOTICE:  POSITIVE: the reader agrees with the record, and the row claims exactly what it nests.
NOTICE:  the second studio's plain member: raw project_parties (the shipped RLS door) 31 · people_directory_seats 0 · Directory party rows on those jobs 0
NOTICE:  NEGATIVE CONTROL: 0 and 0 — the widened leg admits the job's own designer and nobody else.
```

(Before: `people_directory 0 / people_directory_seats 0` on the same fixture —
probe171.)

---

## M2 — the Directory counted seats once per row

`00626` §3: the two per-row `identity_seat_count()` calls (`:1198` contacts,
`:1399` party) are replaced by one `MATERIALIZED` CTE, `identity_seats`, declared
on the view and `LEFT JOIN`ed onto the two branches that carry a count
(`COALESCE(iseat.seat_count, 0)` — the function returned 0 for the same case).
The CTE is `identity_seat_count()`'s body, grouped: the same tenant leg with M1's
disjunction, the same three co-member legs, the same `party_identity_key()`, no
kind filter — so it is still `people_directory_seats`' own row set and R-BG holds.
`identity_seat_count()` survives, carrying the identical predicate, for the
single-identity question.

`probe188-w1b-fix-r11-major2-directory-cost.sql` — probe180's growth curve
verbatim, same fixture, same query, same `statement_timeout=8s` (which is
`authenticated`'s own `rolconfig`, i.e. what PostgREST runs under):

```
NOTICE:  cards+seats added=0   -> people_directory SELECT * :   62 rows in 00:00:00.101297
NOTICE:  cards+seats added=100 -> people_directory SELECT * :  262 rows in 00:00:00.597205
NOTICE:  cards+seats added=200 -> people_directory SELECT * :  662 rows in 00:00:01.645471
NOTICE:  cards+seats added=400 -> people_directory SELECT * : 1462 rows in 00:00:03.674984
NOTICE:  cards+seats added=800 -> people_directory SELECT * : 3062 rows in 00:00:07.866959
NOTICE:  the fixture the gate runs on: 1549 rolodex cards · 1531 seat rows
NOTICE:  GATE: SELECT * FROM people_directory under statement_timeout=8s returned 3062 rows in 00:00:07.990889
NOTICE:  Directory rows claiming a seat_count they cannot nest: 0
NOTICE:  contacts rows where the CTE and identity_seat_count() disagree: 0
```

Before: `0.101 · 1.320 · 7.147 · 32.495 · 140.045`, and cancelled outright at
649 cards / 631 seats. The curve is now rows × a constant (~2.5 ms/row at every
point) rather than rows × seats, and the review's gate — ≥600 cards and ≥600
seats must return rows under an 8 s timeout — is met at 749 cards / 731 seats in
3.67 s.

`probe190-w1b-fix-r11-major2-residual-decomposition.sql` attributes what is left,
at 649 cards / 631 seats (probe177's shape):

```
NOTICE:  contacts branch skeleton:              649 rows in 00:00:00.007846
NOTICE:    the identity_seats CTE, whole:       626 identities in 00:00:00.020693  <-- ONCE, not per row
NOTICE:    + identity_consent_status only:       49 rows in 00:00:00.172578
NOTICE:    + identity_paper_state only:         649 rows in 00:00:00.115799
NOTICE:    + reach_state_for only:              649 rows in 00:00:00.280960
NOTICE:  the whole view, SELECT * :            1262 rows in 00:00:03.199528
```

The seat count went from 8.165 s (probe177) to 0.021 s for the whole view. The
residual is the remaining per-row readers, each linear in rows; at ~3 100 rows
the feed reads 7.9 s, inside the timeout but not comfortably. **Recorded, not
fixed** — M2's claim is the rows × seats blow-up, and reducing the rest is
another finding, not this one.

---

## M3 — a foreign rolodex card could be stamped on a studio-less job

`supabase/migrations/00624_project_party_window_and_authority.sql`,
`assert_project_party_cards()`.

`v_org := project_tenant_org(NEW.project_id)` is caller-relative on exactly the
`studio_id IS NULL` population, so the card guard checked the card against the
WRITER's own studio. The `studio_contact_id` leg — and only that leg, because it
is the v4 identity key and therefore decides which studio's Directory a seated
human appears in — now also asks the record:

* `v_recorded := project_recorded_studio(NEW.project_id)`;
* where it is NULL the stamp is refused `party_card_project_has_no_studio`;
* where it is non-NULL the card must satisfy `sc.organization_id = v_recorded`
  beside `= v_org` (equal by construction, since `project_tenant_org()` COALESCEs
  `studio_id` first — written anyway so the identity key does not depend on which
  resolver a later editor reaches for).

`company_id` and `warranty_contact_person_id` deliberately keep r7 BLOCKING-1's
caller-relative posture: neither is the identity key, and narrowing them is that
finding's inversion. Refusing the stamp is not: r7 was the working studio's OWN
cards being refused; this is a foreign card being accepted.

`probe189-w1b-fix-r11-major3-foreign-card-stamp.sql` — probe184's walk, with the
card filed in the studio the caller-relative resolver actually names for that
writer (so the OLD guard would have accepted this exact write), plus four
controls:

```
NOTICE:  Z member of Local Dev Studio? f   of Leah Hartwell? t   project_tenant_org(Aspen Loft, as Z) = 4f65641c-… (Leah Hartwell)
NOTICE:  project_recorded_studio(Aspen Loft) = NULL  <-- the record names none
NOTICE:  Z filed a card in Leah Hartwell, the studio the old guard would have checked against: 97eec520-…
NOTICE:  the foreign stamp on Local Dev Studio's job was REFUSED: party_card_project_has_no_studio  <-- assert_project_party_cards
NOTICE:  CONTROL 1 — the same foreign card on a job that RECORDS the working studio is refused by the r9 leg: party_studio_contact_other_studio
NOTICE:  CONTROL 2 — the working studio's OWN card on its own studio-less job is refused too: party_card_project_has_no_studio
NOTICE:  CONTROL 3 — its own card on a job that RECORDS its studio LANDED: 088eb9e4-…  (r7 BLOCKING-1 not inverted)
NOTICE:  CONTROL 4 — company_id + warranty_contact_person_id on the studio-less job still LAND: e32b023a-…  (block 14's posture, r7 BLOCKING-1)
```

CONTROL 2 is the cost, stated plainly: **nothing in a record that names no studio
tells the studio doing the work from the designer's second one**, so the refusal
is flat, and the studio-less population loses the stamp until R-BD's W3 backfill
writes `projects.studio_id`. The reviewer's other shape for the NULL case — "the
card's studio must be one the job's designer of record actively belongs to as
well as the writer" — does not close the door: that is precisely what
`project_tenant_org()`'s second leg already requires, and the walked attacker's
studio satisfies it. **This is a ruling as much as a fix (Fable / Kody):** it is
the only sound answer this file can give, and it costs a feature on 5 of 8 local
projects and an unknown count on Strata.

Two consequences worth having in front of the ruling:

1. A stamped seat can no longer be **moved** onto a studio-less job either — the
   trigger's `OF` list already carries `project_id`, and the leg re-validates
   `NEW.studio_contact_id`. Any UPDATE of the four guarded columns on a legacy
   stamped seat that sits on a studio-less job now raises
   `party_card_project_has_no_studio`. Fail-closed, with a named error.
2. The guard covers writes only. Nothing repairs the stamps already on the table,
   and the preflight SELECT that sizes them (m11's) is now written into the file
   beside the trigger as a comment, to be run on Strata with R-BD's count. It is
   0 locally.

**Suite change this forced** —
`supabase/tests/people/w1b_compliance_authority_directory_test.sql` block 16
(r7 MAJOR-1: a seat on a studio-less job must contribute its number to the
identity's worst-first consent reduction) staged its premise by INSERTing a
stamped seat on the studio-less job. That row is now legacy-only, so the block
lifts `assert_project_party_cards_trg` for that one INSERT and puts it back
immediately — every later write in the block and in blocks 17–21 is judged by the
live guard — and a new leg `16h` asserts the live refusal for the honest actor.
The block's subject is unchanged: the READ of that population is exactly what r7
MAJOR-1 was about, and it is the population the guard cannot repair.

---

## Verification

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2719 replayed statements
$ git diff --numstat -- supabase/seed/00-legacy-grants.sql
   (no output — no GRANT/REVOKE changed; all three edits are bodies and predicates)

$ pnpm --dir … supabase:reset      # pass 1
RESET1_EXIT=0    0 error lines    555 'Applying migration' lines
$ pnpm --dir … supabase:reset      # pass 2 (idempotence)
RESET2_EXIT=0    0 error lines    555 'Applying migration' lines
$ psql … -At -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
555|20260910152111
$ psql … -At -c "select string_agg(version,' ' order by version) … where version>='00590' …"
00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627
   # 00595–00620 untouched and reserved; nothing new minted — both files are
   # unapplied on Strata and were edited in place

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
w1a EXIT=0   49 passed lines   'All W1a assertions passed.'
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
w1b EXIT=0   21 passed lines   'All W1b assertions passed.'
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/people_directory_scope_test.sql
scope EXIT=0 12 passed lines   'All people_directory scope assertions passed.'
   # m10's third red file is now green, and it is green with (h3) RUNNING

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
   (no output — no signature and no column shape changed; people_directory is
    still 17 columns, the twelve prefix intact)
```

No portal file, hook, edge function or seed was touched, so no jest, vitest or
deno suite is in scope for this pass.

Probes, all under `artifacts/people-room-crm-2026-09-11/build/` (`git add -f`),
each with its `.out`, every one ending in `ROLLBACK`:
`probe187-w1b-fix-r11-major1-solo-designer.sql`,
`probe188-w1b-fix-r11-major2-directory-cost.sql`,
`probe189-w1b-fix-r11-major3-foreign-card-stamp.sql`,
`probe190-w1b-fix-r11-major2-residual-decomposition.sql`.
The ledger read `555 / 20260910152111` before the first probe and after the last.

## Still open after this round

The fifteen MINORs of r11 (m1–m15), untouched. Two rulings are owed to Fable and
Kody out of this pass:

* **M3's shape** — a flat refusal of `studio_contact_id` on a project that
  records no studio, and what that costs before R-BD's W3 backfill runs.
* **M2's residual** — ~2.6 ms per Directory row in the other per-row readers,
  which is 7.9 s at ~3 100 rows against an 8 s `statement_timeout`. Linear, not
  quadratic, and outside M2's claim; it will want its own pass before the room
  grows further.
