# W1b — final review, round 12 (migrations)

Adversarial review of `build/w1b-report.md` and the five migrations it names, read in full, against
`rulings.md` §3 (R-A … R-BH, **all settled and not findings**), `synthesis/direction.md` §2.2/§3.8/§7/§8,
`synthesis/crm-model.md` §1/§2/§4/§5, `briefing/current-state.md` §B–§E, `build/inventory.md`,
`briefing/fixture.md`, `build/w1a-report.md`, `build/w1a-close-review-r6-migrations.md` / `-tests.md`,
and the prior round (`w1b-final-review-r11-migrations.md` + `w1b-final-fix-log-r11.md`).

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11` (HEAD `7b4707d8e`). Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **Nothing touched on Strata.**

**Verdict: NOT clean — 0 BLOCKING, 2 MAJOR, 19 MINOR.**

r11's three MAJORs are all **FIXED**, re-walked here with my own probes and controls. The two new MAJORs
are both reachable through the shipped write paths and neither was reachable by any prior round's method:

* **M1** is a side effect of 00624's own `stage` backfill on a column two readers rank by. It is
  **unreachable on any local reset** — the backfill runs at migration time, when `project_parties` is
  empty, so every suite, every probe and eleven rounds have measured a statement that touched 0 rows.
  Its only real execution is the Strata deploy.
* **M2** is `party_identity_key()`'s COALESCE never falling through the stamp to the exact E.164, so the
  ordinary inline "add to the roster" puts a carded human on the feed a second time. Measured: 62 → 63
  rows for one human and one INSERT.

---

## 0. What I ran, and what it said

### Environment — the reset is unambiguously local

```
$ ls -la .../agent-people-build/apps/designer-portal/.env.local
"…/apps/designer-portal/.env.local": No such file or directory (os error 2)
$ grep -n "project_id\|port" supabase/config.toml | head
5:project_id = "supabase"
10:port = 54321
$ ls supabase/.temp/
cli-latest  start-secrets            # no project-ref
```

### Grants regenerated, then reset twice

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2719 replayed statements
$ git -C . diff --numstat -- supabase/seed/00-legacy-grants.sql
   (no output — the committed seed already matches the migrations' GRANT/REVOKEs)

$ pnpm --dir …/agent-people-build supabase:reset          # pass 1
RESET1_EXIT=0
$ grep -icE '^error|error:' reset1.log   → 0
$ grep -c "Applying migration" reset1.log → 555
$ grep "Seeding data" reset1.log | wc -l  → 30      (people_crm_dev.sql among them)
   # the only /error/i line in the whole run is a migration FILENAME:
   # "Applying migration 00458_sms_message_error_capture.sql..."

$ pnpm --dir …/agent-people-build supabase:reset          # pass 2 (idempotence)
RESET2_EXIT=0    0 error lines    555 "Applying migration" lines

$ psql … -At -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
555|20260910152111
$ psql … -At -c "select string_agg(version,' ' order by version) … where version>='00590' …"
00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627
   # 00595–00620 untouched and reserved; nothing new minted
```

r11's m15 (a half-built database for ~20 s after "Finished") did **not** reproduce this round: the
ledger read `555 | 20260910152111` on the first poll after both resets.

### The three suites, after each reset

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
EXIT=0  passed=49   … 'All W1a assertions passed.'
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
EXIT=0  passed=21   … 'All W1b assertions passed.'
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/people_directory_scope_test.sql
EXIT=0  passed=12   … 'All people_directory scope assertions passed.'
   (identical after reset pass 2 — the seed replays: 36 compliance documents,
    11 authority grants, 1 site access card, 7 consent records)
```

`people_directory_scope_test.sql` is **green with case (h) RUNNING**, which is r11 MAJOR-1's own gate.

### Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git -C . diff --numstat -- packages/supabase/src/database.types.ts
   (no output — the committed types already match the local schema)
$ git -C . status --porcelain -- supabase/ packages/ apps/
   (no output)
```

### Catalog posture of all 26 new / edited routines

Every SECURITY DEFINER pins `search_path=public` (or `public, extensions, pg_temp` for the two
`create_field_link` arities, which need `extensions`); the two IMMUTABLE pure functions
(`party_identity_key`, `party_kind_in_directory`) omit it deliberately. **No `PUBLIC` and no `anon`
on any of the 26.** The four `assert_*` trigger functions are `postgres`/`service_role` only.
`people_directory` column order: `1 person_id … 12 scope` intact, `13 reach_state · 14 consent_status ·
15 paper_state · 16 contact_rule_summary · 17 seat_count` appended.

### Cross-tenant sweep, five callers (`probe196`)

```
                              compliance  authority  site cards  seats  directory  v_access_grants
 designer@patina.dev  (LDS owner)      36        11           1     31         62  13
 studio_manager@…     (LDS admin)      36        11           1     31         62  13
 cf-phase1-alice@…    (other studio)    0         0           0      0          0   1 (own studio_member)
 client@patina.dev    (a client)        0         0           0      0          0   0
 admin@patina.dev     (no org at all)   0         0           0      0          1   1
```

and a plain member of **Leah Hartwell**, the designer of record's SECOND design studio, never a member
of Local Dev Studio (`probe195`, `probe198`):

```
Z people_directory role=client count=6 · role=lead count=5   (r6 MAJOR-2's recorded posture)
Z reads compliance docs: 0 · authority grants: 0 · site access cards: 0 · directory seats: 0
Z: raw field_link_tokens (shipped RLS) = 7   v_access_grants field_link = 7   ← identical, m3
Z: access_grants_trade_rfq()=0  _plan_transmittals()=0  _invoice_links()=0  _trade_agreement_links()=0
Z: identity_phone_numbers(LDS, Dana's card) = 0 numbers
```

**No cross-tenant read of any object this wave adds.**

### Reader-vs-record sweep, all five callers (`probe196`)

```
contact rows losing a recorded refusal on the CARD number: 0
seat lines disagreeing with the record: 0
paper words disagreeing with identity_paper_state: 0
rows claiming a seat_count they cannot nest: 0
contacts rows where the CTE and identity_seat_count() disagree: 0
```

### The BLOCKING class, checked because the rubric turns on it

`Pete Rusk +16125550112 → channel_consent_status = opted_out`. Three DB functions reach `sms-dispatch`:

```
 proname                      | reads_record | reads_frozen
 fc_dispatch_court_assignment | t            | f
 fc_dispatch_optin_invite     | f            | t
 fc_dispatch_task_assignment  | t            | f
```

`fc_dispatch_optin_invite` carries no consent-record check and `refuse_legacy_consent_write_trg` is
`BEFORE **UPDATE** OF`, so a raw PostgREST INSERT of a seat at `sms_consent_status='pending'` with
complete evidence *does* fire it. It is not a send door: `_shared/sms.ts:724-731` asks
`channelConsentVerdict()` **before** the `isInvite` branch and returns `{sent:false, reason:"opted_out"}`
on `refuse`, so even the double-opt-in invite cannot reach a refused number. Fail-closed. **No BLOCKING.**

00624's `stage` backfill fires `fc_optin_invite_dispatch` (AFTER INSERT OR UPDATE, every column) on
every seat it touches; the body's `TG_OP='UPDATE'` guard makes it inert for a `stage`-only write
(OLD and NEW carry identical consent columns). **No migration-time send.** See M1 for the *other*
thing that backfill does.

### Re-check of every r11 finding

| r11 finding | Status | Evidence |
|---|---|---|
| **M1 MAJOR** — a designer belonging to no design studio lost every party row | **FIXED** | `00626:423-426` (counter), `:1079-1082` (CTE), `:1410-1413` (party branch), `:1763-1766` (seats view) all carry the same four-disjunct tenant leg; `tests/rls/people_directory_scope_test.sql` is EXIT=0 with case (h3) running |
| **M2 MAJOR** — `identity_seat_count()` once per Directory row, 8 s timeout at 649 cards | **FIXED as a blow-up; residual recorded — see m17** | `00626:1072-1087` is the `MATERIALIZED identity_seats` CTE; `probe191`: the curve is linear (0.10 s @ 62 rows → 3.16 s @ 1262 → 8.37 s @ 3262), the ≥600/≥600 gate returns 1262 rows in 3.16 s |
| **M3 MAJOR** — a foreign rolodex card stamped on a studio-less job | **FIXED** | `00624:640-672`; `probe194`: `A1 refused: party_card_project_has_no_studio`, `A2/A3 refused: party_studio_contact_other_studio`, `A4 company_id … LANDED` (r7's posture kept) |
| m1 `project_review` reports `revoked_by` as `granted_by` | **OPEN** | `00627:491` |
| m2 the 00627 banner's grant premise is false | **OPEN** | column-privilege dump below |
| m3 `v_access_grants`' invoker branches | **OPEN** | `probe198`: 7 `field_link` rows for Z, identical to the shipped door |
| m4 `evidence_upload` tier unreachable | **OPEN** | `00627:459-478`; 0 rows for the studio owner |
| m5 rule clause is the winning seat's | **OPEN** | now `00626:1301` |
| m6 all firm rows carry a consent word | **OPEN** | `probe199`: company rows=21, of which carrying a consent word=21 |
| m7 no `REVOKE … FROM anon` on `people_directory` | **OPEN** | `00626:1638`; `has_table_privilege('anon',…,'SELECT')=true`, `'INSERT'=true` |
| m8 two portal writers of the frozen columns | **OPEN** | `use-coordination.ts:715`, `:884` |
| m9 `blocks` freely member-editable, no audit | **OPEN and wider — the DELETE door too** | `probe202` |
| m10 red SQL suites | **OPEN — nine unlisted, not six** | full run below |
| m11 no pass over existing `studio_contact_id` stamps | **OPEN** | `00624:718-733` is the preflight SELECT as a COMMENT; nothing runs it |
| m12 `w1b-report.md` has drifted | **OPEN and wider** | five more stale statements below |
| m13 eleven definer uuid→fact oracles | **OPEN (recorded)** | catalog dump; unchanged |
| m14 the dev seed upserts consent records directly | **OPEN** | `seed/people_crm_dev.sql:537-546`; `config.toml:60`, `:88` |
| m15 half-built DB after `db reset` | **NOT REPRODUCED** | ledger read `555` on the first poll after both resets |

---

## 1. MAJOR-1 — 00624's `stage` backfill stamps `project_parties.updated_at = now()` on **every seat of every completed project**, and `updated_at` is exactly what `people_directory`'s party branch ranks identities by: at deploy the Directory row for an uncarded human flips from their LIVE seat to the CLOSED job's seat, and the room opens the wrong one. The statement touches 0 rows on every local reset, so no suite and no prior round has ever executed it.

`supabase/migrations/00624_project_party_window_and_authority.sql:756-765` (the backfill),
`:391` (`stage` gets its NOT NULL default in the same file, so on Strata *every* seat is `'active'`
when the backfill runs), `set_updated_at_project_parties` (a `BEFORE UPDATE FOR EACH ROW` trigger
calling `update_updated_at_column()`, which sets `NEW.updated_at := now()` unconditionally),
`00626:1417-1420` (the party branch's `ORDER BY … pp.updated_at DESC, pp.id`), `00626:1273`
(`q.updated_at` is projected as `last_touch_at`), `00626:1270` (`q.project_id`).

### What the migration says about this column

`00626:36-38` states the invariant the wave rests on: *"The winning row per identity is the most
recently updated seat … so every shipped reader that opens a person from a Directory row still lands
on a real seat."* The sibling migration in the same chain then makes "most recently updated" mean
"touched by 00624", for one population and one population only: every seat on a completed project.

### The walk (`probe201-w1b-final-r12-backfill-updated-at.sql`)

One uncarded human keyed on a phone, seated on the completed Lindqvist kitchen (400 days quiet) and on
the active Okonkwo residence (10 days quiet) — then 00624:756-765, verbatim:

```
NOTICE:  seat on the COMPLETED job = 390e041c-…   seat on the ACTIVE job = 3808f1dc-…
NOTICE:  BEFORE the backfill: Directory row person_id=3808f1dc-…  project=Okonkwo residence   last_touch_at=2026-09-02 22:53:38
NOTICE:  AFTER  the backfill: Directory row person_id=390e041c-…  project=Lindqvist kitchen   last_touch_at=2026-09-12 22:53:38
```

`person_id` and `project_id` both move to the closed job, and `last_touch_at` reads the deploy instant.

### Why this is MAJOR

- `person_id` on a party-branch row is what the room hands to `openParty({ id, role })`
  (`people-room.tsx:281`, `directory/person-row.tsx`), which `party-profile-sheet.tsx` resolves with
  `usePerson`. After the deploy that sheet shows the **closed** job's project name, trade, company and
  window for a human who is on a live job this week, and its "Send a text" composer opens against the
  closed job's seat. The reader disagrees with the record about which engagement this human is in.
- `last_touch_at` reads "today" for every seat on every completed project, so
  `deriveRelationshipLine()` (`people-derivation.ts:305-311`) prints "last touched today" for people
  nobody touched. (The Desk's reconnect rail is NOT affected: `isNurtureDue()` returns false for every
  field party kind — `people-derivation.ts:276-290` — so only the line text lies, not the queue.)
- The flip is **systematic and simultaneous**: every affected identity moves at the same instant,
  because one statement stamps them all with the same `now()`.
- **Nothing can catch it locally.** On `supabase db reset` the migrations run before any seed, so
  `project_parties` is empty when 00624:756 executes and the statement touches 0 rows. The seeded
  Lindqvist seats read `stage='warranty'` because `seed/people_crm_dev.sql:693` writes the column
  directly, never because the backfill ran. Eleven rounds and both suites have measured a no-op:

```
$ psql … -c "select pj.name, pj.status, pp.stage, count(*) from project_parties pp
             join projects pj on pj.id=pp.project_id group by 1,2,3;"
 Lindqvist kitchen | completed | warranty    | 7      ← written by the seed, not the backfill
 Okonkwo residence | active    | active      | 13
```

- rulings §6 ships this at 100%, unflagged, in one chain, against live Strata data where every seat
  carries the freshly-defaulted `stage='active'`.

### The fix

Keep the column from moving. The narrow form is to bracket the backfill:

```sql
ALTER TABLE public.project_parties DISABLE TRIGGER set_updated_at_project_parties;
UPDATE public.project_parties pp SET stage = … ;          -- 00624:756-765, unchanged
ALTER TABLE public.project_parties ENABLE  TRIGGER set_updated_at_project_parties;
```

(`SET … , updated_at = pp.updated_at` does not work — `update_updated_at_column()` overwrites `NEW`
after the SET list is evaluated.) The alternative is to stop ranking identity on a column a migration
may write: order the party branch's `DISTINCT ON` by a fact about the work — e.g.
`(pp.off_job_at IS NULL) DESC, pp.on_site_to DESC NULLS LAST, pp.updated_at DESC, pp.id` — in which
case `people_directory_seats`' `first_value()` window (`00626:1685-1687`) must take the identical
change, because r1 MAJOR-2 turns on the two naming the same winner.

A suite leg is owed either way, and it cannot live in a block that runs after the seed: it has to
stage two seats and execute 00624:756-765 itself, as `probe201` does.

---

## 2. MAJOR-2 — `party_identity_key()` stops at the rolodex stamp and never falls through to the exact E.164, so a carded human's UNSTAMPED seat becomes a second Directory identity: the ordinary inline "add to the roster" puts the same person on the feed twice, 62 rows → 63, each row claiming a partial `seat_count`

`supabase/migrations/00626_people_directory_v4_seats.sql:272-278` (the COALESCE),
`:30-33` and `:286-293` (the file's claim that this *is* crm-model §4's precedence),
`:1378` (`pp.studio_contact_id IS NULL` — the party branch emits every unstamped seat),
`packages/supabase/src/hooks/use-coordination.ts:400-402`, `:500` (`studioContactId?: string | null`
— *"Omit or null for an inline add with no rolodex link"*).

`crm-model.md` §4 ranks the evidence: **rule 2, "Phone match — `phone_e164` exact — strong —
auto-link within one studio; carries consent"**, and **rule 6, "Party id lineage — `studio_contact_id`
from a fold — provenance only — never a merge key on its own."** `party_identity_key()` inverts that
order: the stamp is first and, being a COALESCE, it is *terminal* — a seat that carries a stamp never
consults the number, and a seat that carries none never consults the card that shares its number. So
the two halves of one human never meet.

### The walk (`probe197-w1b-final-r12-unstamped-seat-of-a-carded-human.sql`)

Dana Kowalski, card `d0e10000-…-0011`, `phone_e164 +16125550111`, two stamped seats. The studio adds
her to the Okonkwo roster once more on the same number and does not pick her off the rolodex — one
INSERT, exactly what `useAddProjectParty` writes with `studioContactId` omitted:

```
NOTICE:  Dana card=d0e10000-0000-0000-0000-000000000011  phone=+16125550111
NOTICE:  BEFORE  person_id=d0e10000-…-0011  role=contact  seats=2  consent=granted
NOTICE:  AFTER   person_id=7aa5d9f4-…       role=sub      seats=1  consent=granted
NOTICE:  AFTER   person_id=d0e10000-…-0011  role=contact  seats=2  consent=granted
NOTICE:  people_directory rows: 62 -> 63  (one human, one new seat)
NOTICE:  people_directory_seats rows for Dana: 3
NOTICE:     seat identity_key=+16125550111                        person_id=7aa5d9f4-…      project=Okonkwo residence
NOTICE:     seat identity_key=d0e10000-…-0011                     person_id=d0e10000-…-0011 project=Okonkwo residence
NOTICE:     seat identity_key=d0e10000-…-0011                     person_id=d0e10000-…-0011 project=Lindqvist kitchen
```

### Why this is MAJOR

- **It is G-9, surviving the rebuild.** `00626:16-21` names the over-count as the reason this file
  exists — *"the number over-counts humans"* — and `people-room.tsx:383` is the head count that prints
  it. PR-g's head ("29 people, 22 firms") reads 63 where the record holds 62 humans, and R-G's row is
  drawn twice with two different role bands (`contact` and `sub`), so the same person appears in two
  chips.
- **Neither row tells the truth about the seats.** The card row claims 2 and the phone row claims 1;
  the human holds 3. R-BG holds per row (each nests what it claims) and fails for the human.
- **The write path is the shipped one**, not an adversarial one: `useAddProjectParty`'s own doc comment
  makes the rolodex link optional, and the 00418 fold only ever stamped rows it could match.
- **The two rows can print different words.** They share this number, so consent agrees here — but
  `reach_state`, `paper_state` and `contact_rule_summary` are computed per identity, so the unstamped
  row reads `not_on_file` for a human whose firm holds a current COI (the card row reads `current`),
  and prints no contact rule where the card carries one. That is a reader disagreeing with the record
  about the same human, on the same screen.
- It is **not** a regression on 00594 (which emitted a row per seat regardless), and no ruling in
  §3 covers it — R-BE is about `usePerson`, R-BG about the count, PR-o/R-Y about card-to-card merge,
  which has no surface for a card-versus-seat duplicate.

### The fix, or the ruling

`party_identity_key()` is IMMUTABLE and carries an expression index (`00626:295-298`), so it cannot
look a card up. Two shapes:

1. Resolve the stamp **before** the key, in the three places that state the predicate: give the party
   branch, the seats view and the `identity_seats` CTE a `LEFT JOIN public.studio_contacts sc ON
   sc.organization_id = <the seat's tenant> AND sc.phone_e164 = pp.phone_e164 AND sc.entity_kind =
   'person'` and key on `COALESCE(pp.studio_contact_id, sc.id, …)::text`. The precedence then reads
   crm-model §4's, and R-BG survives because all three change identically.
2. Or close it on the WRITE side: have the add path stamp `studio_contact_id` whenever the number
   already names a card in this studio (crm-model §4 rule 2's "auto-link within one studio"), and say
   in `00626`'s COMMENT that an unstamped seat sharing a card's number is a known second identity
   until it does.

Either is a ruling as much as a fix, because option 1 changes what "one identity" means for the whole
wave; it should not be decided in the migration without Fable.

---

## 3. MINOR findings

### m1 — `v_access_grants`' `project_review` tier reports the **revoker** as the grantor (carried, **open**)

`00627:491`. `project_review_access` has no grantor column, so `granted_by` is NULL for every live
grant and becomes whoever **closed** the door once revoked, on a view whose stated purpose is "who
opened it" (`00627:500-501`). The adjacent `evidence_upload` branch gets the same situation right and
says so (`00627:461-464`). Fix: `NULL::uuid` with the same one-line note. 0 rows locally, so this is
code-grounded.

### m2 — the 00627 banner's grant premise is factually wrong, and `w1b-report.md` §5/§8 asks Kody to rule on it (carried, **open**)

`00627:26-39`, `:162-163`, `:252-255`; `w1b-report.md:205-209`, `:580-583`. Measured:

```
 table_name              | grantee       | privilege_type | cols
 plan_transmittal_tokens | authenticated | SELECT         | created_at,expires_at,first_opened_at,id,
                                                            last_used_at,project_id,status,transmittal_id,view_count
 trade_rfq_tokens        | authenticated | SELECT         | created_at,expires_at,id,last_used_at,
                                                            party_id,proposal_id,rfq_request_id,status
```

Both tables carry **column-level** SELECT grants, so their shipped `FOR ALL TO authenticated` policies
are not dead and the banner's "the SELECT grant was never given" is false for two of the four. The
definer readers project `created_by` and `updated_at`, which those column lists withhold, so the
readers do widen the effective ACL — the opposite of what the banner claims. The ruling request in
`w1b-report.md` §8 rests on the false premise and, acted on, would expose both tables' `token_hash`.
Withdraw or restate it before Kody sees it.

### m3 — `v_access_grants`' seven invoker branches inherit predicates broader than the tenant conjunct this wave applies everywhere else (carried, **open**)

`00627:342-497`. Re-walked (`probe198`): the second-studio member reads 7 `field_link` rows, identical
to what `field_link_tokens` hands that caller directly. Not a new door; direction §7 defers this view's
RLS to each base table. It belongs in the view's COMMENT the way r6 MAJOR-2's four branches belong in
`people_directory`'s.

### m4 — the `evidence_upload` tier is unreachable for the studio that minted the door (carried, **open**)

`00627:459-478`. `fulfillment_evidence_upload_tokens`' only `authenticated` SELECT policy is gated on
a platform `user_roles` row; 0 rows for the studio owner. Read-only, no leak; a completeness gap owed a
line in the branch's comment. (Checked while here: `md5(fet.token)` is not a credential handle worth
worrying about — `00364:457` mints the token as two `gen_random_uuid()`s, 244 bits.)

### m5 — the Directory row's rule clause is the winning seat's, not the identity's (carried, **open**, medium confidence)

`00626:1301`: `contact_rule_summary('engagement', q.id)` over the `DISTINCT ON` winner, while
`reach_state`, `consent_status` and `seat_count` on the same row were all lifted to the identity. An
uncarded identity whose per-job override sits on the non-winning seat prints "no rule on file" while
the seat line beneath prints the rule — against R-S. **MAJOR-1 makes this more likely to bite**, since
it changes which seat wins. Reduce it the way the other three reduce, or say in the COMMENT that it is
deliberately the winning seat's.

### m6 — every firm card carries a `consent_status` word R-G gives the company row no column for (carried, **open**)

`00626:1515`. `probe199`: `company rows=21 · of which carrying a consent word=21`. R-G fixes the
company row at two bordered word columns (paper, payee marker) with no consent column, so this is a
display rule left in the app — the same posture as R-A/C13's paper word, which the view's COMMENT names
explicitly. This split is unstated. One sentence, so a later reader does not print it.

### m7 — `people_directory` is the only relation of this wave with no explicit `REVOKE … FROM anon` (carried, **open**)

`00626:1638` is a bare `GRANT SELECT … TO authenticated`, while `people_directory_seats` (`:1811`) and
`v_access_grants` (`00627:515`) both `REVOKE ALL … FROM PUBLIC, anon` first. Locally
`has_table_privilege('anon','public.people_directory', …)` is `t` for SELECT **and INSERT**, from
`seed/00-legacy-grants.sql`'s blanket. No exposure — `set role anon; select … from people_directory`
answers `ERROR: permission denied for table studio_contacts`, because the view is `security_invoker`,
and it is not auto-updatable so the INSERT is inert. One line, since the wave's own rule is "revoked
explicitly rather than left to creation defaults" (`00625:30`).

### m8 — two live portal UPDATE writers of the frozen consent columns will raise the moment this chain ships (carried, **open**)

`packages/supabase/src/hooks/use-coordination.ts:715` (the phone-correction path, which also writes
`phone`/`phone_e164` — frozen by R-AX) and `:884` (the field opt-in attestation). Both fail closed (the
write is refused, nothing is lost) and both are already owed to W2 in `w1a-report.md` §8 and
`w1b-report.md` §8 — restated because these are two ordinary studio acts that will hard-error in
production and rulings §6 ships the chain unflagged.

### m9 — the paper word's whole gating reckoning can be undone in one untraceable write, by `blocks` **or by DELETE** (carried, **open and wider** — a ruling)

`00623:136`, `:544-547` (the DELETE policy), `:551-552` (DELETE granted to `authenticated`).
`probe202`, as `studio_manager@patina.dev`, a plain **admin**, not the owner:

```
NOTICE:  Northgate paper word BEFORE: lapsed
NOTICE:  m9  blocks emptied on 1 row(s) by a plain admin -> paper word now: current
NOTICE:  Northgate paper word BEFORE: lapsed
NOTICE:  m9b the lapsed gating certificate DELETED outright (1 row(s)) -> paper word now: current
```

The r3/r4/r9/r10 supersede guard family closes every path that *hides* a lapse behind another document,
and neither of these goes through it: the record and the reader agree afterwards, which is why it is
MINOR, and the whole invariant the COMMENT claims (`00623:485-505`) rests on two ungated member writes.
`crm-model` §4 already says an absorbed firm's documents are *"marked superseded, never deleted"*. If
`blocks` and deletion are the studio's own judgement, say so; if they are load-bearing for the
`site_access`/`draw` gates they want the `verified_by`/`verified_at` treatment, an append-only change
record, or no DELETE grant at all.

### m10 — **nine** SQL suites are red on this branch and unlisted in `KNOWN_FAILURES.md`, not six; six of the nine are this program's consent repoint (carried from r11, **open, count corrected**)

Full run of every `supabase/tests/**/*_test.sql` on the twice-reset database, differenced against
`KNOWN_FAILURES.md`'s 22 listed files:

```
capture_enrichment/target_type_visibility_test.sql   FAIL c2: an org co-member must not see a run targeting …
field/field_capture_note_routing_test.sql            FAIL 7f: field_captures should carry exactly five policies, got 9
field/project_task_field_capture_ref_test.sql        FAIL 4b: the dispatch trigger lost its consent gate     ← this program
proposals/proposal_copy_immutability_test.sql        proposals column census drifted (`subject`)
rls/field_parties_test.sql                           ERROR: consent_legacy_column_frozen                      ← this program
site_requests/00471_authority_and_action_detail_test.sql   … did not enqueue an exact granted-consent dispatch ← this program
site_requests/00472_binder_exact_studio_privacy_test.sql   … did not enqueue granted-consent dispatch          ← this program
site_requests/security_and_lifecycle_test.sql        send must transition not_asked consent to pending         ← this program
workflow/00470_site_request_awaiting_consent_handoff_contract_test.sql  … did not freeze the awaiting-consent request evidence  ← this program
```

`rls/people_directory_scope_test.sql` is r11's own and is now **green**. The three non-consent reds are
inherited from work already merged onto this branch. `project_task_field_capture_ref_test.sql:209` is
still a **source-text proxy** — it asserts `pg_get_functiondef('fc_dispatch_task_assignment')` contains
`sms_consent_status`; R-AY repointed that gate to `channel_consent_status()`, so the string is gone and
the gate is not (the catalog dump in §0 shows `reads_record=t, reads_frozen=f`). Either fix the six or
list them in `KNOWN_FAILURES.md` — the repo's own mechanism, currently silent on all nine, while
`w1b-report.md` §7 presents verification as two green suites.

### m11 — the `studio_contact_id` guard covers future writes only; nothing counts or repairs existing stamps (carried, **open**)

`00624:718-733` now carries the preflight SELECT **as a comment**, which is the right place for it and
is not the same as running it. Any legacy seat on Strata whose `studio_contact_id` names a card in
another studio, or sits on a `studio_id IS NULL` project, survives the deploy carrying r9 MAJOR-2's
consequence, and the r11 M3 guard cannot repair it. It belongs beside R-BD's count in the W7 preflight.
Locally 0.

### m12 — `w1b-report.md` has drifted from the code it describes (carried, **open and wider**)

Re-verified against HEAD `7b4707d8e`. r11's five, all still true:

* `:333` says 2701 replayed grant statements (2719);
* `:353-369` describes a 12-block suite (21 blocks, and several NOTICE strings have changed);
* `:383` claims a `654 7` diff on `database.types.ts` (there is none);
* `:435-438`'s probe transcript shows the pre-r8 site-access policies — the live four read
  `is_active_studio_member(project_recorded_studio(project_id)) AND is_studio_comember(project_designer(project_id))`;
* `:580-583` still carries the ruling request m2 retracts.

Three more this round:

* `:133` says `seat_count`'s source is `identity_seat_count(identity_key)`; since r11 MAJOR-2 it is the
  `identity_seats` CTE (`00626:1072-1087`), and the function survives only for the single-identity
  question;
* `:67-70` says `assert_project_party_cards()` resolves `project_consent_org()`; it has resolved
  `project_tenant_org()` since r7 and, for `studio_contact_id`, `project_recorded_studio()` since r11;
* `:353` says `W1A_EXIT=0 passed=48`; it is 49.

Twelve rounds of fixes have not been folded back, and this is the artefact Fable and Kody read.

### m13 — eleven definer uuid→fact oracles answer any authenticated caller (recorded, not new)

`00624:192`, `:257`, `:329`, `:361`; `00625:64`. `project_tenant_org()`, `project_party_org()`,
`project_recorded_studio()`, `project_party_recorded_studio()` and `project_designer()` are all
SECURITY DEFINER with `GRANT EXECUTE … TO authenticated` and no membership gate — the shipped posture
of `project_consent_org()` (00594) and `project_party_designer()` (00592) they were grafted from. Named
again only because the count keeps growing and three gate resolvers are among them.

### m14 — the dev seed writes `studio_channel_consent` by raw `ON CONFLICT DO UPDATE`, bypassing `record_channel_consent()`'s R-AG/R-AL gates, and is wired into the **staging** seed array (carried, **open**)

`supabase/seed/people_crm_dev.sql:489-546`; `supabase/config.toml:60` and `:88`. The upsert overwrites
`status`, `consented_at`, `source`, `evidence`, `opt_out_at`, `opt_out_source`, `opt_out_evidence`,
`refusal_unanswered` and `origin_project_id` on conflict, and `studio_channel_consent` carries no
trigger enforcing R-AG (only `set_updated_at_studio_channel_consent` and
`site_request_consent_granted_dispatch`). On any database where one of those seven numbers already
carries an `opted_out` record, a seed replay flips it to `granted` with a fabricated `consented_at` and
**no newly recorded consent**. `[remotes.staging]` is provisioned (`project_id = "vuesoyhfrjabfxbrzekd"`)
and `people_crm_dev.sql` is line 88's last entry, so staging is a live replay target. It stays MINOR
strictly under the rubric's "service_role-only paths" clause — the only writer is the seed runner, and
the numbers are the `+1612555011x` fixture range. Either route the seed through
`record_channel_consent()`, make the upsert `ON CONFLICT DO NOTHING`, or take the line out of the
staging array; `w1b-report.md` §6 already asks Fable to rule on the last of those and this is the
concrete cost of answering "yes".

### m15 — `supabase db reset` leaving `:54322` half-built (carried, **not reproduced**)

The ledger read `555 | 20260910152111` on the first poll after both resets this round. Keep the polling
advice in any runbook; it is an artefact of the CLI's closing `Restarting containers...`, not a defect.

### m16 — an explicit `p_expires_at` still cannot beat a live window, so PR-l's "make the studio choose" cannot be built on `create_field_link` (carried from r1/r2 MINOR-1, **open**; dropped from r11's list)

`00627:577-585`. The window branch is tested first and unconditionally, so a caller who asks for a
shorter date on a seat carrying `on_site_to` or `warranty_until` gets the window end instead, and suite
block 10 asserts the override as intended ("the engagement window sets the expiry **and outranks a
caller date**"). PR-l is *"Make the studio choose, with the warranty end offered as the second option
in words"* — the implementation makes the later of the two mandatory. Nothing is broken today (the
two-argument form is new), but W2's mint act has no RPC shape to express "ends with the engagement"
when the seat carries a warranty. One sentence in the COMMENT, or a `p_expires_at` that wins when it is
in the future and inside the window.

### m17 — MAJOR-2's residual: the Directory costs ~2.6 ms per row, so a raw `SELECT *` crosses the 8 s `statement_timeout` at ~3 262 rows; PostgREST's own `max_rows` keeps the shipped feed under it (new, recorded)

`probe191`, same fixture, same `statement_timeout='8s'` (`authenticated`'s own `rolconfig`):

```
cards=49    seats=31    ->    62 rows in 00:00:00.103
cards=249   seats=231   ->   462 rows in 00:00:01.120
cards=449   seats=431   ->   862 rows in 00:00:02.178
cards=649   seats=631   ->  1262 rows in 00:00:03.155      ← r11's ≥600/≥600 gate, met
cards=849   seats=831   ->  1662 rows in 00:00:04.207
cards=1249  seats=1231  ->  2462 rows in 00:00:06.251
cards=1649  seats=1631  ->  3262 rows in 00:00:08.370      ← past the timeout
```

Linear, not quadratic: r11 MAJOR-2 is fixed. `probe192` measures the shape PostgREST actually issues —
`config.toml:18` sets `max_rows = 1000` and `use-people.ts:125` adds no ORDER BY, so the executor stops
early:

```
cards=1649 seats=1631 -> SELECT * LIMIT 1000 : 1000 rows in 00:00:04.294
   usePerson (person_id filter above the view) in 00:00:00.097
cards=3249 seats=3231 -> SELECT * LIMIT 1000 : 1000 rows in 00:00:04.352
   usePerson (person_id filter above the view) in 00:00:00.175
```

So the room's feed plateaus around 4.3 s rather than failing, and `usePerson` is cheap. It is MINOR for
that reason and recorded for three others: the plateau is 4.3 s of server time on the room's first
paint; `usePeopleDirectory` has no pagination, so past 1 000 rows the Directory silently truncates;
and the residual is the per-row `reach_state_for*` / `identity_consent_status` / `identity_paper_state`
calls, which is its own pass, not this finding's. It also depends on a hosted `max_rows` this branch
does not control — worth confirming on Strata before the deploy.

### m18 — neither r11 MAJOR-1 nor r11 MAJOR-2 has a regression leg inside the W1b suite (new)

`supabase/tests/people/w1b_compliance_authority_directory_test.sql` runs 20 numbered blocks; none of
them seeds a designer who belongs to no organization, and none measures the Directory's cost. M1 is
guarded only by `tests/rls/people_directory_scope_test.sql` case (h3) — a different file, in a
different directory, that the report's §7 does not name — and M2 only by
`probe188-w1b-fix-r11-major2-directory-cost.sql`, which nothing re-runs. A quadratic reintroduced in W2
would be caught by no gate. Block 11 already owns the seat's new columns; one leg there asserting
`SELECT * FROM people_directory` under `SET LOCAL statement_timeout='8s'` on a grown fixture, and one
in the scope suite naming case (h3) in the report, would close it.

### m19 — the r11 MAJOR-3 fix costs the studio-less population its rolodex pick, and the act that breaks is a shipped one (new; the ruling `w1b-final-fix-log-r11.md` says is owed, restated as a deploy item)

`00624:649-657`. Any write naming `studio_contact_id` on a project whose `projects.studio_id` is NULL is
now refused `party_card_project_has_no_studio` — for every writer, including the studio doing the work
and including service_role. The shipped act that hits it is `useAddProjectParty` with a rolodex pick
(`use-coordination.ts:500`) and `useUpdateProjectParty` on any of the four guarded columns of a legacy
stamped seat. Locally that is 5 of 8 projects (all 0 seats today); on Strata it is R-BD's owed count.
Walked as a control in `probe194`: `A4 company_id on the studio-less job LANDED`, so only the identity
key is refused. This is the fix log's own stated cost and not a new defect — recorded here so it
reaches the deploy brief beside R-BD's backfill and m8's two writers, since all three are ordinary
studio acts that hard-error the moment this chain ships.

---

## 4. Recorded, not findings

- **`compliance_state()`'s transitive walk is sound under adversarial writes.** The head-of-chain guard
  (`00623:408-415`) keeps `superseded_by` acyclic; the recursion terminates on a NULL `succ` and is
  depth-capped at 64; the `retired` CTE requires each reachable successor to be in force **and** to
  contain the **root's** gates. `probe196`: 0 paper words disagree with `identity_paper_state` for any
  of five callers.
- **No bearer credential reaches `v_access_grants`.** `probe198`: 0 grant_ids match `[0-9a-f]{64}`.
- **`identity_seats`, `identity_seat_count()` and `people_directory_seats`' `WHERE` are byte-identical
  predicates** (`00626:423-432`, `:1079-1085`, `:1763-1769`) — R-BG holds, measured at 0 divergence for
  five callers and at 3 262 rows.
- **The freeze still names only the ten columns** and none of 00624's ten new ones is on it
  (`refuse_legacy_consent_write_trg`, catalog dump in §0).
- **PR-r holds**: `project_site_access_cards` has no code-like column, four policies, no client leg
  (`pg_policy` dump in §0).
- **The local DB was this wave's sole owner** for this review; the ledger read `555 / 20260910152111`
  before the first probe and after the last; every probe ends in `ROLLBACK`; `git status` under
  `supabase/`, `packages/` and `apps/` is clean.

---

## 5. Findings, ranked

| # | Severity | Confidence | Where | Claim |
|---|---|---|---|---|
| M1 | MAJOR | high (mechanism) / medium (Strata population) | `00624:756-765`, `:391`; `00626:1270`, `:1273`, `:1417-1420` | 00624's stage backfill stamps `updated_at = now()` on every seat of every completed project, and that column is the party branch's identity tie-break: the Directory row flips to the closed job's seat, `project_id` and the seat the room opens follow it, and `last_touch_at` reads the deploy instant. The statement touches 0 rows on every local reset (migrations run before seeds), so no suite has ever executed it — walked with `probe201` |
| M2 | MAJOR | high | `00626:272-278`, `:1378`; `use-coordination.ts:400-402`, `:500` | `party_identity_key()`'s COALESCE terminates at the rolodex stamp and never falls through to the exact E.164, so a carded human's UNSTAMPED seat is a second Directory identity: one ordinary inline add put Dana Kowalski on the feed twice (62 → 63 rows), one row claiming 2 seats and the other 1, with different `paper_state` and rule clauses. crm-model §4 ranks an exact phone match "strong — auto-link within one studio"; rule 6 says the lineage stamp is "provenance only, never a merge key on its own" |
| m1 | MINOR | high | `00627:491` | The `project_review` tier reports `revoked_by` as `granted_by` |
| m2 | MINOR | high | `00627:26-39`; `w1b-report.md:205-209`, `:580-583` | The banner's "no SELECT grant / dead policies" premise is false — both tables carry column-level grants — and the report's ruling request to Kody rests on it |
| m3 | MINOR | high | `00627:342-497` | The seven invoker branches inherit `is_studio_comember(designer)`; walked — 7 `field_link` rows, identical to the shipped door. Belongs in the COMMENT |
| m4 | MINOR | high | `00627:459-478` | The `evidence_upload` tier returns 0 rows for every studio member |
| m5 | MINOR | medium | `00626:1301` | The Directory row's rule clause is the winning seat's, not the identity's — and M1 changes which seat wins |
| m6 | MINOR | high | `00626:1515` | All 21 firm rows carry a `consent_status` word R-G gives the company row no column for |
| m7 | MINOR | high | `00626:1638` | `people_directory` is the wave's only relation with no explicit `REVOKE … FROM anon` (anon holds SELECT and INSERT locally; both inert) |
| m8 | MINOR | high | `use-coordination.ts:715`, `:884` | Two live portal UPDATE writers of the frozen consent columns will raise `consent_legacy_column_frozen` |
| m9 | MINOR | high | `00623:136`, `:544-547`, `:551-552` | The paper word can be undone in one untraceable write by a plain admin — `blocks='{}'` **or** an outright DELETE of the lapsed certificate; both walked, `lapsed → current` |
| m10 | MINOR | high | nine test files, `KNOWN_FAILURES.md` | Nine SQL suites are red and unlisted, not six; six are this program's consent repoint; one asserts a consent gate by a source string R-AY retired while the gate itself is intact |
| m11 | MINOR | medium | `00624:718-733` | The stamp guard covers new writes only; the preflight that would size the existing stamps is a comment, and R-BD's W7 preflight does not look for them |
| m12 | MINOR | high | `w1b-report.md:67-70`, `:133`, `:333`, `:353-369`, `:383`, `:435-438`, `:580-583` | The report has drifted from the code across twelve fix rounds — five carried statements plus three more found this round |
| m13 | MINOR | high | `00624:192`, `:257`, `:329`, `:361`; `00625:64` | Five more definer uuid→fact oracles answer any authenticated caller; the platform count is eleven |
| m14 | MINOR | high | `seed/people_crm_dev.sql:489-546`; `config.toml:60`, `:88` | The dev seed upserts consent records directly, bypassing `record_channel_consent()`'s R-AG/R-AL gates (no trigger enforces them), and is wired into a provisioned staging seed array — a replay can flip an `opted_out` record to `granted` with no newly recorded consent |
| m15 | MINOR | high | environmental | r11's half-built-database window did not reproduce this round; keep the polling advice in the runbook |
| m16 | MINOR | high | `00627:577-585`; suite block 10 | An explicit `p_expires_at` still cannot beat a live window, so PR-l's "make the studio choose" cannot be built on this RPC (carried r1/r2 MINOR-1, absent from r11's list) |
| m17 | MINOR | high | `00626:1072-1087`; `use-people.ts:125`; `config.toml:18` | MAJOR-2's residual: ~2.6 ms per Directory row, so a raw `SELECT *` crosses the 8 s timeout at ~3 262 rows; PostgREST's `max_rows = 1000` caps the shipped feed at ~4.3 s and truncates past 1 000 rows with no pagination |
| m18 | MINOR | high | `tests/people/w1b_compliance_authority_directory_test.sql` | Neither r11 MAJOR-1 nor r11 MAJOR-2 has a leg in the W1b suite; M1 is guarded only by `tests/rls/people_directory_scope_test.sql` (h3) and M2 only by a probe nothing re-runs |
| m19 | MINOR | high | `00624:649-657`; `use-coordination.ts:500` | The r11 M3 fix refuses every `studio_contact_id` write on a project that records no studio, for every writer — a shipped studio act that hard-errors on 5 of 8 local projects and R-BD's owed Strata count. The fix log's own stated cost, restated as a deploy-brief item |

Probe files written this round, all under `artifacts/people-room-crm-2026-09-11/build/`
(`git add -f`), each with its `.out`, every one read-only or `ROLLBACK`ed:
`probe191-w1b-final-r12-directory-growth-curve.sql`,
`probe192-w1b-final-r12-postgrest-shaped-cost.sql`,
`probe194-w1b-final-r12-foreign-card-stamp.sql`,
`probe195-w1b-final-r12-second-studio-sweep.sql`,
`probe196-w1b-final-r12-reader-vs-record.sql`,
`probe197-w1b-final-r12-unstamped-seat-of-a-carded-human.sql`,
`probe198-w1b-final-r12-access-grant-readers.sql`,
`probe201-w1b-final-r12-backfill-updated-at.sql`,
`probe202-w1b-final-r12-blocks-and-delete-doors.sql`.
