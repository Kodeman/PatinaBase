# W1b — final review round 9, fix log

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). Nothing touched on
Strata. No `.env.local` exists in this worktree and there is no
`supabase/.temp/project-ref`, so `supabase db reset` is unambiguously local.

Scope: exactly the three findings of `w1b-final-review-r9-migrations.md`
(B1 BLOCKING, M1 MAJOR, M2 MAJOR), under every ruling in `rulings.md` §3.
R-AW held throughout: not one object reads a seat for consent; nothing in
these edits touches a consent path at all.

The eight MINORs of that round and the one MINOR of
`w1b-final-review-r9-tests.md` (F-12 Pete Rusk's seeded `reach_state`) are
**not** in this pass and are untouched.

---

## B1 (BLOCKING) — 00627's three project-scoped definer readers now ask the RECORD

`supabase/migrations/00627_access_grants_and_field_link_window.sql`

- `access_grants_trade_rfq()`, `access_grants_plan_transmittals()` and
  `access_grants_invoice_links()` resolve
  `public.project_recorded_studio(...)` (00624 §1c) where they resolved
  `public.project_tenant_org(...)`. One expression each; nothing else about
  the three bodies moved.
- `access_grants_trade_agreement_links()` unchanged —
  `studio_contact_org()` is record-based with no caller-relative leg, exactly
  as the finding says.
- The genuinely tenant-less populations are left alone and still stated:
  `pr.project_id IS NULL` (a proposal recording no project) and
  `inv.studio_id IS NULL AND inv.project_id IS NULL` (00588's standalone
  studio invoice) stay on `is_design_studio_comember` alone.
- The cost is now written into all three COMMENTs, in 00625:42-46's voice: on
  the `projects.studio_id IS NULL` population **no** studio reads those three
  tiers until R-BD's W3 backfill names one. The banner carries the same
  paragraph with the walk.

Catalog read-back after two resets (`probe159` §A):

```
               proname               |      tenant_leg
-------------------------------------+----------------------
 access_grants_invoice_links         | record
 access_grants_plan_transmittals     | record
 access_grants_trade_agreement_links | record (contact org)
 access_grants_trade_rfq             | record
```

Walked (`probe159` §B1). Actor Z = `client@patina.dev`
(`a0000000-…-0005`), a plain `member` of a second design studio the job's
designer of record owns, and of nothing else. Three ordinary grants minted by
the working studio on `Aspen Loft Refresh` (`studio_id IS NULL`) and the same
three on `Okonkwo residence` (which records its studio):

```
 z_member_of_working_studio | z_design_comember |         caller_relative_leg          | record_leg | studioless_invoice_studio_id
----------------------------+-------------------+--------------------------------------+------------+------------------------------
 f                          | t                 | f1000000-0000-4000-8000-0000000000ff |            |

--- Z, through the four definer readers and the ledger (studio-less job) ---
 invoice_pay                 |     0
 plan_link                   |     0
 rfq_link                    |     0
 agreement                   |     0
 v_access_grants (the three) |     0

--- the working studio's ADMIN: the mutation control ---
 invoice_pay (recorded)                     |     1
 plan_link (recorded)                       |     1
 invoice_pay (studio-less: the stated cost) |     0
 plan_link (studio-less: the stated cost)   |     0
```

The premise still holds — the caller-relative resolver still names Z's own
studio and `is_active_studio_member()` over it is still true — so the fix is
not in the conjunct: the readers stopped asking it.

**Suite leg: block 18**, beside block 17 and with block 17's own actor
(`a0000000-…-0002`, the ordinary member of Test Studio B). It mints one grant
on each of the three project-bearing tiers on the studio-less job, asserts 0
rows from all four readers and 0 through `v_access_grants`' four definer
tiers, uses block 13's recorded-tenant grants as the working studio's own
mutation control (1 / 1 / 1, and 3 through the ledger), asserts the stated
cost (that admin reads 0 on the studio-less job), and re-checks that no ledger
row carries a 64-hex bearer credential.

---

## M1 (MAJOR) — the supersede is re-reckoned at every read

`supabase/migrations/00623_studio_compliance_documents.sql`

- `compliance_state()` (the one place direction §3.8 puts the word) drops a
  superseded row only while its successor still earns the retirement:

  ```sql
       AND (d.superseded_by IS NULL
            OR NOT EXISTS (
              SELECT 1
                FROM public.studio_compliance_documents s
               WHERE s.id = d.superseded_by
                 AND (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
                 AND d.blocks <@ s.blocks));
  ```

- `blocks` joins `assert_compliance_holder_trg`'s `UPDATE OF` list beside it —
  worth doing, not sufficient alone, because the trigger reads the row's own
  successor and never its predecessors. Recorded as such in the file.
- `idx_studio_compliance_documents_holder_all ON (holder_id)` added: the
  reader now scans every row of a holder, not only the non-superseded ones the
  existing partial index covers.
- The comment block above the function and its `COMMENT ON FUNCTION` both
  state the walk and the reason the reckoning lives in the reader; the banner
  gains the fifth-door lineage entry.

Walked (`probe159` §M1), every write as `studio_manager@patina.dev`
(`a0000000-…-0003`), a plain `admin` of the owning studio:

```
  step  |  word
--------+--------
 before | lapsed
 write 2: honest supersede | current
 write 3: successor back-dated | lapsed
 write 4: successor de-gated | lapsed | in_force_gating_coi_gl 0 | dana_row lapsed
 gates restored: honest release | current
```

Writes 3 and 4 still LAND (the de-gating UPDATE now fires the trigger and is
still accepted, because the guard cannot see predecessors) and no longer move
the word. The honest supersede still releases the lapse, so this is a
conditional retirement and not a refusal to forget, and
`identity_paper_state()` carries the same answer to Dana Kowalski's Directory
row.

**Suite leg: block 19**, which walks all four writes plus the restore, asserts
each intermediate word, asserts that the retired certificate is still on file
with `blocks @> {site_access,draw}` and that
`count(non-superseded, in-force, gating coi_gl) = 0` at the moment the word is
read, asserts Dana's Directory row, and unwinds the fixture so nothing
downstream reads a state the block invented.

---

## M2 (MAJOR) — `studio_contact_id` is guarded like the rest of the R-AP family

`supabase/migrations/00624_project_party_window_and_authority.sql`

- `assert_project_party_cards()` gains a `studio_contact_id` leg raising
  `party_studio_contact_other_studio`; the function's early return now names
  the third pointer; the trigger's `UPDATE OF` list names the column.
- Both constraints from the finding are honoured: the leg is **kind-agnostic**
  (00418 pass D2, `00418_studio_contacts_backfill.sql:321-332`, legitimately
  stamps a COMPANY card on a `vendor_id`-bearing seat, so the test is org
  membership only), and it resolves **`project_tenant_org()`**, not
  `project_recorded_studio()` — a record-only tenant there is r7 BLOCKING-1's
  inversion — so the existing `party_card_project_has_no_studio` branch covers
  the NULL case.
- Shipped-data cost, measured before the edit: all 28 stamped seats name a
  card in their own project's studio, and every studio-less local project
  carries 0 seats.

  ```
  $ psql … -c "select pj.studio_id is null as studioless,
                      (sc.organization_id = pj.studio_id) as card_in_project_studio, count(*)
                 from project_parties pp join projects pj on pj.id=pp.project_id
                 join studio_contacts sc on sc.id=pp.studio_contact_id
                where pp.studio_contact_id is not null group by 1,2;"
   studioless | card_in_project_studio | count
  ------------+------------------------+-------
   f          | t                      |    28
  ```

Walked (`probe159` §M2) as `designer@patina.dev` (`a0000000-…-0004`), owner of
BOTH studios — the shipped local shape:

```
NOTICE:  M2: refused with party_studio_contact_other_studio

          ngozi_stamp_after           | ngozi_directory_rows | claims | nests
--------------------------------------+----------------------+--------+-------
 d0e10000-0000-0000-0000-000000000006 |                    1 |      1 |     1

NOTICE:  M2 control (person card, own studio): landed
NOTICE:  M2 control (COMPANY card, own studio — 00418 pass D2): landed
```

**Suite leg: block 20.** Refusals for a PERSON card and a COMPANY card of
another studio, on UPDATE and on INSERT, by a caller who is a member of BOTH
studios (so the refusal cannot be mistaken for unreachability); the
consequence measured (her stamp unchanged, one Directory row, `claims = nests`,
the roster still naming the seat the site access card calls key holder); and
both own-studio kinds landing as the mutation control, with her own card put
back afterwards.

### One existing suite fixture moved, and why

`supabase/tests/people/w1b_compliance_authority_directory_test.sql` block 16
inserted a seat carrying a `studio_contact_id` on the studio-less job **as the
table owner**. With the guard in place a NULL-`auth.uid()` writer resolves no
tenant there and takes `party_card_project_has_no_studio`, so that one INSERT
now runs as `a0000000-…-0003`, the admin of the studio doing the work — the
honest actor for it (the studio stamping its own card on its own seat), and
the block's assertions are unchanged. Noted in the file at the insert.

---

## What I ran

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2719 replayed statements
$ git diff --numstat -- supabase/seed/00-legacy-grants.sql
   (no output — these edits add no GRANT/REVOKE)

$ pnpm --dir … supabase:reset          # pass 1
RESET1_EXIT=0      (no /^ERROR/ or /error:/ lines)
$ pnpm --dir … supabase:reset          # pass 2
RESET2_EXIT=0
$ psql … -At -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
555|20260910152111
$ psql … -At -c "select version from … where version>='00620' and version<'20000000' order by version;"
00621 00622 00623 00624 00625 00626 00627

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0        20 assertion blocks + 'All W1b assertions passed.'
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0        'All W1a assertions passed.'
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/studio_contacts_backfill_test.sql
EXIT=0            'All studio_contacts_backfill assertions passed.'
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/people_directory_scope_test.sql
EXIT=3            ERROR: FAIL a2: expected exactly 12 columns, got 17

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
   (no output — no type drift)
```

Both suites re-run green on both resets (W1b before the reset-2 run as well).
`probe159` re-run against the settled ledger (`555 / 20260910152111`).

### The one red suite, and why it is not mine

`supabase/tests/rls/people_directory_scope_test.sql:308` asserts
`people_directory` has exactly 12 columns. 00626 (already committed on this
branch, `9812807e1`) rebuilt the view with 17, and `select count(*) from
information_schema.columns where table_name='people_directory'` reads `17`
on a fresh reset. None of the four files edited in this pass touches
`people_directory` or its column list — 00626 is byte-unchanged here — so that
red is pre-existing W1b debt (a W2 reader-repoint suite owed alongside R-BE),
not a regression from these fixes. It is **not** in this pass's scope and I
did not edit it.

### Not done, deliberately

- No edge-function change, so no Deno suite is relevant and none was run.
- No portal/TypeScript change; `database.types.ts` did not move, so no
  type-check gate could be affected by these edits.
- Nothing pushed to Strata. All three migrations remain unapplied there and
  were therefore edited in place, per the skill's rule.
