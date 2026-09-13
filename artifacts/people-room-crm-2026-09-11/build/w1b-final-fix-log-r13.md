# W1b — final review round 13, fix log

Scope: exactly the two MAJORs of `w1b-final-review-r13-migrations.md`. None of that round's 28 MINORs
was touched. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **Nothing touched on Strata.** No new
migration minted — 00624 and 00626 are unapplied on prod and were edited in place; the ledger still reads
`00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627 20260910152111` and `00595–00620`
are untouched. No GRANT or REVOKE changed, so `scripts/generate-legacy-grants.py` reproduces byte-for-byte
(baseline + 2723 replayed statements, unchanged from r12).

---

## MAJOR-1 — the studio-less population's duplicate identity: **RULED (R-BI), not patched**

The finding offered two closes and said the second is a ruling. **The ruling was taken**, and Fable has since recorded it as **R-BI** in `rulings.md` §3, for the reason the
finding itself names: the first close puts a caller-relative studio inside the identity key.

`rolodex_card_for_party_phone()` resolves `project_recorded_studio(project_id)`, which is NULL wherever
`projects.studio_id` is. Letting it fall back to `project_tenant_org()` "for the link only", and teaching
`assert_project_party_cards()`' `studio_contact_id` leg to accept a card in that resolver on that
population, would make `studio_contact_id` — durable record state, and the v4 identity key — a function of
**whoever typed the row**. That is precisely the door r11 MAJOR-3 walked and closed: a plain member of the
designer of record's *second* design studio filed a card in their own rolodex and landed it as
`studio_contact_id` on the working studio's job, which then read a seat whose `person_id` it could open no
Directory row for. Reopening a graded finding to close a lesser one is not a trade this wave may make, and
R-BD already classifies `studio_id IS NULL` as a legacy population W3 backfills.

So the sentence is written where the review asked for it, in four places:

1. **`00626_people_directory_v4_seats.sql` §1b**, beside the resolver (the passage the review cited at
   `:346-349`): a new paragraph *"AND THAT POPULATION THEREFORE KEEPS THE DUPLICATE IDENTITY UNTIL W3'S
   BACKFILL — ruled, not overlooked"*, carrying the walk (62 → 63, `opted_out · seat_count 2` beside
   `not_asked · not_on_file` on `+16125550112`), the explanation of the second word
   (`project_consent_org()`'s R-AK posture, which 00624's banner under R-BD deliberately keeps for the
   consent LEDGER), the refused fix and why, and the note that the send gate refuses on the verdict before
   the `sms_optin_invite` carve-out (`_shared/sms.ts:725-731`).
2. **`rolodex_card_for_party_phone()`'s COMMENT** — the NULL-on-a-studio-less-project clause now says that
   population keeps the duplicate identity until R-BD's W3 backfill, and that a caller-relative fallback is
   refused.
3. **`00624`'s preflight block** (the one that already carries R-BD's count and the stamped-seat count) — a
   third SELECT, and the reason it is the count of studio-less projects **that carry seats** rather than of
   studio-less projects.
4. **`build/w1b-report.md` §8** — a new "Ruled, and owed to the deploy brief" subsection with both.

### Walked — `probe209-w1b-fix-r13-m1-studioless-ruled-residue.sql` (+ `.out`)

```
--- 1. the deploy brief's two counts, run locally ---
 studioless_projects                     5
 studioless_projects_carrying_seats      0
 stamped_seats_off_their_project_studio  0

--- 2. BEFORE ---                                     directory_rows  62
 d0e10000-…-0012 | contact | Pete Rusk | 2 | opted_out | current

--- 4. AFTER: the RULED residue — two rows, and never the affirmative word ---
 d0e10000-…-0012 | contact | Pete Rusk | 2 | opted_out | current     |
 261926d5-…      | sub     | Pete Rusk | 1 | not_asked | not_on_file | b0000000-…-00d1
                                                      directory_rows  63
 pete_rows_reading_granted                0

--- 5. the record the send gate asks, at the studio doing the work ---
 word_at_working_studio  opted_out | word_at_guessed_studio  <NULL>
```

The residue is exactly what r13 measured, unchanged and now stated. The bound that matters is the last two
rows: the duplicate never prints the affirmative word, and the record the send rail asks still says
`opted_out`.

### Suite leg — block **23c–23e**

The inline add on the studio-less job comes back **unstamped** (23c), Pete holds **two** Directory rows
(23d — the ruled residue, so a future change that closes it has to face this assertion and the ruling
behind it), and **no** row of his reads `granted` (23d/23e). If the W3 backfill lands, 23d is the line that
says so.

---

## MAJOR-2 — the auto-linked seat's paper word (R-BJ)

**Fixed in `supabase/migrations/00626_people_directory_v4_seats.sql`**, `people_directory_seats` — the one
line the finding prescribed, plus the § above it and the view COMMENT.

```sql
  public.identity_paper_state(
    pp.studio_contact_id,
    COALESCE(pp.company_id, sc.company_id))                      AS paper_state,
…
FROM public.project_parties pp
JOIN public.projects pj ON pj.id = pp.project_id
LEFT JOIN public.studio_contacts sc ON sc.id = pp.studio_contact_id
```

The seat's own firm when the seat names one — crm-model §5's *"open engagements keep the old
`company_id`"* stays intact — the stamped card's otherwise, which is every seat the §1b auto-link claims,
because no portal writer sets `project_parties.company_id`: `useAddProjectParty`
(`use-coordination.ts:500-512`) writes `company_name` as free TEXT. `identity_paper_state()` already
de-duplicates when the two ids match (`00626`'s § on the function), so a sole proprietor whose card *is*
the firm is counted once.

Three properties, stated in the § beside the line so they are not re-derived later: the join is on the
primary key, so it cannot multiply a row or move `first_value()`'s winner; the view is
`security_invoker`, so `sc` obeys the caller's own `studio_contacts` RLS and a caller who cannot read the
card falls back to `pp.company_id`, which is exactly today's answer; and therefore the join can only ADD a
firm's word to the worst-first reduction, never remove one.

### Walked — `probe208-w1b-fix-r13-m2-seat-paper-word.sql` (+ `.out`)

probe207 re-run unchanged, then the OLD expression computed beside the shipped one on the very same rows as
the negative control:

```
--- 1. the record ---
 Dana Kowalski | company d0e20000-…-0003 | her_own_paper not_on_file | her_firm_paper lapsed | identity lapsed

--- 2. the shipped inline add on her own number, no rolodex pick ---
 6ea292ef-… | studio_contact_id d0e10000-…-0011 | company_id <NULL> | company_name 'Northgate Electric'

--- 3. the identity row, and every seat line beneath it (AFTER the fix) ---
 Dana Kowalski | seat_count 3 | row_paper lapsed
 Lindqvist kitchen | stamped t | seat_has_company t | lapsed
 Okonkwo residence | stamped t | seat_has_company f | lapsed   ← the new seat (was not_on_file)
 Okonkwo residence | stamped t | seat_has_company t | lapsed

--- 4. NEGATIVE CONTROL: the OLD expression on the same rows ---
 Lindqvist kitchen | t | old_word lapsed      | shipped_word lapsed
 Okonkwo residence | f | old_word not_on_file | shipped_word lapsed
 Okonkwo residence | t | old_word lapsed      | shipped_word lapsed

--- 5. crm-model §5: a seat that names its OWN firm keeps that firm's word ---
 Okonkwo residence | seat_has_company t | seat_paper not_on_file | row_paper lapsed
```

Line 4 is the control the fix has to beat: the old formula still reads `not_on_file` on the seat whose
identity row reads `lapsed` off Northgate Electric's COI expired 2026-03-31 (F-11, gating `site_access` and
`draw`). Line 5 is the leg that keeps crm-model §5: point the seat at its own paperless firm and the seat
line says `not_on_file` while the row still says `lapsed` — the COALESCE is the seat's firm FIRST, not the
card's.

PR-h ("Both, one source") and direction §2.2 are satisfied: the roster row's held clause and the Directory
row now read the same record.

### Suite leg — block **23a–23b**

New block 23 in `supabase/tests/people/w1b_compliance_authority_directory_test.sql`. It asserts the fixture
precondition first (Dana reads `lapsed` as an identity and `not_on_file` on her own card, so the block
cannot pass by accident on a fixture that lost F-11), then: the shipped inline add's own seat line equals
her Directory row's word and both are `lapsed` (23a — this is the assertion that fails on the old
expression, per probe208 line 4); and a seat naming its own paperless firm reads `not_on_file` under a row
still reading `lapsed` (23b).

---

## Verification

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2723 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
   (no diff — no GRANT or REVOKE changed this round)

$ pnpm --dir …/agent-people-build supabase:reset
RESET1_EXIT=0    555 "Applying migration"    0 error lines
$ psql … -At -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
555|20260910152111
$ psql … -At -c "select string_agg(version,' ' order by version) … where version >= '00590';"
00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627 20260910152111

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0   24 NOTICE lines = 23 blocks + "All W1b assertions passed."   (was 23 = 22 + 1)
NOTICE:  23. the auto-linked seat prints the identity's paper word — lapsed under a row reading lapsed,
         where it read not_on_file (r13 MAJOR-2) — a seat naming its own firm still keeps that firm's word,
         and the studio-less population's second identity is the RULED residue of r13 MAJOR-1: two rows
         until R-BD's W3 backfill, and never the affirmative consent word: passed

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0   49 NOTICE lines     (unchanged)
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/people_directory_scope_test.sql
RLS_EXIT=0   12 NOTICE lines     (unchanged)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
   (no diff — the fix changes an expression, not a column)
```

**Full SQL sweep, every `supabase/tests/**/*_test.sql` on the reset database: `TOTAL=166 RED=30` — the same
30 as r12's baseline, failing for the same pre-existing reasons** (`rls/field_parties_test.sql` →
`consent_legacy_column_frozen`; `field/project_task_field_capture_ref_test.sql` → `FAIL 4b`;
`capture_enrichment/target_type_visibility_test.sql` → `FAIL c2`;
`site_requests/security_and_lifecycle_test.sql` → the `not_asked → pending` transition). **No suite went red
that was green before.**

No TypeScript, portal or edge file was touched this round.

---

## Recorded, not fixed (outside the two findings)

* The 28 MINORs of r13 are untouched by design.
* MAJOR-1's *second* word — the studio-less duplicate printing `not_asked` where the working studio's record
  says `opted_out` — is `project_consent_org()`'s pre-existing posture under R-AK, which 00624's banner
  keeps on purpose for the consent ledger ("a record's studio must read the same for every reader; a GATE
  may not guess") and which R-BD's owed Strata count already gates. Repointing the consent word at
  `project_tenant_org()` would make the printed word caller-relative and is a ruling for Fable, not a fix
  this round may take.
