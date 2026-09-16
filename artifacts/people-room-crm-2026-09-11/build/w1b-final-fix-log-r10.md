# W1b — final review round 10, fix log

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). Nothing touched on
Strata. No `.env.local` exists in this worktree and there is no
`supabase/.temp/project-ref`, so `supabase db reset` is unambiguously local.

Scope: exactly three findings — `w1b-final-review-r10-migrations.md` MAJOR-1 and
MAJOR-2, and `w1b-final-review-r10-tests.md` Finding 2 (F-12 Pete Rusk) — under
every ruling in `rulings.md` §3. **R-AW / R-AY held throughout**: not one object
in these edits reads a seat for consent, and no `sms_consent_*` column appears
anywhere in the diff (`git diff … | grep '^+' | grep -i sms_consent` → nothing).

The thirteen MINORs of the migrations round and Findings 1/3 of the tests round
are **not** in this pass and are untouched.

Both migrations are unapplied on Strata, so both fixes are edits in place
(migrations skill, step 8). No GRANT or REVOKE changed — `CREATE OR REPLACE`
preserves both functions' existing grants and their `REVOKE … FROM PUBLIC, anon`
lines are unedited — and `generate-legacy-grants.py` was re-run anyway and
produced no diff.

---

## M1 (MAJOR) — the read-side supersede reckoning is now TRANSITIVE, not one hop

`supabase/migrations/00623_studio_compliance_documents.sql` — `compliance_state()`.

r9 moved the reckoning into the reader, correctly, but asked only about the row's
**immediate** successor. A certificate is renewed every year, so the ordinary
steady state of a firm a studio keeps two years is a chain — A retired by B, then
B retired by C — and all four writes pass all ten guards. The day B's own
certificate expires, A's immediate successor is no longer in force, A re-enters
the count, and the card reads `lapsed` while C, an in-force non-superseded gating
`coi_gl`, is on file. It arrives **from the calendar alone**, so there is no write,
no audit line and no act to point at.

The `WHERE` clause is now a `WITH RECURSIVE` walk: a row leaves the count while
**any reachable** successor is in force and carries the **root's** gates.

```sql
  WITH RECURSIVE chain(root, root_blocks, succ, depth) AS (
    SELECT d.id, d.blocks, d.superseded_by, 0
      FROM public.studio_compliance_documents d
     WHERE d.holder_id = p_holder_id
       AND d.superseded_by IS NOT NULL
    UNION ALL
    SELECT c.root, c.root_blocks, s.superseded_by, c.depth + 1
      FROM chain c
      JOIN public.studio_compliance_documents s ON s.id = c.succ
     WHERE c.depth < 64
  ),
  retired AS (
    SELECT DISTINCT c.root
      FROM chain c
      JOIN public.studio_compliance_documents s ON s.id = c.succ
     WHERE (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
       AND c.root_blocks <@ s.blocks
  )
  … WHERE d.holder_id = p_holder_id
      AND (d.superseded_by IS NULL OR d.id NOT IN (SELECT root FROM retired));
```

The head-of-chain write guard (`compliance_successor_already_superseded`,
00623:396-405) keeps `superseded_by` acyclic so the recursion terminates on its
own; `depth < 64` caps a chain written before that guard existed. The banner
gains an r10 MAJOR-1 lineage entry, the block comment above the function states
the rule, and the `COMMENT ON FUNCTION` carries it.

### Walk + negative control (`probe168-w1b-fix-r10-major1-negative-control.sql`)

Four honest writes as `a0000000-…-0003`, a plain **admin** of the owning studio,
then nothing but the calendar. The r9 one-hop body is restored **in the same
transaction, over the same rows**, as the control. Everything ROLLBACKs.

```
NOTICE:  seeded word: lapsed
NOTICE:  chain A->B->C, today          shipped=current
NOTICE:  B has lapsed, C in force      shipped=current
NOTICE:    in-force non-superseded gating coi_gl on file: 1
NOTICE:    Dana Kowalski Directory paper word: current
NOTICE:  head of chain gutted          shipped=lapsed
NOTICE:  SAME ROWS, r9 ONE-HOP body    shipped=lapsed  <-- the defect
NOTICE:    Dana Kowalski Directory paper word: lapsed
ROLLBACK
```

`head of chain gutted → lapsed` is the proof the walk stays **conditional** and
is not a refusal to forget.

### Suite leg — beside block 19

`supabase/tests/people/w1b_compliance_authority_directory_test.sql`, assertions
`19n`–`19u`, appended to block 19 after its existing fixture unwinds. The chain
A→B→C is built with four honest writes; then `current` today (`19n`), the middle
certificate is aged past with **nothing written to A or C** and the word must
still be `current` (`19r`), Dana Kowalski's Directory row must follow (`19s`),
and gutting the head of the chain must bring every root behind it back (`19t`).
`19p` states the premise rather than assuming it: it evaluates the **one-hop**
predicate inline and fails the block if that formula would *not* have re-admitted
a lapse here, so the leg cannot silently stop testing anything. `19q` pins that
the record says cover is on file (exactly one in-force, non-superseded, gating
`coi_gl`). `19u` unwinds.

---

## M2 (MAJOR) — `identity_seat_count()` carries the seats view's own gate

`supabase/migrations/00626_people_directory_v4_seats.sql` — `identity_seat_count()`.

The counter scanned `project_parties` under RLS alone — `is_studio_comember(designer)`,
true whenever the caller shares **any** active organization with the designer of
record — while `people_directory_seats` (`:1566`) and the Directory's own party
branch additionally require
`is_active_studio_member(project_tenant_org(project_id))` beside the three
co-member legs. Two different sets, so §4's promise that *"no Directory row ever
claims a seat_count it cannot nest"* broke with **no** cross-tenant stamp and
**no** adversarial write.

The counter now carries the seats view's `WHERE` clause verbatim — the tenant leg
**and** the three co-member legs — so "this identity's seats" keeps one definition:

```sql
    FROM public.project_parties pp
    JOIN public.projects pj ON pj.id = pp.project_id
   WHERE p_identity_key IS NOT NULL
     AND public.is_active_studio_member(public.project_tenant_org(pp.project_id))
     AND ( public.is_studio_comember(pj.designer_id)
        OR public.is_studio_comember(pj.lead_designer_id)
        OR public.is_studio_comember(pj.created_by) )
     AND public.party_identity_key(…) = p_identity_key;
```

The three co-member legs are carried beside the tenant leg deliberately: RLS also
admits a row through `projects.studio_id` alone, so the tenant leg on its own
leaves a residue where the designer of record shares no org with the caller. The
review named the tenant leg; the stated goal was *"computed over exactly the set
that nests"*, and the seats view's whole predicate is what delivers that.
Banner and `COMMENT ON FUNCTION` both record it.

### Walk + negative control (`probe169-w1b-fix-r10-major2-negative-control.sql`)

probe162's fixture, rebuilt on the reseeded shape (the Leah Hartwell org id is
resolved by name because the seed re-mints it): Leah Hartwell — the designer of
record's second design studio — takes over the Aspen job, and one uncarded human
takes a seat on a job of each studio with one number. Reader is
`a0000000-…-0003`, admin of Local Dev Studio and a member of nothing else. The
pre-fix RLS-only body is then restored in the same transaction as the control.

```
NOTICE:  LDS admin is a member of Leah Hartwell? f
NOTICE:  seats the caller reads on project_parties directly: 2  (not a read door)
NOTICE:  ONE-STUDIO caller  claims=1  nests=1   <-- must be equal
NOTICE:  CONTROL both studios  claims=2  nests=2
NOTICE:  SAME ROWS, pre-fix body: ONE-STUDIO caller claims=2 nests=1  <-- the defect
NOTICE:    Directory rows claiming a count they cannot nest: 1
ROLLBACK
```

`seats the caller reads on project_parties directly: 2` is kept in the probe on
purpose: this was never a read door, and r6 MAJOR-2's recorded ruling that this
view is not the door is unchanged.

**No regression on the shipped fixture** (`probe170`, third leg): of the 50 keyed
Directory rows on the untouched seed, **0** differ between the fixed body and the
pre-fix RLS-only count.

### Suite leg — block 4, staged BEFORE the whole-fixture invariant

Assertions `4o`–`4x`. A second design studio (`Test Studio C`) of the **same**
designer of record is created, holding one job; one shared identity takes a seat
on it and a seat on Test Studio A's job. The one-studio caller `a0000000-…-0003`
is asserted to be a member of Test Studio A and **not** of Test Studio C (`4o`,
`4p`), and a co-member of the shared designer (`4q`) — without which RLS hides
the second seat and there is nothing to diverge. `4r` pins that RLS shows that
caller **both** party rows, so the leg measures the disagreement and not
visibility. `4s`/`4u` assert nests = 1 and claims = 1; `4v`/`4w` are the
both-studios control at 2 and 2. The block's existing whole-fixture invariant
(`4k`) now runs over data that can break it, and `4x` re-runs it as the
one-studio caller. The fixture is unwound at the end of the block so blocks 13
and 17 build the only second studios their own legs know about.

Two incidentals found while wiring this leg, both fixed in the test:
`f4000000-…-000141/142` were already taken by block 4's own earlier fixture (the
new seats are `…151/152`), and the Studio C membership is recorded as `admin`
rather than `owner` because 00484's `last_owner_protected` guard refuses the
teardown DELETE of a sole active owner.

---

## F2 (MAJOR, tests) — F-12 Pete Rusk's field link is in the seed

`supabase/seed/people_crm_dev.sql` — the `create_field_link` loop.

`crm-model.md:241` lists F-12 in the field-link reach tier and `:262` gives his
access matrix as *"Phone, Field link by another channel"*; `briefing/fixture.md:39`'s
"Patina reach today" column says `field link`. His Okonkwo seat
(`d0e30000-…-000012`) was missing from the loop, so `people_directory.reach_state`
read `on_paper` — the word for someone Patina has never tried to reach at all —
and the seed taught the opposite of the design: that an opted-out **number**
degrades a party's reach **mechanism**. The two are separate axes (PR-e).

One line added, mirroring F-11's, plus a comment stating the reason and the
window arithmetic. Live read after a fresh reset (`probe170`):

```
NOTICE:    Dana Kowalski  | contact  | reach=field_link | consent=granted    | paper=lapsed
NOTICE:    Erin Sato      | contact  | reach=field_link | consent=granted    | paper=current
NOTICE:    Joe Wozniak    | contact  | reach=field_link | consent=pending    | paper=current
NOTICE:    Pete Rusk      | contact  | reach=field_link | consent=opted_out  | paper=current
NOTICE:  active, unexpired field links on Pete Rusk's Okonkwo seat: 1
NOTICE:    its expiry (his window ends 2027-05-31, PR-d): 2027-06-01
NOTICE:  seats of Pete Rusk reading field_link: 1
```

The expiry is the engagement window's, not a 90-day clock — PR-d, unchanged.
Active field links in the seed: **6 → 7**.

### Suite leg — block 12

Assertions `12c2` and `12c3`, directly beneath the existing `12b`/`12c` consent
legs, so the refusal and the reach word are asserted side by side and the
"consent does not move reach" rule is visible in the file. Block 12's NOTICE now
names it.

---

## Verification

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2719 replayed statements
$ git diff --numstat -- supabase/seed/00-legacy-grants.sql
   (no output — no GRANT/REVOKE changed)

$ pnpm --dir … supabase:reset          # pass 1
RESET1_EXIT=0     no /^error/ or /error:/ lines
$ pnpm --dir … supabase:reset          # pass 2 (idempotence)
RESET2_EXIT=0     no /^error/ or /error:/ lines
$ psql … -At -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
555|20260910152111
$ psql … -At -c "select string_agg(version,' ' order by version) … where version>='00620' …"
00621 00622 00623 00624 00625 00626 00627        # 00595–00620 untouched

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0    49 'passed' lines, then 'All W1a assertions passed.'
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0    20 numbered blocks, then 'All W1b assertions passed.'

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
   (no output — no schema shape changed; both edits are function bodies)

$ pnpm --dir … --filter @patina/supabase        type-check   → SUPABASE_TC=0
$ pnpm --dir … --filter @patina/designer-portal type-check   → DESIGNER_TC=0
```

No edge function, portal route or hook was touched, so no deno or jest suite is
in scope for this pass.

Block-19 and block-12 NOTICEs after the second reset:

```
19. … And the reckoning is TRANSITIVE, not one hop: the ordinary second renewal
    A->B->C reads current today and still current the day the middle
    certificate's own date has passed — where a one-hop rule re-admitted the
    2026-03-31 lapse from the calendar alone — while gutting the head of the
    chain still brings every root behind it back (r10 MAJOR-1): passed
12. … Pete's Lindqvist refusal answering on Okonkwo while his REACH still reads
    field_link (r10 tests F2) … : passed
 4. … a shared identity seated on a job of each of TWO design studios that
    merely share a designer of record claims exactly the one seat the
    one-studio caller can nest while the both-studios caller claims and nests
    both (r10 MAJOR-2), and no row anywhere claims a count it cannot nest, for
    either caller: passed
```

Probes: `probe168-w1b-fix-r10-major1-negative-control.sql`,
`probe169-w1b-fix-r10-major2-negative-control.sql`,
`probe170-w1b-fix-r10-f2-and-seed-sweep.sql`, each with its `.out`. Every probe
ends in `ROLLBACK`; the ledger is unchanged at `555 / 20260910152111`.
