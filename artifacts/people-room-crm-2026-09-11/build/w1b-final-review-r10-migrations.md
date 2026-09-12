# W1b — final review, round 10 (migrations)

Adversarial review of `build/w1b-report.md` and the five migrations it names, read in full,
against `rulings.md` §3 (R-A … R-BE, **all settled and not findings**), `synthesis/direction.md`
§2.2/§3.8/§7/§8, `synthesis/crm-model.md` §1/§2/§4/§5, `briefing/current-state.md` §B–§E,
`build/inventory.md`, `briefing/fixture.md`, `build/w1a-report.md`,
`build/w1a-close-review-r6-migrations.md` / `-tests.md`, and the prior round
(`w1b-final-review-r9-migrations.md` + `w1b-final-fix-log-r9.md`).

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11` (HEAD `960bb771d`). Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **Nothing touched on Strata.**

**Verdict: NOT clean — 0 BLOCKING, 2 MAJOR, 13 MINOR.**

Both MAJORs are new this round. Both are the *r9 fixes' own residue*: M1 is the new reader-side
supersede reckoning being one hop deep, and M2 is the half of r9 MAJOR-2's consequence that the
`studio_contact_id` guard cannot reach.

---

## 0. What I ran, and what it said

### Environment — the reset is unambiguously local

```
$ ls -la .../apps/designer-portal/ | grep -i env
.---------  .env.example          # no .env.local in this worktree
$ ls .../supabase/.temp/
cli-latest  start-secrets          # no project-ref
$ grep -n "supabase:reset" package.json
43:    "supabase:reset": "cd supabase && supabase db reset",
```

### The grep-winner rule, checked before reading any redefinition

Every `CREATE OR REPLACE FUNCTION` in the five files, resolved against the migrations that
predate them:

```
$ cd .../supabase && for f in $(grep -ho "CREATE OR REPLACE FUNCTION public\.[a-z_]*" \
    migrations/0062[34567]*.sql | sed 's/.*public\.//' | sort -u); do
    prior=$(grep -rln "CREATE OR REPLACE FUNCTION[^(]*\b$f\b" migrations/*.sql \
            | grep -v "0062[34567]_" | sort | tail -1); echo "$f -> prior: ${prior:-NONE}"; done
create_field_link -> prior: migrations/00284_field_dispatch_wiring.sql
   # every other one of the 25 -> prior: NONE (all new objects)
$ grep -rln "CREATE OR REPLACE VIEW public.people_directory\b" migrations/*.sql | sort | tail -2
migrations/00594_studio_channel_consent.sql
migrations/00626_people_directory_v4_seats.sql
```

`create_field_link`'s graft against `00284:37-79` is verbatim: the `no_data_found` lookup, the
`auth.uid() IS NOT NULL AND NOT EXISTS (… p.designer_id = auth.uid())` guard with its
`insufficient_privilege`, the supersede UPDATE, the
`encode(extensions.gen_random_bytes(32),'hex')` / `extensions.digest(…,'sha256')` pair and the
`RETURNING … INTO v_id` shape. Only `expires_at` is added. **Lineage: OK.**

`people_directory`'s six branch predicates against `00594:1217-1458`: client
`is_studio_comember(dc.designer_id)`; lead the same plus `status NOT IN ('accepted','declined',
'expired')`; maker the `saved_vendors ∪ project_parties` set with its three co-member legs; team
`removed_at IS NULL AND user_id <> auth.uid() AND role IN (…)` plus the three legs; contacts
`is_active_studio_member(sc.organization_id)` — all carried byte for byte. The party branch adds
`pp.studio_contact_id IS NULL` and the tenant leg, both deliberate. **Every existing reader column
is kept, in position and type** (probe below). **Carried: OK.**

### Reset, twice — including the dev seed

```
$ python3 scripts/generate-legacy-grants.py
wrote .../supabase/seed/00-legacy-grants.sql — baseline + 2719 replayed statements
$ git diff --numstat -- supabase/seed/00-legacy-grants.sql
   (no output — the committed seed already matches the migrations' GRANT/REVOKEs)

$ pnpm --dir .../agent-people-build supabase:reset            # pass 1
RESET1_EXIT=0
Seeding data from supabase/seed/people_crm_dev.sql...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
$ grep -in error /tmp/claude/r10-reset1.log
448:Applying migration 00458_sms_message_error_capture.sql...    # a FILENAME, not an error

$ pnpm --dir .../agent-people-build supabase:reset            # pass 2
RESET2_EXIT=0     (no /^error/ or /error:/ lines)

$ psql … -At -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
555|20260910152111
$ psql … -At -c "select string_agg(version,' ' order by version) from
                 supabase_migrations.schema_migrations where version>='00620' and version<'20000000';"
00621 00622 00623 00624 00625 00626 00627
```

The seed replays identically on both passes:
`36` compliance documents · `1` site access card · `11` authority grants · `7` consent records ·
`49` `role='contact'` rows (`21` company + `28` person).

### Both W1b/W1a suites, after each reset

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0    NOTICE:  All W1a assertions passed.

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0    20 assertion blocks, then 'All W1b assertions passed.'
   … 18. 00627's four DEFINER readers on a studio-less job: … reads 0 invoice_pay, 0 plan_link,
          0 rfq_link and 0 agreement_link … (r9 BLOCKING-1): passed
   … 19. the supersede is re-reckoned at every READ … (r9 MAJOR-1): passed
   … 20. studio_contact_id is guarded like the rest of the R-AP family … (r9 MAJOR-2): passed
```

Re-run identically after reset pass 2 (`W1A_EXIT=0`, `W1B_EXIT=0`), and again after every probe in
this report (all probes `ROLLBACK`; the ledger is unchanged at `555 / 20260910152111`).

### Generated types, and the named gates

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
   (no output — the committed types already match the local schema)

$ pnpm --dir … --filter @patina/supabase        type-check   → SUPABASE_TC=0
$ pnpm --dir … --filter @patina/designer-portal type-check   → DESIGNER_TC=0
```

### Catalog posture of all 26 new / edited routines

```
 access_grants_invoice_links         | definer | search_path=public            | postgres,authenticated,service_role
 access_grants_plan_transmittals     | definer | search_path=public            | postgres,authenticated,service_role
 access_grants_trade_agreement_links | definer | search_path=public            | postgres,authenticated,service_role
 access_grants_trade_rfq             | definer | search_path=public            | postgres,authenticated,service_role
 assert_compliance_holder            | definer | search_path=public            | postgres,service_role
 assert_party_authority_copy_to      | definer | search_path=public            | postgres,service_role
 assert_project_party_cards          | definer | search_path=public            | postgres,service_role
 assert_site_access_key_holder       | definer | search_path=public            | postgres,service_role
 compliance_state                    | INVOKER | search_path=public            | postgres,authenticated,service_role
 contact_rule_summary                | INVOKER | search_path=public            | postgres,authenticated,service_role
 create_field_link (both arities)    | definer | public, extensions, pg_temp   | postgres,authenticated,service_role
 identity_consent_evidence           | INVOKER | search_path=public            | postgres,authenticated,service_role
 identity_consent_status             | INVOKER | search_path=public            | postgres,authenticated,service_role
 identity_paper_state                | INVOKER | search_path=public            | postgres,authenticated,service_role
 identity_phone_numbers              | definer | search_path=public            | postgres,authenticated,service_role
 identity_seat_count                 | INVOKER | search_path=public            | postgres,authenticated,service_role
 party_identity_key                  | INVOKER | (none — IMMUTABLE, pure)      | postgres,authenticated,service_role
 party_kind_in_directory             | INVOKER | (none — IMMUTABLE, pure)      | postgres,authenticated,service_role
 project_designer                    | definer | search_path=public            | postgres,authenticated,service_role
 project_party_org                   | definer | search_path=public            | postgres,authenticated,service_role
 project_party_recorded_studio       | definer | search_path=public            | postgres,authenticated,service_role
 project_recorded_studio             | definer | search_path=public            | postgres,authenticated,service_role
 project_tenant_org                  | definer | search_path=public            | postgres,authenticated,service_role
 reach_state_for                     | INVOKER | search_path=public            | postgres,authenticated,service_role
 reach_state_for_identity            | INVOKER | search_path=public            | postgres,authenticated,service_role
```

No PUBLIC and no `anon` anywhere; every definer pins `search_path`; the two IMMUTABLE pure
functions omit it deliberately (a `SET` clause blocks inlining and they carry an expression index)
— `normalize_channel_value()`'s posture (00593).

### The two view shapes

```
people_directory : 1 person_id(uuid) 2 role 3 display_name 4 email 5 phone 6 profile_id(uuid)
                   7 project_id(uuid) 8 designer_id(uuid) 9 status_raw 10 last_touch_at(timestamptz)
                   11 meta(jsonb) 12 scope | 13 reach_state 14 consent_status 15 paper_state
                   16 contact_rule_summary 17 seat_count(integer)
v_access_grants  : grant_id(text) tier subject_type subject_id(uuid) scope_type scope_id(uuid)
                   granted_by(uuid) granted_at expires_at last_used_at revoked_at revoke_reason
                   — 12 columns, one shape across all eleven tiers
```

### Re-check of every r9 finding

| r9 finding | Status | Evidence |
|---|---|---|
| **B1 BLOCKING** — 00627's three project-scoped definer readers kept `project_tenant_org()` | **FIXED** | `00627:151-153`, `:241-242`, `:293-301` all resolve `project_recorded_studio()`; `access_grants_trade_agreement_links` correctly unchanged (`studio_contact_org()`). Suite block 18 walks 0/0/0/0 for the designer's second design studio with the working studio's admin as the control |
| **M1 MAJOR** — the supersede invariants were point-in-time, `blocks` outside the trigger | **FIXED as walked; NEW residue — see MAJOR-1** | `00623:612-618` re-reckons at read; `blocks` joins the trigger's `UPDATE OF` (`00623:496-500`). The r9 walk now ends `lapsed` (probe167). But the reckoning is **one hop**, and an ordinary two-renewal chain breaks it the other way |
| **M2 MAJOR** — `studio_contact_id` had no card guard | **FIXED for the stamp; NEW residue — see MAJOR-2** | `00624:587-599` + trigger `UPDATE OF … studio_contact_id` (`00624:636-639`); suite block 20. The *other* half of that finding's consequence — a Directory row claiming a `seat_count` it cannot nest — is reachable with no stamp at all |
| m1 `blocks` freely editable, no audit | **OPEN** (a ruling) | `00623:109`, `:603`, `:607` |
| m2 the banner's grant premise is wrong | **OPEN** | re-verified below |
| m3 `v_access_grants`' invoker branches | **OPEN** | re-walked below: 6 `field_link` rows, identical to the shipped door |
| m4 `evidence_upload` tier unreachable | **OPEN** | re-verified below |
| m5 rule clause is the winning seat's | **OPEN** | `00626:1153`; still not walkable on the fixture |
| m6 firm rows carry a consent word | **OPEN, and broader than stated** | all **21** company rows, not a sample |
| m7 `people_directory` has no `REVOKE … FROM anon` | **OPEN** | `00626:1453`; `has_table_privilege('anon','public.people_directory','SELECT') = t` |
| m8 two portal writers of the frozen columns | **OPEN** | `use-coordination.ts:715`, `:884` |

### Everything else the brief names, verified

| Brief item | Result |
|---|---|
| hand-numbered `NNNNN_slug.sql`, minted above the reservation | 00623–00627; 00595–00620 untouched; 00621/00622 pre-existing on the branch |
| banner + lineage in all five files | present, each naming its rounds (00623:52-96, 00624:100-140, 00625:32-47, 00626:111-206, 00627:58-86) |
| idempotent | `CREATE TABLE IF NOT EXISTS` + named `DROP/ADD CONSTRAINT`, `CREATE INDEX IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`, `CREATE OR REPLACE`, `DROP VIEW IF EXISTS` before the one non-replaceable view. Two clean resets |
| RLS in the same file | all three new tables, four policies each |
| explicit grants both directions + `REVOKE FROM PUBLIC, anon` on definer RPCs | yes — see the catalog table above |
| SECURITY DEFINER pins search_path | all 12 definer routines |
| schema-qualify extension fns | `extensions.gen_random_bytes`, `extensions.digest` (00627:602-603); `gen_random_uuid()`/`md5()` are pg_catalog built-ins here |
| guarded crons | none added (the expiry sweep is P2) |
| CHECK over enum | `stage`, `site_access_mode`, `contracted_through`, `scope`, `doc_type`, `doc_label`, `blocks`, `held_by`, `source` — all named CHECKs, all drop/re-added |
| money integer cents | `project_party_authority.threshold_cents integer` + `>= 0` CHECK; `$2,500 = 250000` asserted in block 12 |
| `compliance_state` incl. the 30-day window | one place, `00623:601-611`, `expires_on <= CURRENT_DATE + 30`, boundary asserted both ways in block 1 |
| authority policy by role | `00624:826-909`: member lands `selections`, is refused `money`/`draw_certify`; owner lands both; non-member reads nothing (block 5). The UPDATE's `WITH CHECK` also refuses a member widening `selections` → `money` |
| stage/window backfill | `00624:657-666`, guarded on `stage='active'`, `completed_at` with `updated_at` named as the stand-in |
| site access card: no client policy, no code column | four policies, all `is_active_studio_member(project_recorded_studio(project_id)) AND is_studio_comember(project_designer(project_id))`; zero code-like columns; anon refused at the GRANT (block 7) |
| `people_directory` v4 one row per identity, every branch predicate carried, every reader column kept | verified above |
| `v_access_grants` union shapes | 11 tiers, 12 columns, same order/type; `grant_id ~ '[0-9a-f]{64}'` → 0 rows (block 9) |
| `create_field_link` grafted with the window expiry | verified above; blocks 9–10 |
| dev seed replays; reset twice | yes |
| `identity_phone_numbers` cannot be used cross-tenant | as a caller who belongs to **no** organization: `identity_phone_numbers(LocalDev, Dana's card, NULL)` → **0 rows**; `compliance_state(Northgate) = not_on_file`; `people_directory` → 1 row (probe166) |

---

## 1. MAJOR-1 — the r9 reader-side supersede reckoning is ONE HOP, so the ordinary second renewal prints `lapsed` over in-force cover: four honest writes, then the calendar alone

`supabase/migrations/00623_studio_compliance_documents.sql:612-618` (the new WHERE clause),
`:592` (the function), `:563-591` (the comment that states the rule it does not implement).

r9 MAJOR-1 moved the supersede reckoning out of the trigger and into the reader, correctly. But the
new predicate asks only about the row's **immediate** successor:

```sql
-- 00623:612-618
     AND (d.superseded_by IS NULL
          OR NOT EXISTS (                      -- the retirement holds only
            SELECT 1                           -- while the successor earns it
              FROM public.studio_compliance_documents s
             WHERE s.id = d.superseded_by
               AND (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
               AND d.blocks <@ s.blocks));
```

A certificate is renewed every year, so the ordinary steady state of any firm a studio keeps for two
years is a **chain**: A retired by B, then B retired by C. `assert_compliance_holder()` permits that
and should — when B is retired, C is in force and carries B's gates (`00623:435-455`), and the
head-of-chain leg (`00623:396-405`) is satisfied because B's own `superseded_by` is still NULL. The
day B's own certificate expires, **A re-enters the reckoning**: its successor B is no longer in
force, so `NOT EXISTS` is true. A is expired and gating, and the word is `lapsed` — while C, an
in-force, non-superseded, gating `coi_gl`, is sitting on the card.

### The walk — four honest writes, then nothing (`probe161-w1b-final-r10-chain-calendar.sql`)

Every write is `studio_manager@patina.dev`, a plain `admin` of the owning studio. B is dated
`CURRENT_DATE` so that retiring A with it is in force and legal; C is dated `CURRENT_DATE + 400`.
After the fourth statement **nothing is written at all** — the reader's own formula is then
evaluated with today's date and with tomorrow's:

```
NOTICE:  chain built with 4 honest writes; NOTHING is written from here on.
NOTICE:    cover on file: an in-force gating coi_gl expiring 2027-10-17  (non-superseded: 1)
NOTICE:    compliance_state() today          = current
NOTICE:    the same formula, today           = current
NOTICE:    the same formula, TOMORROW        = lapsed  <-- the calendar alone
NOTICE:    the same formula, in 100 days     = lapsed
```

And the same state reached by editing instead of waiting (`probe160-…-supersede-chain.sql`), which
also shows which rows the reader keeps counting:

```
NOTICE:  A. word before anything:                              lapsed
NOTICE:  B. after the year-1 renewal (B in force, 10 days left): lapses_soon
NOTICE:  C. chain A->B->C, B still in force:                    current
NOTICE:  D. B has now lapsed; C is in force to 2027-10-17:      word = lapsed
NOTICE:     in-force, non-superseded, gating coi_gl on file: 1
NOTICE:     which rows the reader still counts:
NOTICE:       …0007 expires (none)     blocks {payment}            superseded_by -
NOTICE:       …0008 expires 2027-12-31 blocks {}                   superseded_by -
NOTICE:       …0006 expires 2026-03-31 blocks {site_access,draw}   superseded_by daa96e73…  ← re-admitted
NOTICE:       36c05128 expires 2027-10-17 blocks {site_access,draw} superseded_by -          ← the live cover
NOTICE:  E. Dana Kowalski's Directory paper word:               lapsed
```

### Why this is MAJOR

- `identity_paper_state()` (`00626:499-522`) reduces worst-first over the person's card **and their
  firm** and is called from all three sites, so the false word reaches Northgate Electric's company
  card, Dana Kowalski's Directory row and both her seat lines in one hop — r9 MAJOR-1's own
  consequence sentence, in the opposite direction.
- `lapsed` is not a neutral word. It is direction §3.8's blocking word and PR-h's terracotta leading
  rule, and `blocks = {site_access, draw}` is what the site-access and draw gates are built to read.
  The room will tell the studio a fully covered electrician may not enter the site.
- It needs no adversarial write and no unusual data. It is what happens to every firm on its
  **second** renewal, and it arrives with no write at all — so no audit line, no act to point at.
- It is a reader disagreeing with the record: three separate rows say, in order, "retired",
  "retired", "in force through 2027-10-17", and the reader prints `lapsed`.

### The fix, verified

Make the reckoning transitive — a row leaves the count while **any reachable** successor is in force
and carries its gates. The head-of-chain write rule (`00623:396-405`) makes `superseded_by` acyclic,
so the recursion terminates; a depth cap is still worth adding for a chain written before that rule.
Measured side by side against the shipped formula on the same fixture
(`probe167-w1b-final-r10-transitive-fix.sql`):

```
NOTICE:  r9 case, honest supersede    shipped=current recursive=current
NOTICE:  r9 case, successor gutted    shipped=lapsed  recursive=lapsed    ← r9 MAJOR-1 stays closed
NOTICE:  chain A->B->C  today         shipped=current recursive=current
NOTICE:  chain A->B->C  TOMORROW      recursive=current                   ← MAJOR-1 closed
NOTICE:  chain A->B->C  in 100 days   recursive=current
```

```sql
WITH RECURSIVE chain(root, blocks, succ) AS (
  SELECT d.id, d.blocks, d.superseded_by
    FROM public.studio_compliance_documents d WHERE d.holder_id = p_holder_id
  UNION ALL
  SELECT c.root, c.blocks, s.superseded_by
    FROM chain c JOIN public.studio_compliance_documents s ON s.id = c.succ
),
retired AS (
  SELECT DISTINCT c.root FROM chain c
    JOIN public.studio_compliance_documents s ON s.id = c.succ
   WHERE (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
     AND c.blocks <@ s.blocks
)
… WHERE d.holder_id = p_holder_id AND d.id NOT IN (SELECT root FROM retired)
```

Suite leg: beside block 19, the same fixture carried one renewal further — assert `current` today,
`current` with the middle certificate's date in the past, and `lapsed` once the head is gutted, so
both directions are pinned at once.

---

## 2. MAJOR-2 — `identity_seat_count()` carries no tenant leg while `people_directory_seats` does, so a Directory row claims a seat_count it cannot nest with no stamp, no adversarial write and two studios that merely share a designer

`supabase/migrations/00626_people_directory_v4_seats.sql:333-345` (`identity_seat_count`),
`:1566` (the seats view's tenant leg), `:1154` and `:1355` (the two call sites),
`:1463-1465` (the promise), `supabase/tests/people/w1b_compliance_authority_directory_test.sql:1602-1613`
(the assertion that cannot see it).

00626 promises, in its own words, that *"no Directory row ever claims a seat_count it cannot nest"*
(`:1463-1465`), and the suite asserts it (`:1605-1612`). r9 MAJOR-2 found one way to break it and
closed it by guarding `studio_contact_id`. That guard closes the **stamped** path only. The count
itself is still computed by a SECURITY INVOKER scan whose whole access rule is `project_parties`'
own RLS — `is_studio_comember(designer)`, satisfied by sharing **any** active organization with the
designer of record — while `people_directory_seats` additionally requires
`is_active_studio_member(project_tenant_org(project_id))` (`:1566`). The two predicates are
different sets, and nothing about a cross-tenant stamp is needed to separate them: one human seated
on a job of each of two studios that share a designer of record does it.

### The walk (`probe162-w1b-final-r10-seatcount-two-studios.sql`)

Two ordinary studio acts on the seeded fixture: Leah Hartwell — the designer of record's **second**
design studio, the shipped local shape — takes over one of the jobs that designer runs, and one
uncarded tradesman takes a seat on each studio's job with the same mobile number. The reader is
`studio_manager@patina.dev`, an `admin` of Local Dev Studio and a member of nothing else.

```
NOTICE:  LDS admin is member of Leah Hartwell? f
NOTICE:  Directory rows for Wendell Pike (as the LDS admin): 1
NOTICE:    the row CLAIMS seat_count = 2  (identity_key = +16125557777)
NOTICE:    it NESTS = 1  <-- 00626:1463-1465 promises these are equal
NOTICE:    seats the caller reads on project_parties directly: 2
NOTICE:    seats the SEATS VIEW shows the caller: 1
NOTICE:  CONTROL — the designer, member of both studios: claims 2 nests 2
```

The mutation control at the bottom is what makes it a defect rather than an access rule: for a
caller who is in both studios, claims and nests agree; the divergence is exactly the tenant leg one
view has and the other does not.

### Why this is MAJOR, and what it is not

- The head count and the seat lines are the two things W2 builds on this view (`w1b-report.md` §4,
  §8; PR-p, PR-g), so a W2-planned reader prints "2 seats" over a list of one, with no seat line to
  explain the missing one and no way for the studio to find it.
- It is the surviving half of r9 MAJOR-2's own consequence — *"the other studio's row claimed
  seat_count 1 and nested 0"* (`00624:504-509`) — reached by a different door. r9 graded that
  symptom MAJOR; the stamp guard closed the stamped door and left the phone-, email- and
  login-keyed identities open.
- **It is not a new read door and not a cross-tenant leak.** The same caller already reads both
  `project_parties` rows directly (`seats the caller reads on project_parties directly: 2`), which
  is the shipped `is_studio_comember(designer)` posture and r6 MAJOR-2's recorded ruling that *"this
  view is not the door"*. The defect is the disagreement between two columns of this wave, not the
  visibility. If Fable grades reader-disagreements-without-leak below MAJOR, this is the row to move.

### The fix

Give `identity_seat_count()` the seats view's own tenant leg, so the count is computed over exactly
the set that nests — a join to `projects` plus
`is_active_studio_member(project_tenant_org(pp.project_id))`, which is the predicate at `:1566` and
is already the residue 00624 §1c argues for on the seat rows. That keeps one definition of "this
identity's seats" rather than two.

Suite leg: the block-4 invariant at `:1605-1612` currently runs as one caller in one studio where
every seat resolves to that tenant, so it cannot fail. Stage a second design studio of the same
designer holding one seat of a shared identity **before** it, and assert claims = nests for a caller
who belongs to only one of them, with the both-studios caller as the control.

---

## 3. MINOR findings

### m1 — `v_access_grants`' `project_review` tier reports the **revoker** as the grantor

`00627:482-497`, specifically `:491` `pra.revoked_by`.

`project_review_access` has no grantor column at all:

```
$ psql … -c "\d public.project_review_access"
 edition_id | actor_id | status | expires_at | revoked_at | revoked_by | revoke_reason | created_at
Check constraints:
 "project_review_access_check" CHECK (status='active' AND revoked_at IS NULL AND revoked_by IS NULL
                                       AND revoke_reason IS NULL
                                   OR status='revoked' AND revoked_at IS NOT NULL AND …)
```

So the ledger's `granted_by` on this tier is NULL for every live grant by construction, and once the
grant is revoked it becomes the person who **closed** the door — on a view whose stated purpose is
*"what is open on this person, when does it end, and who opened it"* (`00627:15-17`). The adjacent
`evidence_upload` branch gets this exactly right for the same reason and says so (`00627:461-464`:
*"created_by on this table is TEXT, not a profile id, so granted_by is NULL rather than a
wrong-typed guess"*). Fix: `NULL::uuid`, with the same one-line note.

### m2 — the 00627 banner's grant premise is factually wrong, and `w1b-report.md` §5 asks Kody to rule on it (carried from r9 m2, **open**)

`00627:26-39` (esp. `:32` *"NO SHIPPED TABLE'S ACL IS MOVED HERE"* and `:36-39` *"cannot fire today
… a separate finding"*), `00627:144`, `:235`; `w1b-report.md:205-209`, `:580-583`.

Both tables carry **column-level** grants, so their shipped `FOR ALL TO authenticated` studio
policies do fire:

```
$ psql … -At -c "select a.attrelid::regclass||'.'||a.attname from pg_attribute a
                  where a.attrelid in ('public.trade_rfq_tokens'::regclass,
                                       'public.plan_transmittal_tokens'::regclass)
                    and a.attnum>0 and a.attacl is not null order by 1;"
plan_transmittal_tokens.created_at · .expires_at · .first_opened_at · .id · .last_used_at
 · .project_id · .status · .transmittal_id · .view_count
trade_rfq_tokens.created_at · .expires_at · .id · .last_used_at · .party_id · .proposal_id
 · .rfq_request_id · .status

$ psql … -c "set role authenticated; select count(*) from public.trade_rfq_tokens;"
 0            ← succeeds; RLS filters, the grant does not refuse
$ psql … -c "set role authenticated; select created_by from public.plan_transmittal_tokens limit 1;"
ERROR:  permission denied for table plan_transmittal_tokens
```

The column lists were chosen to withhold `token_hash`, `created_by` and `updated_at`.
`access_grants_trade_rfq` projects `t.created_by` and `t.updated_at` (`00627:144-146`) and
`access_grants_plan_transmittals` projects `p.created_by` and `p.updated_at` (`00627:235-237`), so
the definer readers **do** widen the effective ACL, which `:32` denies. Two consequences: say what
the readers widen, as every other COMMENT in this wave does; and `w1b-report.md`'s "Two things for
Fable to rule" item 1 should be withdrawn or restated before Kody sees it — its premise is false and
acting on it (`GRANT SELECT … TO authenticated`) would additionally expose both tables'
`token_hash`.

### m3 — `v_access_grants`' seven invoker branches inherit predicates broader than the tenant conjunct this wave applies everywhere else (carried from r9 m3, **open**)

`00627:342-497`. Walked (`probe164-w1b-final-r10-second-studio.sql`) as `client@patina.dev`, made a
plain `member` of the designer's second design studio and of nothing else:

```
NOTICE:  Z member of Local Dev Studio (the studio doing the work)? f
NOTICE:  --- what Z reads through v_access_grants ---
NOTICE:     client_account : 2
NOTICE:     field_link : 6
NOTICE:     studio_member : 2
NOTICE:     of which field_link on Local Dev Studio's own two jobs: 6
NOTICE:     the same rows straight off field_link_tokens (the shipped door): 6
NOTICE:     seats Z reads: 0 · site access cards: 0 · authority grants: 0 · compliance documents: 0
```

Not a new door — the identical 6 rows come straight off `field_link_tokens`, whose shipped
`field_link_tokens_studio_rw` is `is_studio_comember(p.designer_id)` — and direction §7 defers this
view's RLS "to each base table". It belongs in the view's COMMENT the way r6 MAJOR-2's four branches
belong in `people_directory`'s, because the ledger's whole point is to gather those doors onto one
surface.

### m4 — the `evidence_upload` tier is unreachable for the studio that minted the door (carried from r9 m4, **open**)

`00627:459-478`. `fulfillment_evidence_upload_tokens`' only `authenticated` SELECT policy is
`fulfillment_evidence_upload_tokens_select_admin`, gated on a platform `user_roles` row; the other is
`TO agent_reader`:

```
 fulfillment_evidence_upload_tokens_select_admin        | {authenticated} | SELECT | EXISTS (… user_roles ur JOIN roles r … WHERE ur.user_id = auth.uid() …)
 fulfillment_evidence_upload_tokens_select_agent_reader | {agent_reader}  | SELECT | true
```

So the branch returns 0 rows for every studio member and the ledger can never answer "what upload
doors are open on this exception". Read-only, no leak; a completeness gap owed a line in the branch's
comment.

### m5 — the Directory row's rule clause is the winning seat's, not the identity's (carried from r9 m5, **open**)

`00626:1153`: `contact_rule_summary('engagement', q.id)` over the `DISTINCT ON` winner, while
`reach_state`, `consent_status` and `seat_count` on that same row were all lifted to the identity
across r2/r3/r4. An uncarded identity whose per-job override sits on the **non**-winning seat prints
"no rule on file" on the row while the seat line beneath prints the rule — against R-S. Still not
walkable on the fixture: the one uncarded identity holds one seat and no engagement-subject rule is
seeded (`probe165`: `Rivera Finishes | 1 | (null)`). Code-grounded, confidence medium. Reduce it the
way the other three words reduce, or say in the COMMENT that it is deliberately the winning seat's.

### m6 — every firm card carries a `consent_status` word R-G gives the company row no column for (carried from r9 m6, **open and broader than r9 stated**)

`00626:1347`. It is not a sample — it is all of them:

```
 with_word | company_rows
-----------+--------------
        21 |           21
 Ashgrove Millwork | company | not_asked | current
 Beck + Rowe Architects | company | not_asked | current
 City of Minneapolis, CPED Inspections | company | not_asked | not_on_file
```

R-G fixes the company row at two bordered word columns (paper, payee marker) with no consent column,
so this is a display rule left in the app — the same posture as R-A/C13's paper word, which the
view's COMMENT names explicitly (`00626:1381-1383`). This split is unstated. One sentence, so a later
reader does not print it.

### m7 — `people_directory` is the only relation of this wave with no explicit `REVOKE … FROM anon` (carried from r9 m7, **open**)

`00626:1453` is a bare `GRANT SELECT ON public.people_directory TO authenticated`, while
`people_directory_seats` (`:1605`) and `v_access_grants` (`00627:515`) both `REVOKE ALL … FROM
PUBLIC, anon` first:

```
$ psql … -At -c "select has_table_privilege('anon','public.people_directory','SELECT'),
                        has_table_privilege('anon','public.people_directory_seats','SELECT'),
                        has_table_privilege('anon','public.v_access_grants','SELECT');"
t|f|f
```

Locally that `t` is `seed/00-legacy-grants.sql`'s blanket, and the view is `security_invoker` so anon
reads nothing through it. No exposure; one line for consistency, since the wave's own rule is
"revoked explicitly rather than left to creation defaults" (`00625:30`).

### m8 — two live portal UPDATE writers of the frozen consent columns will raise the moment this chain ships (carried from r9 m8, **open**)

`packages/supabase/src/hooks/use-coordination.ts:715` (the phone-correction path, which also writes
`phone`/`phone_e164` — frozen by R-AX) and `:884` (the field opt-in attestation) both
`UPDATE project_parties SET sms_consent_status = …`, which `refuse_legacy_consent_write_trg` refuses
with `consent_legacy_column_frozen`. `:700` and `:865` also `.eq('sms_consent_status','opted_out')`
against a column R-AY says nothing but the backfill reads. Both are fail-closed (the write is
refused, nothing is lost), and both are already on record as owed to W2 in `w1a-report.md` §8 and
`w1b-report.md` §8 — restated because these are two ordinary studio acts ("record this trade's
verbal opt-in", "fix this number") that will hard-error in production, and rulings §6 ships the whole
program in one chain with no flag.

### m9 — `compliance_state()`'s whole gating reckoning rests on a freely member-editable `blocks` with no audit trail (carried from r9 m1, **open** — a ruling)

`00623:109` (`blocks text[] NOT NULL DEFAULT '{}'`), `:603`, `:607`. One
`UPDATE studio_compliance_documents SET blocks='{}'` by a plain admin flips a holder from `lapsed`
to `current` with the lapsed certificate untouched. Record and reader agree afterwards, which is why
it is MINOR — but it means the r3/r4/r9 guard family can never deliver the invariant its COMMENT
claims (*"record the gates on the renewal, or do not retire the lapse"*, `00623:451-452`): the
one-write path is always open and leaves no trace of who removed the gate. If `blocks` is the
studio's own judgement, the COMMENT should say so; if it is load-bearing for the `site_access`/`draw`
gates it wants the `verified_by`/`verified_at` treatment or an append-only change record.

### m10 — two SQL suites are RED on this branch, neither in `KNOWN_FAILURES.md` and neither named in `w1b-report.md` §7 or §8

```
$ for f in rls/people_directory_scope_test.sql rls/project_roster_test.sql rls/field_parties_test.sql \
           rls/00584_studio_comember_rls_sweep.test.sql rls/studio_contacts_backfill_test.sql \
           rls/sms_tables_test.sql field/field_links_test.sql; do … done
=== rls/people_directory_scope_test.sql EXIT=3
psql:…people_directory_scope_test.sql:308: ERROR:  FAIL a2: expected exactly 12 columns, got 17
=== rls/project_roster_test.sql               EXIT=0
=== rls/field_parties_test.sql EXIT=3
psql:…field_parties_test.sql:147: ERROR:  consent_legacy_column_frozen
=== rls/00584_studio_comember_rls_sweep.test.sql EXIT=0
=== rls/studio_contacts_backfill_test.sql        EXIT=0
=== rls/sms_tables_test.sql                      EXIT=0
=== field/field_links_test.sql                   EXIT=0
```

- `people_directory_scope_test.sql:298` asserts exactly 12 columns. Under `ON_ERROR_STOP` the file
  **aborts there**, so cases (b)–(i) never run — and those are the RLS-scope assertions this wave's
  whole tenant argument rests on: a guest reads zero studio rows and zero contacts rows (c2/c3/c4),
  an unrelated designer reads nothing (b8/h6), the client `show_to_client` gating both ways
  (g0a–g4), and the dual-studio designer's two cards (i1–i4). W1b is the file that widened the view
  to 17 columns, so W1b owes the three-line edit (assert the twelve **prefix** columns and their
  order, which is the property that actually protects `select('*')` readers) — or, at minimum, a
  `KNOWN_FAILURES.md` entry, which is the repo's own mechanism and is currently silent.
- `field_parties_test.sql:120-124` writes `sms_consent_status` directly, which **00594**'s freeze
  refuses. That is W1a's, not W1b's — but 00594 is new on this branch
  (`git diff main -- …/00594_studio_channel_consent.sql` shows it as an added file), so the red is
  this program's and ships in its one chain.

`w1b-report.md` §7 presents the verification as two green suites and says nothing about either.

### m11 — the new `studio_contact_id` guard covers future writes only; nothing counts or repairs existing stamps, and the W7 preflight is scoped to `studio_id IS NULL` alone

`00624:587-599` + the trigger's `UPDATE OF` list (`00624:636-639`) close the write path r9 MAJOR-2
walked, and the fix log measured the local population clean (`28` stamped seats, all naming a card in
their own project's studio). But the migration adds no validation pass over existing rows, and R-BD's
owed Strata preflight counts only `projects.studio_id IS NULL`. Any legacy seat on Strata whose
`studio_contact_id` names a card in another studio survives the deploy carrying exactly r9 MAJOR-2's
consequence — a seated human missing from their own studio's Directory while the roster and the site
access card still name the seat. One SELECT belongs beside R-BD's in the W7 preflight:

```sql
SELECT count(*) FROM project_parties pp
  JOIN projects pj ON pj.id = pp.project_id
  JOIN studio_contacts sc ON sc.id = pp.studio_contact_id
 WHERE pp.studio_contact_id IS NOT NULL
   AND (pj.studio_id IS NULL OR sc.organization_id <> pj.studio_id);
```

### m12 — `w1b-report.md` has drifted from the code it describes

The report is the artefact Fable and Kody read. As of HEAD it says: five migrations verified by a
suite of **12** blocks (`:353`, `:357-369`) — there are 20; `2701` replayed grant statements
(`:333`) — there are 2719; a `654 7` line diff on `database.types.ts` (`:383`) — there is none, the
committed types already match; and §5/§8 carry the retracted "dead policies" ruling request (m2).
§7's probe transcript predates r6–r9 entirely (it still shows the pre-r8 `project_tenant_org()`
policies at `:435-438`). Nine rounds of fixes have not been folded back.

### m13 — eleven definer uuid→fact oracles now answer any authenticated caller (recorded, not new)

`project_recorded_studio()`, `project_party_recorded_studio()`, `project_designer()`,
`project_tenant_org()` and `project_party_org()` are all SECURITY DEFINER with
`GRANT EXECUTE … TO authenticated` and no membership gate. Walked as `admin@patina.dev`, who belongs
to **no** organization (`probe166`):

```
NOTICE:  --- a caller who belongs to no organization at all ---
NOTICE:    people_directory rows: 1
NOTICE:    project_recorded_studio(Okonkwo) = b0000000-0000-0000-0000-000000000001
NOTICE:    project_designer(Okonkwo)        = a0000000-0000-0000-0000-000000000004
NOTICE:    project_tenant_org(Okonkwo)      = b0000000-0000-0000-0000-000000000001
NOTICE:    compliance_state(Northgate card) = not_on_file      ← correctly degraded
NOTICE:    identity_phone_numbers(LDS, Dana's card, NULL) rows: 0   ← correctly gated
```

Identical posture to the shipped `project_consent_org()` (00594) and `project_party_designer()`
(00592) these were grafted from, so the wave adds five more instances of an established shape rather
than a new one — r9 recorded the same thing at its §5. Naming it again only because the count keeps
growing and a gate resolver is now among them.

---

## 4. Recorded, not findings

- **The studio-less residue is a standing ruling, not a defect.** Re-walked: a plain member of the
  designer's second design studio reads 0 site access cards, 0 authority grants, 0 compliance
  documents and 0 seats on the two jobs that RECORD their studio, and 0 through all four of 00627's
  definer readers on a job that records none. The residue 00624:277-298 names (the seats view, the
  Directory's party branch, `identity_phone_numbers()`' seat leg) applies only to the
  `studio_id IS NULL` population, which carries 0 seats locally. It is owed to Kody with R-BD's
  Strata count, as the file says.
- **`config.toml`'s two seed arrays** satisfy the file's own derivation rule (`config.toml:52-59`,
  `:60`, `:79-88`), with `people_crm_dev.sql` in both. Whether the Okonkwo fixture should reach
  staging stays Fable's call, as `w1b-report.md` §6 asks.
- **The local DB was this wave's sole owner** for this review: ledger read `555 / 20260910152111`
  before the first probe and after the last, both suites green at that state, every probe
  `ROLLBACK`ed.

---

## 5. Findings, ranked

| # | Severity | Confidence | Where | Claim |
|---|---|---|---|---|
| M1 | MAJOR | high | `00623:612-618`, `:592` | The r9 read-side supersede reckoning is one hop, so the ordinary second renewal (A→B→C) re-admits A's lapse the day B's own certificate expires: the card, the firm's crew rows and every seat line read `lapsed` over an in-force, non-superseded, gating COI, with no write at all |
| M2 | MAJOR | high | `00626:333-345`, `:1566`, `:1154`, `:1355` | `identity_seat_count()` has no tenant leg while `people_directory_seats` does, so a Directory row claims a seat_count it cannot nest — walked with no stamp, no adversarial write, two studios sharing a designer, and a both-studios control that agrees |
| m1 | MINOR | high | `00627:491` | The `project_review` tier reports `revoked_by` as `granted_by`: NULL while the grant is live, the closer once it is revoked, on a ledger built to say who opened the door |
| m2 | MINOR | high | `00627:26-39`, `:144`, `:235`; `w1b-report.md:205-209` | The banner's "closed at the grant level / dead policies / no ACL moved" premise is false (column-level grants exist and the readers return withheld columns), and the report's ruling request to Kody rests on it |
| m3 | MINOR | high | `00627:342-497` | `v_access_grants`' invoker branches inherit `is_studio_comember(designer)`; walked — the second studio reads 6 `field_link` rows, identical to the shipped door. Not a new door; belongs in the COMMENT |
| m4 | MINOR | high | `00627:459-478` | The `evidence_upload` tier returns 0 rows for every studio member (its only authenticated policy is platform-admin) |
| m5 | MINOR | medium | `00626:1153` | The Directory row's rule clause is the winning seat's, not the identity's, unlike the other three words |
| m6 | MINOR | high | `00626:1347` | All 21 firm rows carry a `consent_status` word R-G gives the company row no column for; the display split is unstated in the COMMENT |
| m7 | MINOR | high | `00626:1453` | `people_directory` is the wave's only relation with no explicit `REVOKE … FROM anon` (`anon` holds SELECT locally) |
| m8 | MINOR | high | `use-coordination.ts:715`, `:884` | Two live portal UPDATE writers of the frozen consent columns will raise `consent_legacy_column_frozen`; owed to W2, restated because the chain ships unflagged |
| m9 | MINOR | high | `00623:109`, `:603`, `:607` | `blocks` is freely member-editable with no audit, so the gating reckoning can be undone in one untraceable write — a ruling, not a defect |
| m10 | MINOR | high | `tests/rls/people_directory_scope_test.sql:298`; `tests/rls/field_parties_test.sql:120` | Two SQL suites are red on this branch; the first aborts before every one of its RLS-scope cases. Neither is in `KNOWN_FAILURES.md`; neither is named in the report |
| m11 | MINOR | medium | `00624:587-599`, `:636-639` | The `studio_contact_id` guard covers new writes only; no pass counts or repairs existing stamps and R-BD's W7 preflight does not look for them |
| m12 | MINOR | high | `w1b-report.md:333`, `:353-369`, `:383`, `:435-438`, `:580-583` | The report has drifted from the code across nine fix rounds — suite size, grant count, type diff, probe transcript and a retracted ruling request |
| m13 | MINOR | high | `00624:173`, `:238`, `:310`, `:342`; `00625:64` | Five more definer uuid→fact oracles answer any authenticated caller with no membership; the platform count is now eleven (recorded at r9 §5, restated) |

Probe files written this round, all under
`artifacts/people-room-crm-2026-09-11/build/` (`git add -f`), every one read-only or `ROLLBACK`ed:
`probe160-w1b-final-r10-supersede-chain.sql`, `probe161-w1b-final-r10-chain-calendar.sql`,
`probe162-w1b-final-r10-seatcount-two-studios.sql`, `probe163-w1b-final-r10-grants-visibility.sql`,
`probe164-w1b-final-r10-second-studio.sql`, `probe165-w1b-final-r10-minor-recheck.sql`,
`probe166-w1b-final-r10-oracles.sql`, `probe167-w1b-final-r10-transitive-fix.sql`.
