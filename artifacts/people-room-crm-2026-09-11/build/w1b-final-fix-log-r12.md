# W1b — final review round 12, fix log

Scope: exactly the two MAJORs of `w1b-final-review-r12-migrations.md` (M1, M2). Nothing else in
that round's 19 MINORs was touched. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **Nothing touched on Strata.** No new
migration minted — 00624 and 00626 are unapplied on prod and were edited in place; the ledger still
reads `00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627` and
`00595–00620` are untouched.

---

## M1 — 00624's `stage` backfill stamped `updated_at = now()` on every seat of every completed project

**Fixed in `supabase/migrations/00624_project_party_window_and_authority.sql`** (the backfill § and
the banner's `stage` bullet).

The statement is bracketed by the trigger it was firing:

```sql
ALTER TABLE public.project_parties DISABLE TRIGGER set_updated_at_project_parties;

UPDATE public.project_parties pp
   SET stage = CASE
                 WHEN COALESCE(pj.completed_at, pj.updated_at)
                        > now() - interval '12 months' THEN 'warranty'
                 ELSE 'off_job'
               END
  FROM public.projects pj
 WHERE pj.id = pp.project_id
   AND pj.status = 'completed'
   AND pp.stage = 'active';

ALTER TABLE public.project_parties ENABLE TRIGGER set_updated_at_project_parties;
```

The § above it states why `updated_at` is load-bearing (00626 §3's `DISTINCT ON … pp.updated_at
DESC, pp.id` and §4's `first_value()` window), that `SET … updated_at = pp.updated_at` cannot work
(`update_updated_at_column()` overwrites `NEW` after the SET list), that the statement is a 0-row
no-op on every local reset and only ever really runs at the deploy, and that **any future migration
rewriting a `project_parties` column in bulk owes the same two lines**.

The review's second option — re-ordering the party branch's `DISTINCT ON` by a fact about the work —
was **not** taken: it changes which seat wins for live data, and would have to change
`people_directory_seats`' `first_value()` window identically (r1 MAJOR-2). Bracketing leaves every
winner exactly where it is.

### Walked — `probe203-w1b-fix-r12-m1-backfill-updated-at.sql` (+ `.out`)

Two seats for one uncarded human keyed on `+16125559977`: the completed Lindqvist kitchen (400 days
quiet) and the active Okonkwo residence (10 days quiet), then the statement **both ways** in one
transaction, the control rolled back to a savepoint:

```
NOTICE:  BEFORE any backfill: person_id=…0002 project=Okonkwo residence last_touch_at=2026-09-02 23:12:16
NOTICE:  CONTROL (unbracketed, what r12 walked): person_id=…0001 project=Lindqvist kitchen last_touch_at=2026-09-12 23:12:16
NOTICE:  shipped backfill: the completed-job seat stage is now warranty (the stage DID move)
NOTICE:  AFTER the shipped backfill: person_id=…0002 project=Okonkwo residence last_touch_at=2026-09-02 23:12:16
```

The control reproduces r12's `probe201` exactly; the shipped form moves the stage and moves none of
`person_id`, `project_id`, `last_touch_at`.

### The suite leg the review said was owed

`supabase/tests/people/w1b_compliance_authority_directory_test.sql` **block 21**. It stages the two
seats itself (the review's point: a leg that runs after the seed cannot rely on the migration's own
execution, which touches 0 rows) and executes the statement both ways — the unbracketed form inside
a trapped sub-block that is rolled back, so the rest of the suite reads an untouched table. 21a–21e
assert: the live seat wins first; the unbracketed statement still flips the winner onto the closed
job (if it ever stops doing so, the tie-break has changed and 00624's brackets must be re-argued);
the bracketed form still moves the stage to `warranty`; and it moves neither `person_id`,
`project_id`, `last_touch_at` nor the seat's own `updated_at`.

---

## M2 — `party_identity_key()`'s COALESCE terminated at the stamp, so a carded human's unstamped seat was a second Directory identity

**Fixed in `supabase/migrations/00626_people_directory_v4_seats.sql` §1b** (new), plus the
`party_identity_key()` COMMENT and the banner's precedence bullet.

The finding offered two shapes and said the choice is a ruling. **Option 2 was taken — the
auto-link, on the record.** crm-model §4 rule 2 states the answer in its own words: an exact
`phone_e164` match is *"strong — auto-link within one studio"*, while rule 6 says the lineage stamp
is *"provenance only — never a merge key on its own."* Option 1 (a `LEFT JOIN studio_contacts` in
the party branch, the seats view and the `identity_seats` CTE) re-derives that link at every seam,
which is G-1's own complaint and PR-b's stated reason for the hybrid, and it would leave the record
still holding two halves of one human for every other reader — the party sheet, Patina Field, an
export. Keeping the link in the record also leaves `party_identity_key()` IMMUTABLE (it carries the
expression index), leaves all three R-BG predicates byte-identical, and costs the Directory nothing
at read time (r12 m17's ~2.6 ms/row is untouched).

What lands, in `00626` §1b:

* `idx_studio_contacts_org_phone_e164` — the lookup's index.
* `rolodex_card_for_party_phone(project_id, phone_e164)` — STABLE SECURITY DEFINER,
  `SET search_path TO 'public'`, returns the **one** `entity_kind='person'` card in
  `project_recorded_studio(project_id)` carrying exactly that number; NULL when there is none, when
  two cards share it (PR-o/R-Y's duplicate band is a card-to-card merge the studio rules on, not
  something a trigger decides) or when the project records no studio. `REVOKE ALL … FROM PUBLIC,
  anon, authenticated; GRANT EXECUTE … TO service_role` — deliberately **not** granted to
  `authenticated`, so r12 m13's uuid→fact oracle count does not grow; its only callers are the two
  definer trigger functions.
* `link_party_to_rolodex_card()` + trigger `apply_party_rolodex_link_trg`, BEFORE INSERT OR UPDATE
  OF `phone, phone_e164, studio_contact_id, project_id` on `project_parties`. The trigger name sorts
  **before** `assert_project_party_cards_trg`, so the stamp it writes is validated by the r11
  MAJOR-3 guard like any other; it derives the number with
  `normalize_phone_e164(COALESCE(NEW.phone, NEW.phone_e164))` because
  `normalize_phone_project_parties` fires later in name order.
* `link_rolodex_card_to_parties()` + trigger `link_rolodex_card_to_parties_trg`, AFTER INSERT OR
  UPDATE OF `phone, phone_e164` on `studio_contacts` — the mirror, for the ordinary sequence where
  the card is written the week after the inline add. It writes `studio_contact_id` only, on projects
  whose `projects.studio_id` IS the card's own organization, which is exactly what
  `assert_project_party_cards()` then accepts.
* A one-time backfill of the seats already on the table, bracketed against
  `set_updated_at_project_parties` for M1's reason.

No consent column is read or written anywhere in §1b — the number is an identity fact, and the
seat's consent word still comes from `studio_channel_consent` alone (R-AY / the brief's R-AW).

`packages/supabase/src/hooks/use-coordination.ts:400-407` — the `studioContactId` JSDoc said
*"Omit or null for an inline add with no rolodex link"*, which the auto-link makes untrue. The note
now says omitting it does not guarantee an unlinked row. Comment only; `pnpm --dir packages/supabase
type-check` EXIT=0.

### Walked — `probe204-w1b-fix-r12-m2-unstamped-seat.sql` (+ `.out`)

r12's `probe197`, re-run, plus the mirror and the ambiguity control:

```
NOTICE:  Dana card=d0e10000-0000-0000-0000-000000000011  phone=+16125550111
NOTICE:  BEFORE  person_id=d0e10000-…-0011 role=contact seats=2 consent=granted
NOTICE:  AFTER   person_id=d0e10000-…-0011 role=contact seats=3 consent=granted
NOTICE:  people_directory rows: 62 -> 62  (one human, one new seat)
NOTICE:  people_directory_seats rows for Dana: 3      (all three person_id=d0e10000-…-0011)
NOTICE:  RECORD: seats on Okonkwo carrying Dana's number AND her card stamp: 2
NOTICE:  RECORD: seats anywhere carrying Dana's number and NO stamp: 0
NOTICE:  MIRROR: the seat starts unstamped (studio_contact_id=<NULL>)
NOTICE:  MIRROR: card minted = 6fa111fa-…
NOTICE:  MIRROR: seats now carrying that card: 1
NOTICE:  MIRROR: people_directory rows for that human: 1
NOTICE:  AMBIGUITY: two cards share the number, so the seat stays unstamped: 1 of 1
```

r12 measured `62 -> 63`, one row claiming 2 seats and a second claiming 1 while the human held 3.
It is now `62 -> 62`, one row, 3 claimed and 3 nested.

### Walked — `probe205-w1b-fix-r12-m2-boundaries.sql` (+ `.out`)

```
NOTICE:  CROSS-TENANT: a card of another studio stamped nothing (unstamped seats = 1 of 1)
NOTICE:  CROSS-TENANT: hand-written foreign stamp still refused: party_studio_contact_other_studio
NOTICE:  R-AX: seats on Pete's number now carrying his card: 3
NOTICE:  R-AY: the RECORD still decides, and it still says: opted_out
NOTICE:  R-AX CONTROL: an opted_out seat's number is still frozen: consent_opted_out_phone_frozen
```

### Suite leg

Block **22** of the W1b suite: the shipped inline add on Dana's own number leaves `people_directory`
at the same row count, her one row claiming 3 and nesting 3, and **no** seat anywhere carrying her
number without her stamp; a card minted after the seat claims it and the human holds one Directory
row; and none of an ambiguous number, a firm's main line, or a job that records no studio stamps
anything (the last is why the auto-link can never collide with r11 MAJOR-3's
`party_card_project_has_no_studio` refusal).

---

## Verification

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2723 replayed statements   (was 2719)

$ pnpm --dir …/agent-people-build supabase:reset      # pass 1
RESET1_EXIT=0   0 error lines   555 "Applying migration"
$ pnpm --dir …/agent-people-build supabase:reset      # pass 2 (idempotence)
RESET2_EXIT=0   0 error lines   555 "Applying migration"   30 "Seeding data"

$ psql … -At -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
555|20260910152111
$ psql … -At -c "select string_agg(version,' ' order by version) … where version>='00590' …"
00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
EXIT=0  passed=49
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
EXIT=0  passed=23        (21 blocks + the two new ones; was 21)
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/people_directory_scope_test.sql
EXIT=0  passed=12

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0 — the only diff is the new function's signature:
+      rolodex_card_for_party_phone: { Args: { p_phone_e164: string; p_project_id: string }; Returns: string }

$ pnpm --dir …/packages/supabase type-check
TC_EXIT=0
```

**Full SQL sweep, every `supabase/tests/**/*_test.sql` on the twice-reset database: 30 red, the same
30 as r12's baseline, failing for the same reasons** (`rls/field_parties_test.sql` →
`consent_legacy_column_frozen`; `field/project_task_field_capture_ref_test.sql` → `FAIL 4b`;
`capture_enrichment/target_type_visibility_test.sql` → `FAIL c2`;
`site_requests/security_and_lifecycle_test.sql` → `send must transition not_asked consent to
pending`). **No suite went red that was green before.** r12's m10 (the unlisted reds) is untouched
and still open.

`git status --porcelain` under `supabase/`, `packages/`, `apps/` shows exactly the six intended
files.

---

## Recorded, not fixed (out of the two findings' scope)

* **`refuse_legacy_consent_write()`'s phone clause keys on the FROZEN seat column.** `probe205`:
  Pete Rusk's seeded seat carries `sms_consent_status = 'not_asked'` while the record for
  `+16125550112` says `opted_out`, so `UPDATE … SET phone_e164` on that seat **lands**, where R-AX's
  sentence ("an `opted_out` seat's phone_e164 cannot move") reads as though it would not. The
  control in the same probe shows the clause still fires on a seat whose frozen column does say
  `opted_out`. Nothing in this fix touches either side; it is R-AX's shape meeting R-AY's frozen
  column and it is Fable's to rule on, not this round's.
* The 19 MINORs of r12 are untouched by design.
