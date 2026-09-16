# W1b — final review, round 9 (migrations)

Adversarial review of `build/w1b-report.md` and the five migrations it names, read in full,
against `rulings.md` §3 (R-A … R-BE, all settled and not findings), `synthesis/direction.md`
§2.2/§3.8/§7/§8, `synthesis/crm-model.md` §1/§2/§4/§5, `briefing/current-state.md`,
`build/inventory.md`, `briefing/fixture.md`, and the prior rounds
(`w1a-report.md`, `w1a-close-review-r6-*`, `w1b-final-fix-log-r8.md`).

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local DB only. Nothing pushed to Strata.

**Verdict: NOT clean — 1 BLOCKING, 2 MAJOR, 8 MINOR.**

---

## 0. What I ran, and what it said

### The grep-winner rule, checked before reading any redefinition

```
$ cd .../supabase && for f in create_field_link people_directory channel_consent_status \
    project_consent_org is_active_studio_member is_studio_comember is_design_studio_comember \
    studio_contact_org project_party_designer is_org_admin_or_owner _primary_studio_for; do
    echo -n "$f -> "; grep -rln "CREATE OR REPLACE FUNCTION[^(]*$f\b" migrations/*.sql | sort | tail -1; done
create_field_link        -> migrations/00627_access_grants_and_field_link_window.sql
channel_consent_status   -> migrations/00594_studio_channel_consent.sql
project_consent_org      -> migrations/00594_studio_channel_consent.sql
is_active_studio_member  -> migrations/00417_studio_contacts.sql
is_studio_comember       -> migrations/00556_admin_studio_management.sql
is_design_studio_comember-> migrations/00399_journey_authority_integrity.sql
studio_contact_org       -> migrations/00592_people_cards_affiliations_rules.sql
project_party_designer   -> migrations/00592_people_cards_affiliations_rules.sql

$ grep -rln "CREATE OR REPLACE VIEW public.people_directory\b" migrations/*.sql | sort | tail -2
migrations/00594_studio_channel_consent.sql
migrations/00626_people_directory_v4_seats.sql
```

`create_field_link`'s graft is faithful: 00284's ownership guard, the NULL-uid internal bypass,
the supersede, the `encode(extensions.gen_random_bytes(32),'hex')` /
`extensions.digest(...,'sha256')` pair and the `RETURNING … INTO v_id` shape are all carried
verbatim; only `expires_at` is new (00284 relied on the column default). The party-branch columns
and the two consent reads in 00626 are byte-identical to 00594:1366-1408. **Lineage: OK.**

### Environment (`apps/designer-portal/.env.local` check)

There is no `apps/designer-portal/.env.local` in this worktree and no
`supabase/.temp/project-ref`, so `supabase db reset` is unambiguously local:

```
$ ls -la .../apps/designer-portal/ | grep -i env
.rw-r--r--@ 5.0k .env.example
$ cat .../supabase/.temp/project-ref   # (absent)
$ grep -n "supabase:reset" package.json
43:    "supabase:reset": "cd supabase && supabase db reset",
```

### Reset, twice

```
$ python3 scripts/generate-legacy-grants.py
wrote .../supabase/seed/00-legacy-grants.sql — baseline + 2719 replayed statements
$ git diff --numstat -- supabase/seed/00-legacy-grants.sql
   (no output — the committed seed already matches the migrations' GRANT/REVOKEs)

$ pnpm --dir .../agent-people-build supabase:reset      # pass 1
RESET1_EXIT=0
Seeding data from supabase/seed/people_crm_dev.sql...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
$ grep -in error /tmp/claude/w1b-r9-reset1.log
448:Applying migration 00458_sms_message_error_capture.sql...     # a FILENAME, not an error

$ pnpm --dir .../agent-people-build supabase:reset      # pass 2
RESET2_EXIT=0
$ grep -in error /tmp/claude/w1b-r9-reset2.log
448:Applying migration 00458_sms_message_error_capture.sql...

$ psql … -At -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
555|20260910152111
$ psql … -At -c "select version from supabase_migrations.schema_migrations
                  where version>='00620' and version<'20000000' order by version;"
00621 00622 00623 00624 00625 00626 00627
```

The seed replays: 36 compliance documents, 1 site access card, 49 `role='contact'` rows
(28 person + 21 company) after each pass.

### Both SQL suites, after each reset

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0
NOTICE:  All W1a assertions passed.

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0
NOTICE:  1. compliance_state: four words, the 30-day boundary both ways, worst-first precedence, a superseded lapse released, and a gateless lapse that changes nothing until it holds a gate: passed
NOTICE:  2. the holder guard: … a DATED paper may only be retired by a dated successor that is itself in force and carries at least the gates it retires: passed
NOTICE:  3. people_directory v4: one row per identity, Dana's two seats beneath it, her four fixture words, no person-level stage, an honest 28 + 21 …: passed
NOTICE:  4. the uncarded identity: two seats on two jobs collapse to one row keyed on the phone …: passed
NOTICE:  5. project_party_authority: a member records selections and is refused money and draw certification, an owner records both, and a non-member reads nothing (PR-n): passed
NOTICE:  6. copy_to: a seat on another job is refused, a seat on this one lands: passed
NOTICE:  7. the site access card: no code column and no client toggle (PR-r), four studio policies, a client reads nothing and anon is refused at the grant (PR-w): passed
NOTICE:  8. the key holder must be a seat on the card's own project: passed
NOTICE:  9. v_access_grants: F-08's field link ends with the engagement (PR-d) …: passed
NOTICE: 10. create_field_link: the engagement window sets the expiry …: passed
NOTICE: 11. the seat's new columns are writable by a member, the eight consent columns are still frozen …: passed
NOTICE: 12. the seeded fixture reads as the fixture …: passed
NOTICE: 13. the tenant boundary: one studio, on both sides …: passed
NOTICE: 14. a studio-less job: … the two SENSITIVE objects ask the RECORD …: passed
NOTICE: 15. the client branch inherits designer_clients' own posture exactly (6 row(s) each) …: passed
NOTICE: 16. the number set and the identity's consent word …: passed
NOTICE: 17. the designer's SECOND DESIGN STUDIO on a studio-less job …: passed
NOTICE:  All W1b assertions passed.
```

Re-run identically after reset pass 2 (`W1A_EXIT=0`, `W1B_EXIT=0`).

### Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
   (no output — the committed types already match the local schema)
$ # run a second time, byte-compared:
NO_DRIFT_BETWEEN_RUNS
```

### Re-check of every r8 finding

| r8 finding | Status | Evidence |
|---|---|---|
| BLOCKING-1 — a studio-less job admitted the designer's SECOND design studio to the site access card (read AND write) and to the money grant | **FIXED for those two objects** | `probe148` §A: as Z (plain member of `Leah Hartwell` only, `is_active_studio_member(LocalDev)=false`) `cards=0 grants=0 docs=0`; §D `UPDATE project_site_access_cards SET lockbox_version='Z WAS HERE'` → `UPDATE 0`, stored value still `Lockbox, version 3`. Policies read `is_active_studio_member(project_recorded_studio(project_id))` (00625:240, :250, :260, :274) / `project_party_recorded_studio(engagement_id)` (00624:768, :782, :798, :824) |
| BLOCKING-1 — the same mechanism elsewhere | **OPEN — see BLOCKING-1 below.** `project_tenant_org()` was not removed from 00627's three project-scoped definer readers | `probe156`, `probe157` |
| MAJOR-1 — `v_project_roster` printed `not_asked` over a recorded `opted_out` for a caller who cannot read the record | **FIXED** | `probe151` §Z: Z reads 24 roster rows on Okonkwo and `sms_consent_status` is NULL on every one; `Z non-null roster consent words anywhere = 0`. Owner/admin still read `granted`/`opted_out`/`pending` |
| r8 residue (seats view, Directory party branch, `identity_phone_numbers()`' seat leg, `assert_project_party_cards()` stay caller-relative) | recorded, block 17 asserts it, **not re-litigated here** | 00624:277-298 |

### Everything else the brief names, verified

| Brief item | Result |
|---|---|
| banner + lineage in all five files | present; each names its prior rounds (00623:52-81, 00624:100-132, 00625:32-46, 00626:111-200, 00627:5-11) |
| idempotent | `CREATE TABLE IF NOT EXISTS` + named `DROP CONSTRAINT IF EXISTS`/`ADD CONSTRAINT`, `CREATE INDEX IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`, `CREATE OR REPLACE`; two full resets clean |
| RLS in the same file | yes for all three new tables |
| explicit grants both directions + REVOKE FROM PUBLIC, anon on definer RPCs | yes; `probe154` §C shows every one of the 21 new/edited routines with `search_path` pinned and `acl = postgres,authenticated,service_role` (or `postgres,service_role` for the four `assert_*`) |
| SECURITY DEFINER pins search_path | all 11 definer routines: `search_path=public` (both `create_field_link` arities: `public, extensions, pg_temp`) |
| schema-qualify extension fns | `extensions.gen_random_bytes`, `extensions.digest` (00627:552-553). `gen_random_uuid()`/`md5()` are pg_catalog built-ins on PG15 |
| guarded crons | none added (the expiry sweep is P2) |
| CHECK over enum | `stage`, `site_access_mode`, `contracted_through`, `doc_type`, `doc_label`, `blocks`, `held_by`, `source`, `scope` all CHECKs, all named and drop/re-added |
| money integer cents | `project_party_authority.threshold_cents integer` (`probe154` §E); `$2,500 = 250000` asserted in suite block 12 |
| `compliance_state` incl. the 30-day window | one place, 00623:547-568, `expires_on <= CURRENT_DATE + 30`; boundary asserted both ways in block 1 |
| authority policy by role | `probe154` §C + suite block 5: member → `selections` lands, `money`/`draw_certify` refused; owner → both land; non-member → 0 rows |
| stage/window backfill | `completed → warranty` for all 7 Lindqvist seats, `stage='active'` guard, `completed_at` present on every completed project so the `updated_at` stand-in is unexercised locally |
| site access card: no client policy, no code column | `probe154`/suite block 7: 4 policies, all `is_studio_comember(project_designer(...))` + the tenant leg, zero code-like columns, anon refused at the GRANT |
| `people_directory` v4: one row per identity, every branch predicate carried, every reader column kept | 17 columns, positions 1-12 identical in name and type to 00594 (`probe154` §B). Every branch predicate compared line-by-line against 00594:1240-1457 — carried, plus the party branch's new tenant leg |
| `v_access_grants` union shapes | 11 tiers (7 in the view text + 4 in the definer readers), all 12 columns same order/type; `grant_id ~ '[0-9a-f]{64}'` → 0 rows |
| `create_field_link` grafted with the window expiry | see above; suite block 10 |
| dev seed replays; reset twice | yes |
| no new object reads a frozen `sms_consent_*` column | `probe154` §D/§5: 0 routines, and `pg_get_viewdef` on both views → `reads_frozen = f`. The freeze trigger still names exactly the ten columns (`phone`, `phone_e164` + the eight) |
| `config.toml` `[db.seed]` derivation invariant | `people_crm_dev.sql` in BOTH arrays (config.toml:88, :60), per the file's own stated rule |

---

## 1. BLOCKING-1 — 00627's three project-scoped definer readers kept the caller-relative tenant leg r8 removed from the sensitive objects: a plain member of the designer's SECOND design studio reads the owning studio's invoice-pay, plan-transmittal and RFQ grant ledger

`supabase/migrations/00627_access_grants_and_field_link_window.sql:122-125`, `:206-207`,
`:251-259`.

r8 BLOCKING-1 established that `is_active_studio_member(project_tenant_org(p))` is **not** a
tenant gate: `project_tenant_org()`'s second leg (00624:171-188) answers with *the caller's own*
active non-guest design studio whenever the job's designer / lead designer / creator also belongs
to it, so on a `projects.studio_id IS NULL` project the predicate is self-satisfying. The fix moved
`project_site_access_cards` and `project_party_authority` onto `project_recorded_studio()`
(00624:299-307). **The four definer readers in 00627 were not moved**, and three of them resolve
`project_tenant_org()`:

```sql
-- 00627:122-125   access_grants_trade_rfq
  WHERE public.is_design_studio_comember(pr.designer_id)
    AND (pr.project_id IS NULL
         OR public.is_active_studio_member(public.project_tenant_org(pr.project_id)));
-- 00627:206-207   access_grants_plan_transmittals
  WHERE public.is_active_studio_member(public.project_tenant_org(pj.id))
    AND public.is_design_studio_comember(pj.designer_id);
-- 00627:251-259   access_grants_invoice_links
  WHERE public.is_design_studio_comember(inv.designer_id)
    AND (CASE WHEN inv.studio_id IS NOT NULL THEN public.is_active_studio_member(inv.studio_id)
              WHEN inv.project_id IS NOT NULL
                THEN public.is_active_studio_member(public.project_tenant_org(inv.project_id))
              ELSE true END);
```

These are SECURITY DEFINER and 00627's own banner (`:41-42`) states the consequence: *"BECAUSE
THESE FOUR ARE DEFINER, EACH ONE'S WHERE CLAUSE IS THE WHOLE ACCESS RULE — there is no RLS behind
it"*. All four are `GRANT EXECUTE … TO authenticated`, so PostgREST publishes them at
`/rest/v1/rpc/<name>`. And the three base tables are closed to `authenticated` at table level, so
the reader is the *only* authenticated door:

```
$ psql … -c "select relname, has_table_privilege('authenticated','public.'||relname,'SELECT') from pg_class
             where relname in ('trade_rfq_tokens','plan_transmittal_tokens','invoice_links','studio_trade_agreement_tokens');"
 trade_rfq_tokens              | f
 plan_transmittal_tokens       | f
 invoice_links                 | f
 studio_trade_agreement_tokens | f
```

### The walk (`probe156`, `probe157`; actor Z = `client@patina.dev`, a plain `member` of `Leah Hartwell` — the designer's SECOND design studio — and of nothing else)

Premise, read as Z:

```
 Z is_active_studio_member(LocalDev)      | false
 Z project_tenant_org(Aspen, studio-less) | 76db060f-0654-4502-94b1-00000c4e8dd3   ← Z's OWN studio
 invoice e142: studio_id / project_id / project.studio_id
                                          | <null> / b0000000-…-0000000000d1 / <null>
```

Two ordinary studio acts by the owning studio — mint a pay link on its own invoice, mint a plan
transmittal link on its own job (both on `Aspen Loft Refresh`, `studio_id IS NULL`, one of **5 of 8**
local projects) — and one RFQ token on a proposal that records no project. Then, as Z:

```
-- access_grants_invoice_links()
 grant_id                                         | tier        | scope_id (invoice)                   | granted_at | last_used_at
 invoice_pay:ad000000-0000-4000-8000-000000000001 | invoice_pay | b0000000-0000-0000-0000-00000000e142 | 2026-09-12 | 2026-09-12 18:44:53+00

-- access_grants_plan_transmittals()
 grant_id                                       | tier      | scope_id (project)                   | granted_by                           | expires_at | last_used_at
 plan_link:ae000000-0000-4000-8000-000000000003 | plan_link | b0000000-0000-0000-0000-0000000000d1 | a0000000-0000-0000-0000-000000000004 | 2026-12-11 | 2026-09-11 20:47:06+00

-- access_grants_trade_rfq()
 grant_id                                      | tier     | subject_id (seat)                    | scope_id (proposal)                  | expires_at
 rfq_link:ad000000-0000-4000-8000-000000000002 | rfq_link | d0e30000-0000-0000-0000-000000000004 | b0000000-0000-0000-0000-000000000002 | 2026-10-12

-- and through the ledger view itself
 tier        | count
 invoice_pay |     1
 rfq_link    |     1

-- Z cannot reach any of it any other way
NOTICE:  Z invoice_links direct: permission denied
NOTICE:  Z reads plan_transmittal_tokens.created_by DIRECTLY: permission denied
NOTICE:  Z reads plan_transmittal_tokens.token_hash DIRECTLY: permission denied
NOTICE:  Z reads trade_rfq_tokens.created_by DIRECTLY: permission denied
```

Negative controls, same probe, same rows:

```
 Y manufacturer co-member of the same designer | invoice_pay 0 | rfq_link 0   ← r6 BLOCKING-1 stays closed
 X unrelated design-studio owner               | invoice_pay 0 | rfq_link 0
 ADMIN of the studio doing the work            | invoice_pay 1 | rfq_link 1   ← positive control
```

### Why this is BLOCKING and not the recorded r8 residue

- The actor is the same actor r8 graded BLOCKING: a member of the designer's second design studio,
  never a member of the studio doing the work.
- 00624:277-298 enumerates exactly three objects that deliberately stay on `project_tenant_org()`
  (the seats view, the Directory's party branch, `identity_phone_numbers()`' seat leg) plus
  `assert_project_party_cards()`, each with an argument for why narrowing it would be a regression.
  **The 00627 readers are not in that list**, and no such argument exists for them — nothing in this
  program reads `v_access_grants` yet, so narrowing them regresses no shipped surface.
- The COMMENTs actively claim the opposite. 00627:136-137 says *"TENANT FIRST, then the shipped
  predicate"*; 00627:221-223 says *"TENANT FIRST, then that dead policy's own predicate"*;
  00627:273-275 says *"TENANT FIRST — invoices.studio_id when the invoice names one, else the tenant
  of its project through project_tenant_org()"*. Each concedes only the *record-names-nothing*
  population (a proposal with no project, an invoice with neither studio_id nor project_id). None
  concedes the far larger `projects.studio_id IS NULL` population, where the leg is self-satisfying —
  which is verbatim r8 BLOCKING-1's own sentence: *"the sentence in the COMMENT below described a
  LIVE behaviour rather than a closed defect"* (00625:36-37).
- What leaks is the shape of another studio's paperwork — which invoices have live pay links and when
  each was last viewed, which jobs have live plan transmittals and who opened each door, which seat
  on which proposal was sent an RFQ — which is exactly the harm r6 BLOCKING-1 named. No bearer
  credential is exposed (`grant_id ~ '[0-9a-f]{64}'` → 0 rows), which is why this is a read, not an
  escalation.

### The fix, and its cost stated

Replace `project_tenant_org()` with `project_recorded_studio()` (00624:299-307) in all three,
i.e. the r8 remedy carried to 00627:

```sql
-- 00627:206-207
  WHERE public.is_active_studio_member(public.project_recorded_studio(pj.id))
    AND public.is_design_studio_comember(pj.designer_id);
```

The cost is r8's own cost, and should be stated in each COMMENT the way 00625:42-46 states it: on
the `studio_id IS NULL` population **no** studio reads those three tiers of the ledger until R-BD's
W3 backfill names a studio. The genuinely tenant-less populations (`pr.project_id IS NULL`,
`inv.studio_id IS NULL AND inv.project_id IS NULL`) have no record to gate on and must stay on
`is_design_studio_comember` alone — that residue is already stated and is fine; it is the
project-bearing population that must stop asking the caller.
`access_grants_trade_agreement_links()` (00627:171) needs no change: `studio_contact_org()` is
record-based with no caller-relative leg.

A suite leg belongs beside block 17: the same actor, 0 rows from all four readers and from
`v_access_grants`' four definer tiers, on a job that records no studio — with the working studio's
own admin as the mutation control on a job that records one.

---

## 2. MAJOR-1 — the compliance supersede invariants are enforced only at the instant `superseded_by` is written, and `blocks` is outside the trigger entirely: three ordinary member writes put `current` on a firm holding no in-force gating certificate, with the lapse still on file

`supabase/migrations/00623_studio_compliance_documents.sql:414-433` (the two r3/r4 guards),
`:476-480` (the trigger), `:547-568` (`compliance_state`).

```sql
-- 00623:476-480
CREATE TRIGGER assert_compliance_holder_trg
  BEFORE INSERT OR UPDATE OF holder_id, holder_type, organization_id,
                             superseded_by, doc_type, expires_on
  ON public.studio_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION public.assert_compliance_holder();
```

`blocks` is not in that column list, and `assert_compliance_holder()`'s whole successor block is
wrapped in `IF NEW.superseded_by IS NOT NULL THEN` (00623:294) — so it examines the row's *own*
successor and never the rows that point **at** the row being written. Both r3/r4 invariants —
*"a renewal must still be in force"* and *"a renewal carries at least the gates of the paper it
retires"* — are therefore point-in-time assertions about the moment the pointer is created, and
nothing re-checks them afterwards.

### The walk (`probe152` §F2, all writes as `studio_manager@patina.dev`, a plain `admin` of the owning studio, each an ordinary `PATCH`/`POST` a portal or PostgREST caller can make)

```
-- the fixture's F-11 lapse
 id                                   | doc_type | expires_on | blocks             | superseded_by
 d0e50000-0000-0000-0000-000000000006 | coi_gl   | 2026-03-31 | {site_access,draw} |
 d0e50000-0000-0000-0000-000000000008 | license  | 2027-12-31 | {}                 |
 d0e50000-0000-0000-0000-000000000007 | w9       |            | {payment}          |

 BEFORE: compliance_state(Northgate) | lapsed

-- write 1: record an honest in-force renewal carrying both gates (every r1–r4 guard passes)
INSERT … coi_gl, expires_on = CURRENT_DATE + 200, blocks = {site_access,draw}
-- write 2: point the 2026-03-31 lapse at it (same doc_type, later date, dated, head of chain,
--          in force, gates carried — all ten guards pass)
UPDATE … SET superseded_by = <the renewal>
 after an honest supersede | current            ← correct: real cover is on file

-- write 3: back-date the successor. The trigger FIRES (expires_on is in the UPDATE OF list) but
--          the guard body is skipped, because the successor's own superseded_by is NULL.
UPDATE … SET expires_on = CURRENT_DATE - 1
 successor back-dated (trigger fires, guard body skipped) | lapsed    ← still honest

-- write 4: empty the successor's gates. The trigger does NOT fire at all.
UPDATE … SET blocks = '{}'
 successor de-gated (trigger does NOT fire) | current
 in-force gating coi_gl on file?            | 0
```

The card now reads `current` while:

- the 2026-03-31 certificate is still on file and its own row still says
  `blocks = {site_access,draw}`,
- its successor is expired,
- `count(*) FILTER (WHERE superseded_by IS NULL AND doc_type='coi_gl' AND expires_on >= CURRENT_DATE) = 0`.

`identity_paper_state()` (00626:499-522) reduces worst-first over the person's card **and their
firm**, so this propagates to every reader in one hop: Dana Kowalski's Directory row and both her
seat lines flip from `lapsed` to `current`, which is r3 MAJOR-1's consequence sentence verbatim
(00623:384-394). Two of the four writes are honest studio acts; the two that do the damage are edits
to a row the studio legitimately owns.

### A one-write variant, and why I still grade this MAJOR rather than MINOR

`UPDATE studio_compliance_documents SET blocks='{}'` on the lapsed certificate alone also flips the
word (`probe152` §F1: `lapsed → current`, `the lapse still on file? true`). Taken by itself that is
defensible — the studio has asserted that this paper gates nothing, and `compliance_state()` honours
the record, so record and reader agree. I have filed that as MINOR-1.

§F2 is different in kind, and is a genuine record/reader disagreement: the row that carries
`{site_access,draw}` and a passed expiry is still on file, unchanged, saying exactly that — and the
word is `current`. Nothing in the record says that certificate stopped gating; what happened is that
the *successor* was de-gated after the fact, and the guard that exists to forbid precisely that
(`compliance_successor_drops_a_gate`, 00623:424-433) cannot see it. Under this review's classes
that is *"a reachable write path leaves the record and a reader disagreeing"* → MAJOR. It is also the
fifth door to the same consequence (r1 MAJOR-4, r2 MAJOR-1 a and b, r3 MAJOR-1, r4 MAJOR-1), and the
first four were each graded MAJOR.

### The fix

Put the reckoning in the reader, where no later write can outrun it. `compliance_state()` currently
drops every `superseded_by IS NOT NULL` row unconditionally (00623:567). Drop a row only when its
successor still earns it:

```sql
   WHERE d.holder_id = p_holder_id
     AND (d.superseded_by IS NULL
          OR NOT EXISTS (                       -- the retirement is honoured only while the
            SELECT 1 FROM public.studio_compliance_documents s   -- successor is in force and
             WHERE s.id = d.superseded_by                        -- carries this row's gates
               AND (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
               AND d.blocks <@ s.blocks))
```

That is one formula, in the one place direction §3.8 says the word lives, and it makes writes 3 and 4
inert. Adding `blocks` to the trigger's `UPDATE OF` list is worth doing too, but it is not sufficient
on its own: the trigger fires on the row being written and would still not see its predecessors.

---

## 3. MAJOR-2 — `project_parties.studio_contact_id` is the one pointer of the R-AP family with no card guard, and v4 makes it the identity key: one ordinary UPDATE drops a seated human out of their own studio's Directory and makes another studio's row claim a seat it cannot nest

`supabase/migrations/00626_people_directory_v4_seats.sql:1226`, `:1490-1504`, `:333-345`;
`supabase/migrations/00624_project_party_window_and_authority.sql:563-567`.

00626's party branch excludes every stamped seat — `AND pp.studio_contact_id IS NULL` (00626:1226) —
on the stated ground that *"a seat carrying a studio_contact_id has its identity in the CONTACTS
branch"* (00626:1364-1365). `people_directory_seats.person_id` `COALESCE`s to that same stamp
(00626:1490-1491), and `identity_seat_count()` keys on it through `party_identity_key()`, whose first
precedence leg is the stamp (00626:222-228). The whole v4 identity model therefore rests on one
assumption: **the stamp names a card in the seat's own studio.**

Nothing enforces it. `studio_contact_id` is a bare FK into `studio_contacts`, which holds every
studio's cards — the exact hole 00592's R-AP closed for `paperwork_contact_person_id`,
`signer_person_id` and `site_contact_person_id`, that 00623's `assert_compliance_holder()` closes for
`holder_id`, and that 00624's own `assert_project_party_cards()` closes for the two pointers this
wave adds. That trigger fires on `company_id, warranty_contact_person_id, project_id`
(00624:565) — `studio_contact_id` is not on it, and no other trigger on `project_parties` names it:

```
$ psql … -c "select t.tgname, (select string_agg(a.attname,' ' order by a.attname)
              from unnest(t.tgattr) col join pg_attribute a on a.attrelid=t.tgrelid and a.attnum=col)
              from pg_trigger t where t.tgrelid='public.project_parties'::regclass and not t.tgisinternal;"
 assert_project_party_cards_trg  | company_id project_id warranty_contact_person_id
 refuse_legacy_consent_write_trg | phone phone_e164 sms_consent_disclosure_version … sms_opt_out_at
 fc_optin_invite_dispatch        |
 normalize_phone_project_parties |
 set_updated_at_project_parties  |
```

`project_parties_studio_update` tests only the project (`is_studio_comember(p.designer_id)`), never
the value written, so `PATCH /rest/v1/project_parties?id=eq.<seat>` with any card uuid lands.

### The walk (`probe153`; the writer is `designer@patina.dev`, owner of BOTH `Local Dev Studio` and `Leah Hartwell`, which is the shipped local shape)

```
BEFORE, as the ADMIN of the studio doing the work:
 directory rows for Ngozi | 1     seats for Ngozi | 1     roster rows for Ngozi | 1

the write — re-stamp her Okonkwo seat with a card belonging to the OTHER studio:
 UPDATE project_parties SET studio_contact_id='<a Leah Hartwell person card>' … → UPDATE 1

AFTER, as the ADMIN of the studio doing the work:
 Ngozi seat row: person_id / consent / paper
   | ab000000-0000-4000-8000-000000000001 | granted | not_on_file     ← nests under a card it cannot read
 orphan seats now                                 | 3   (was 2, both documented at 00626:1470-1484)
 site access card key holder still names her seat  | true
 roster rows for Ngozi                             | 1

AFTER, as Z (a plain member of the OTHER studio):
 Z directory rows for the foreign card | 1
 Z seat_count claimed on that row      | 1
 Z seats nested under it               | 0
 Z consent word on that row            | <null>
```

Two consequences, each a reader disagreeing with the record:

1. **The working studio loses the human from its own Directory while the job still shows her.** Her
   seat is excluded from the party branch (stamped) and her identity is not in the contacts branch
   (the stamp names a foreign card), so her Directory row's `identity_seat_count(sc.id::text)` is
   now 0 for a person who is seated on the Okonkwo residence and named as the site access card's key
   holder. `v_project_roster` and `people_directory_seats` still carry the seat; the Directory does
   not. Before 00626 the stamped seat emitted its own party-branch row, so this consequence is new
   to v4.
2. **The r1 MAJOR-2 invariant breaks.** 00626:1463-1465 promises *"no Directory row ever claims a
   seat_count it cannot nest"*, and the suite's block 4 asserts it over the seeded fixture. Z's row
   claims 1 and nests 0, because `identity_seat_count()` is SECURITY INVOKER over `project_parties`
   (RLS `is_studio_comember(designer)`) while `people_directory_seats` additionally requires
   `is_active_studio_member(project_tenant_org(project_id))` (00626:1566). The two predicates are not
   the same set, and a cross-tenancy stamp is what separates them.

### The fix

Extend `assert_project_party_cards()` to `studio_contact_id` and add the column to the trigger's
`UPDATE OF` list. Two constraints on the shape, both from the shipped writer:

- **Kind-agnostic.** 00418's fold pass D2 (`00418_studio_contacts_backfill.sql:321-332`) legitimately
  stamps a **company** card on a `vendor_id`-bearing seat, so "must be a person card" would be wrong.
  The test is org membership only.
- **Same resolver as the rest of the function.** Use `project_tenant_org()`, not
  `project_recorded_studio()` — 00624:290-293 records that a record-only tenant *there* is r7
  BLOCKING-1's inversion, refusing the working studio's own cards on its own studio-less job. The
  existing `party_card_project_has_no_studio` branch (00624:498-503) then already covers the
  NULL case, and it costs nothing locally: all five studio-less local projects carry 0 seats
  (`probe154`: `Aspen 0 · Birch Hollow 0 · Chen 0 · Marrow & Vale 0 · Olsen 0`), and 00418's fold
  itself only ever stamps where `pj.studio_id IS NOT NULL` and `sc.organization_id = pj.studio_id`.

Suite legs: the walked write refused with a named error, and a mutation control landing the same
stamp with the project's own card.

---

## 4. MINOR findings

### MINOR-1 — `compliance_state()`'s whole gating reckoning rests on a freely member-editable `blocks` with no audit trail

`00623:109` (`blocks text[] NOT NULL DEFAULT '{}'`), `:556`/`:560`, `:476-480`.
One `UPDATE … SET blocks='{}'` by a plain admin flips Northgate Electric from `lapsed` to `current`
with the 2026-03-31 certificate untouched (`probe152` §F1). Record and reader agree afterwards, which
is why this is MINOR rather than part of MAJOR-1 — but it means the r3/r4 guard family can never
deliver the invariant its COMMENT claims (*"record the gates on the renewal, or do not retire the
lapse"*, 00623:431-432): the one-write path is always available and leaves no trace of who removed
the gate. If `blocks` is meant to be the studio's own judgement then that is fine and the COMMENT
should say so; if it is meant to be load-bearing for the `site_access`/`draw` gates it wants either
the `verified_by`/`verified_at` treatment or an append-only change record. A ruling, not a defect.

### MINOR-2 — the definer readers return two columns 00424's and 00429's column-level GRANTs deliberately withhold, and the banner's premise for them is factually wrong

`00627:26-39` and `:32` (*"NO SHIPPED TABLE'S ACL IS MOVED HERE"*), `:116`, `:200`, `:246`;
`w1b-report.md:205-209`.

The banner says those tables have no SELECT grant for `authenticated` and that their `FOR ALL TO
authenticated` policies *"cannot fire today"* and are *"dead"*. Both tables carry **column-level**
grants:

```
$ psql … -c "select a.attname, a.attacl::text from pg_attribute a
             where a.attrelid='public.trade_rfq_tokens'::regclass and a.attnum>0 and a.attacl is not null;"
 id | rfq_request_id | proposal_id | party_id | status | expires_at | last_used_at | created_at   → all {authenticated=r/postgres}
$ … same for plan_transmittal_tokens: id, transmittal_id, project_id, status, expires_at,
  first_opened_at, view_count, last_used_at, created_at
$ grep -n "GRANT SELECT (" migrations/00424_trade_rfq_rail.sql migrations/00429_plan_room_foundation.sql
00424_trade_rfq_rail.sql:253:GRANT SELECT (
00429_plan_room_foundation.sql:2169:GRANT SELECT (
$ psql … -c "set role authenticated; select id from public.trade_rfq_tokens limit 1;"   → succeeds (0 rows)
```

So the policies *do* fire, and the column list was chosen to withhold `token_hash`, `created_by` and
`updated_at`. `access_grants_trade_rfq` (00627:116) projects `t.created_by` and `t.updated_at`;
`access_grants_plan_transmittals` (00627:200-202) projects `p.created_by` and `p.updated_at`. Walked:
Z reads `granted_by = a0000000-…-000000000004` through the reader while a direct
`select created_by from plan_transmittal_tokens` is `permission denied` (`probe157`). Small in
itself; two things follow:

- `:32`'s claim is not true — a definer reader that returns withheld columns moves the effective ACL.
  Say what the readers widen, as the other COMMENTs in this wave do.
- `w1b-report.md:205-209` asks Fable to rule on granting `authenticated` SELECT to *"restore the
  posture they plainly intend"*. The premise is wrong (the posture already works, at column level)
  and acting on it would additionally expose `trade_rfq_tokens.token_hash` and
  `plan_transmittal_tokens.token_hash`. That item should be withdrawn or restated before Kody sees it.

### MINOR-3 — `v_access_grants`' seven invoker branches inherit base predicates broader than the tenant conjunct this wave applies everywhere else

`00627:292-447`. `field_link_tokens_studio_rw`, `site_access_designer_read` and
`project_review_access_studio_read` all carry `is_studio_comember(designer)` — the any-org predicate
r5/r6 spent two rounds narrowing elsewhere. Walked (`probe149`): Z reads **6 `field_link` rows** of
the Okonkwo residence and Lindqvist kitchen, plus `client_account` rows, through the ledger. This is
not a new door — `field_link_tokens` carries column/table SELECT for `authenticated` and the same
caller can `GET /rest/v1/field_link_tokens` — and direction §7 explicitly defers `v_access_grants`'
RLS "to each base table", so I grade it MINOR on the r6 MAJOR-2 precedent (*"THIS VIEW IS NOT THE
DOOR"*). It belongs in the view's COMMENT the way r6 MAJOR-2's four branches belong in
`people_directory`'s, because the ledger's whole purpose is to gather those doors onto one surface.

### MINOR-4 — the `evidence_upload` tier is unreachable for the studio that minted the door

`00627:415-428`. `fulfillment_evidence_upload_tokens`' only `authenticated` SELECT policy is
`fulfillment_evidence_upload_tokens_select_admin`, gated on a platform `user_roles` row with
`r.domain='admin'`; the other is `TO agent_reader`. So that branch returns 0 rows for every studio
member, and `v_access_grants` can never answer "what upload doors are open on this exception" for the
studio. Read-only, no leak; a completeness gap worth naming in the branch's comment.

### MINOR-5 — the Directory row's rule clause is the winning seat's, not the identity's

`00626:1153`: `public.contact_rule_summary('engagement', q.id)` where `q.id` is the `DISTINCT ON`
winner. `reach_state`, `consent_status` and `seat_count` on that same row were all lifted to the
identity across r2/r3/r4; the per-job rule override (E7's *"one per-job override owned by the seat"*,
crm-model §1) was not. An uncarded identity holding two seats where the *non-winning* one carries the
override prints "no rule on file" on the Directory row while the seat line beneath prints the rule —
against R-S (*"a blocked rule clause prints wherever a rule is shown"*). Not walkable on the seeded
fixture: Rivera Finishes, the one uncarded identity, holds a single seat
(`probe158`), and no engagement-subject rule is seeded. Code-grounded, confidence medium. Either
reduce the same way the other three words do, or state in the COMMENT that the rule is deliberately
the winning seat's.

### MINOR-6 — firm cards carry a `consent_status` word the company row has no column for

`00626:1347`: `identity_consent_status(sc.organization_id, sc.id::text, sc.phone_e164)` runs on every
contacts row, firms included. `probe158`:

```
 display_name                          | kind    | consent_status | paper_state
 Ashgrove Millwork                     | company | not_asked      | current
 City of Minneapolis, CPED Inspections | company | not_asked      | not_on_file
```

R-G fixes the company row at two bordered word columns (paper, payee marker) with no consent column,
so this is a display rule left in the app — the same posture as R-A/C13's paper word. But the view's
COMMENT names the R-A split explicitly (00626:1381-1383) and says nothing about this one. One
sentence, so a later reader does not print it.

### MINOR-7 — `people_directory` is the only relation of this wave with no `REVOKE … FROM anon`

`00626:1453` is a bare `GRANT SELECT ON public.people_directory TO authenticated`, while
`people_directory_seats` (00626:1605) and `v_access_grants` (00627:465) both `REVOKE ALL … FROM
PUBLIC, anon` first. Locally `anon` holds SELECT on the view from `seed/00-legacy-grants.sql`'s
blanket, and `anon` reads nothing through it — `permission denied for table studio_contacts`, because
`security_invoker` checks the base ACL — so there is no exposure and w1b-report.md §7 already names
the artefact. Worth one line for consistency, since 00623/00624/00625 all revoke explicitly and the
wave's own rule is "revoked explicitly rather than left to creation defaults" (00625:30).

### MINOR-8 — two portal writers of the frozen consent columns will now raise in production paths

`packages/supabase/src/hooks/use-coordination.ts:715` and `:884` both `UPDATE project_parties SET
sms_consent_status = …`, which `refuse_legacy_consent_write_trg` refuses with
`consent_legacy_column_frozen`; `:700` and `:865` still `.eq('sms_consent_status','opted_out')`
against a column R-AY says nothing but the backfill reads; `:495` writes it on INSERT, which the
UPDATE-only freeze allows. Already on record as owed to W2 in both `w1a-report.md` §8 and
`w1b-report.md` §8, so not a new W1b defect — restated because these are live write paths, not reads,
and the program ships in one chain with no flag (rulings §6).

---

## 5. Two things that are not findings, recorded

- **`project_recorded_studio()`, `project_party_recorded_studio()`, `project_designer()` and
  `project_tenant_org()` are uuid→fact oracles.** All four are SECURITY DEFINER, `GRANT EXECUTE … TO
  authenticated`, with no membership gate, so any authenticated caller holding a project or seat uuid
  learns its `studio_id` and `designer_id`. Walked as an unrelated studio owner who reads 0
  `project_parties` rows: `project_recorded_studio(Okonkwo) = b0000000-…-0001`,
  `project_designer(Okonkwo) = a0000000-…-0004` (`probe158`). Identical posture to the shipped
  `project_consent_org()` (00594) and `project_party_designer()` (00592), which are the pattern these
  were grafted from, so this wave introduces four more instances of an established shape rather than a
  new one. Naming it because the count of such oracles is now eleven.

- **The local DB was not this wave's sole owner during the review.** After my reset pass 2 returned
  `RESET2_EXIT=0`, a second process reset the same stack: `auth.users` read 0,
  `public.profiles` did not exist, and the ledger climbed `184 → 385 → 478 → 550 → 555` over ~20s
  while I was querying. Everything in this report was taken after the DB settled at
  `555 / 20260910152111` with `00621…00627` applied, both suites re-run green at that state, and each
  probe re-checked against it. Flagging it because the brief's premise did not hold and a future round
  should confirm the ledger head before trusting a probe.

---

## 6. Findings, ranked

| # | Severity | Confidence | Where | Claim |
|---|---|---|---|---|
| B1 | BLOCKING | high | `00627:122-125`, `:206-207`, `:251-259` | Three definer readers keep `project_tenant_org()`'s caller-relative tenant leg; on `studio_id IS NULL` projects a plain member of the designer's second design studio reads the owning studio's invoice-pay, plan-transmittal and RFQ grant ledger through the only authenticated door to those tables |
| M1 | MAJOR | high | `00623:414-433`, `:476-480`, `:547-568` | The supersede in-force and drops-a-gate invariants are point-in-time only and `blocks` is outside the trigger, so member writes leave a lapsed gating certificate on file while the card reads `current` with no in-force cover |
| M2 | MAJOR | high | `00626:1226`, `:1490-1504`, `:333-345`; `00624:563-567` | `project_parties.studio_contact_id` has no card/studio guard, so one UPDATE drops a seated human from their own studio's Directory and makes another studio's row claim a seat it cannot nest |
| m1 | MINOR | high | `00623:109`, `:556`, `:560` | `blocks` is freely member-editable with no audit, so the gating reckoning — and the r3/r4 guard family's stated invariant — can be undone in one write |
| m2 | MINOR | high | `00627:26-39`, `:116`, `:200`; `w1b-report.md:205-209` | The four readers return `created_by`/`updated_at` that 00424/00429 withhold at column level; the banner's "no SELECT grant / dead policies / no ACL moved" premise is wrong and the report's §5 ruling request rests on it |
| m3 | MINOR | high | `00627:292-447` | `v_access_grants`' invoker branches inherit `is_studio_comember(designer)` from three base tables; walked — Z reads 6 Okonkwo/Lindqvist `field_link` rows. Not a new door; belongs in the COMMENT |
| m4 | MINOR | high | `00627:415-428` | The `evidence_upload` tier returns 0 rows for every studio member (its only authenticated policy is platform-admin) |
| m5 | MINOR | medium | `00626:1153` | The Directory row's rule clause is the winning seat's, not the identity's, unlike the other three words |
| m6 | MINOR | high | `00626:1347` | Firm contacts rows carry a `consent_status` word R-G gives the company row no column for; the display split is unstated in the COMMENT |
| m7 | MINOR | high | `00626:1453` | `people_directory` is the wave's only relation with no explicit `REVOKE … FROM anon` |
| m8 | MINOR | high | `use-coordination.ts:715`, `:884` | Two live portal UPDATE writers of the frozen consent columns will raise `consent_legacy_column_frozen`; already owed to W2, restated because the chain ships unflagged |

Probe files written this round, all under
`artifacts/people-room-crm-2026-09-11/build/` (`git add -f`):
`probe147b-w1b-final-r9-base-rls.sql` (base-table RLS/grants, rule uniqueness, the freeze list, the
backfill), `probe147c-w1b-final-r9-populations.sql` (tenant-less populations, project `studio_id`s),
and `probe148`–`probe158-w1b-final-r9.sql`. Every one is read-only or `ROLLBACK`ed; the local DB is
unchanged and both suites were re-run green after the last probe
(`555 / 20260910152111`, `W1A_EXIT=0`, `W1B_EXIT=0`, 18 `passed` NOTICEs).
