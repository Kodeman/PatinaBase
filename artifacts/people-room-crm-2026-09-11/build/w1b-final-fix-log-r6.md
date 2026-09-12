# W1b — final review round 6, fix log

Three findings in scope: **BLOCKING-1** (00627's three loose SECURITY DEFINER
access-grant readers), **MAJOR-1** (r5's tenant conjunct goes dark on a
`studio_id IS NULL` project) and **MAJOR-2** (the Directory's four
designer-scoped branches — a ruling was asked for). Nothing else was touched:
MINOR-42, MINOR-13's siblings, MINOR-33, MINOR-35 and the r6 MINOR list are
untouched and still open.

All five W1b files are unapplied on Strata, so they were edited in place
(`supabase/CLAUDE.md`'s standard remediation). No new migration number was
minted; 00622–00627 still stand and 00595–00620 are still untouched.

Every ruling in `rulings.md` §3 held. R-AW/R-AY in particular: nothing here
reads a seat's frozen `sms_consent_*` column, and no seat read was
reintroduced — the one consent change below makes the RECORD's readability the
condition for printing its word, which is R-AY's own premise.

---

## BLOCKING-1 — the three definer readers are gated on the tenant now, with the shipped predicate beside them

**What was wrong.** `access_grants_trade_rfq`, `access_grants_plan_transmittals`
and `access_grants_invoice_links` are `SECURITY DEFINER` with
`GRANT EXECUTE … TO authenticated`, so each one's `WHERE` clause is the whole
access rule and PostgREST publishes it. All three were
`is_studio_comember(<designer of record>)` alone, which is true whenever the
caller shares ANY active organization of ANY type with that designer.

**What landed** (`supabase/migrations/00627_access_grants_and_field_link_window.sql`):

| Reader | New gate | Line |
|---|---|---|
| `access_grants_trade_rfq` | `is_design_studio_comember(pr.designer_id)` AND (`pr.project_id IS NULL` OR `is_active_studio_member(project_tenant_org(pr.project_id))`) | 122–125 |
| `access_grants_plan_transmittals` | `is_active_studio_member(project_tenant_org(pj.id))` AND `is_design_studio_comember(pj.designer_id)` | 206–207 |
| `access_grants_invoice_links` | `is_design_studio_comember(inv.designer_id)` AND a `CASE`: `inv.studio_id` when set, else the project's tenant, else `true` | 251–258 |

`is_design_studio_comember` is deliberate: it is the predicate the two shipped
(and grant-dead) policies `trade_rfq_tokens_studio_rw` /
`plan_transmittal_tokens_studio_rw` actually carry, so the banners' claim to
"restate the shipped policy" is now true. The two untrue banner passages are
corrected — 00627:28-45 (the file banner), and each reader's `COMMENT`
(00627:131-148, 211-226, 262-279) now states that a definer WHERE clause is
the whole rule, what the old gate leaked, and what the tenant leg is.

**Why not the literal fix in the finding.** The finding's shape was
`is_active_studio_member(project_consent_org(<project>)) AND …` for all three.
Two measured reasons it was not taken verbatim:

1. `project_consent_org()` is the CONSENT resolver, and MAJOR-1 below is the
   measurement of what it decides when used as a gate. The three readers use
   the new gate resolver `project_tenant_org()` (00624 §1) instead, so this
   wave has exactly one gate resolver.
2. `proposals.project_id` and `invoices.project_id` are both NULLABLE and the
   local fixture exercises it: the only seeded rfq-able proposal
   (`b0000000-…-0001`) has **no project**, and the invoice the finding itself
   names (`b0000000-…-e141`) has `studio_id` NULL and sits on a project whose
   `studio_id` is NULL too. `project_consent_org(NULL)` is NULL, so the literal
   conjunct would have returned 0 rfq rows **to the owning studio's own owner**.
   A row that records no tenant is gated on the design-studio predicate alone,
   and each `COMMENT` says so rather than leaving it to be discovered.

**Walked.** `probe128-w1b-fix-r6-blocking1-definer-readers.sql` — one rfq
token, one plan token and one invoice link, three actors:

```
=== A premise: manufacturer-org co-member of the designer ===
 comember_any_org | design_studio_comember | member_of_the_owning_studio
 t                | f                      | f

=== A: all four definer readers ===
     branch     | count
 rfq_link       |     0
 plan_link      |     0
 invoice_pay    |     0
 agreement_link |     0

=== B premise: DESIGN-studio co-member, not a member of the owning studio ===
 shipped_policy_gate | member_of_the_owning_studio |         tenant_org_resolved
 t                   | f                           | b0000000-0000-0000-0000-000000000001

=== C positive control: the studio owner still reads every branch ===
 rfq_link 1 | plan_link 1 | invoice_pay 1 | agreement_link 0
=== C: no bearer credential in the ledger (the carried rule) ===
 rows_carrying_a_64_hex_token = 0
```

Actor B's `plan_link` is 0 — the tenant leg refuses a caller who satisfies the
shipped predicate. B's `rfq_link 1` / `invoice_pay 1` in that same run are the
tenant-less rows described above (projectless proposal; invoice with neither
`studio_id` nor a project that records one), which is why the API probe below
re-ran the whole thing on paperwork whose tenant IS recorded.

**Over the public API** — the finding's own route.
`probe132-…-postgrest-fixture.sql` commits a fixture where every grant sits on
recorded-tenant paperwork (proposal `…cb03` on project `…c0d1`, invoice
`…cc01` naming `studio_id`, plan token on the seeded Okonkwo job); then
r6's own `probe123` script, for a manufacturer-org co-member (A) and a
design-studio co-member (B); then `probe134-…-teardown.sql`
(`probe133-w1b-fix-r6-postgrest-after.out`):

```
### actor A: manufacturer-org co-member
  access_grants_invoice_links            -> HTTP 200 []
  access_grants_plan_transmittals        -> HTTP 200 []
  access_grants_trade_rfq                -> HTTP 200 []
  access_grants_trade_agreement_links    -> HTTP 200 []
### actor B: design-studio co-member
  access_grants_invoice_links            -> HTTP 200 []
  access_grants_plan_transmittals        -> HTTP 200 []
  access_grants_trade_rfq                -> HTTP 200 []
  access_grants_trade_agreement_links    -> HTTP 200 []
```

(`field_link` and `client_account` rows still reach these callers through
`v_access_grants`' INVOKER branches — r6 §7 already recorded that as
`field_link_tokens_studio_rw`'s own shipped posture, not part of this finding.
Unchanged here.)

**Suite leg.** The finding asked for a block-13-shaped leg with the right
actor. Block 13 now writes one grant on each of the three sources, all on
recorded-tenant paperwork, and asserts:

* `13u` — the actor satisfies `is_design_studio_comember` too, so the tenant
  leg is what is being proved (without this the block proves nothing);
* `13v` / `13w` / `13x` — 0 rows from each of the three readers;
* `13y` — 0 from the already-tenant-scoped agreement reader;
* `13z` — 0 through `v_access_grants`' union;
* `13u1`–`13u5` — the **studio's own admin** still reads all three grants,
  reads them through the ledger, and the ledger still carries no 64-hex token.

---

## MAJOR-1 — the gate stops guessing: `project_tenant_org()`

**What was wrong.** r5's conjunct resolved the tenant through
`project_consent_org()` = `COALESCE(studio_id, _primary_studio_for(designer_id))`.
On a project that records no studio the fallback names whatever studio the
designer's own memberships rank first. Measured locally: **5 of 8 projects**
carry `studio_id IS NULL`, their designer of record is an **owner of two
design studios**, and the resolver names the other one — so an ADMIN of the
studio doing the work read 0 seats, 0 site access cards, 0 authority grants,
and a site-access INSERT was refused. For `people_directory` that was a
regression (00594's party branch carried no tenant leg at all).

**Backfill was not available.** Option 1 in the finding (backfill
`projects.studio_id` and keep the conjunct) has nothing to backfill *with*:

```
 name                    | studio_id | resolved      | designer_design_studios
 Aspen Loft Refresh      |           | Leah Hartwell |                       2
 Birch Hollow            |           | Leah Hartwell |                       2
 Chen Residence          |           | Leah Hartwell |                       2
 Marrow & Vale Residence |           | Leah Hartwell |                       2
 Olsen Lake House        |           | Leah Hartwell |                       2
```

The designer owns two active design studios, so the record itself does not
choose and a backfill would cement the same guess.

**What landed.** A new gate resolver, and one consumer change per site:

* `00624:109-167` — `public.project_tenant_org(uuid)`, SECURITY DEFINER,
  `search_path` pinned, REVOKEd from PUBLIC/anon, EXECUTE to
  `authenticated, service_role`. `projects.studio_id` when the record names a
  studio; where it names none, the **design studio the CALLER and the job's
  designer / lead designer / creator all actively belong to**, owner/admin
  preferred in the ORDER BY so PR-n's money narrowing resolves where the
  caller holds the standing. `organizations.type = 'design_studio'` is
  load-bearing — without it a shared manufacturer org would resolve as the
  tenant, which is the hole r5 closed. It is CALLER-RELATIVE and its COMMENT
  says it may gate access and may never resolve a consent record's studio.
* `00624:170-186` — `project_party_org()` delegates to it (its only consumers
  are the four authority policies at `00624:554/567/581/589/603`, unchanged in
  text).
* `00625:216/226/236/240/250` — the four site-access policies.
* `00626:1173` (party branch) and `00626:1493` (seats view).
* Banners/COMMENTs restated at `00624:59-84`, `00624:446-451`, `00625:18-20`,
  `00625:109`, `00625:200-208`, `00626:174-187`, and both view COMMENTs.

**The consequence the wider gate carried, closed in the same pass.**
Restoring the seat to the working studio also handed it the seat's consent
WORD — and on a studio-less job the RECORD lives at the org
`project_consent_org()` guesses, which that studio need not belong to.
Measured **before** the second fix (`probe135`):

```
 record_lives_at = Leah Hartwell
-- as the admin of the studio doing the work, who cannot read that record
  +16125559992 | not_asked          ← the affirmative word over a recorded refusal
 raw_word_to_this_caller = (null)
```

That is r5 MAJOR-1's fail-open word, on the row the composer opens from. So
the `COALESCE(..., 'not_asked')` on both sites is now gated on the caller
being an active member of the deciding record's org (`00626:1124-1131` party
branch, `00626:1459-1466` seats view): unknown prints NULL — R-V's "no record"
line — never the affirmative word. After:

```
-- as the admin of the studio doing the work, who cannot read that record
  +16125559992 |                     ← NULL
-- and to a member of the org the record lives at, for contrast
  +16125559992 | opted_out
```

The send rail is untouched and still fail-closed: it asks
`channel_consent_status()` itself (R-AY) and NULL is not `granted`.

**Walked.** `probe129-w1b-fix-r6-major1-studioless.sql`:

```
=== premise ===
 Aspen Loft Refresh |  (studio_id NULL) | consent_resolver_names = Leah Hartwell
 studio_id_is_null = 5 | all_projects = 8

=== AS THE ADMIN of Local Dev Studio (the studio doing the work) ===
 member_of_local_dev | member_of_the_guessed_org | gate_resolver_names
 t                   | f                         | Local Dev Studio
 seats_seen | directory_rows | cards_seen | grants_seen | raw_seats_seen
          1 |              1 |          1 |           1 |              1
NOTICE:  admin INSERT on a studio-less project LANDED
NOTICE:  admin money grant LANDED

=== AS A MANUFACTURER-ORG CO-MEMBER of the designer — must read nothing ===
 comember_any_org t | design_studio_comember f | gate_resolves_to (null)
 seats 0 | cards 0 | grants 0
NOTICE:  manufacturer-org co-member INSERT refused: new row violates row-level
         security policy for table "project_site_access_cards"

=== AS A MEMBER OF A FOREIGN DESIGN STUDIO — must read nothing ===
 seats 0 | cards 0 | grants 0

=== and the studio-SET project is unchanged: the block-13 shape still refused ===
 seats_on_the_seeded_job 0 | cards_on_the_seeded_job 0
```

**Mutation control.** `probe131-w1b-fix-r6-mutation-control.sql` restores the
three old reader bodies and the old resolver inside one rolled-back
transaction, so the numbers are the two states side by side:

```
=== AFTER the fix ===
 leg_13v_rfq 0 | leg_13w_plan 0 | leg_13x_invoice 0
 admin_seats 1 | admin_cards 1  | admin_grants 1
=== BEFORE the fix (reverted) ===
 leg_13v_rfq 1 | leg_13w_plan 1 | leg_13x_invoice 1
 admin_seats 0 | admin_cards 0  | admin_grants 0
```

**Suite leg.** New **block 14** walks one studio-less job: `14a`/`14b` assert
the premise (no recorded studio; the two resolvers disagree), `14c`–`14i` that
the working studio's admin reads the seat, the Directory row, the card and the
grant, then records a card and a money grant; `14q`–`14s` that the consent
word on such a seat is NULL for that admin and still `opted_out` for a member
of the record's own org; `14j`–`14p` that a co-member of the designer through
a manufacturer org resolves no tenant, reads none of it, and cannot INSERT.

**Owed before the chain runs** (stated in the 00624 banner, not silently
carried): **the count of `studio_id IS NULL` projects on Strata**. It is 5 of 8
locally and every gate in this wave turns on it. Prod was not read — this wave
is local-only.

---

## MAJOR-2 — RULED: the four branches stay designer-scoped, and the record says so

**The ruling.** The `client`, `lead`, `maker` and `team` branches of
`people_directory` keep `is_studio_comember(designer_id)`, carried verbatim
from 00594/00420. No predicate changed. What changed is that the
inconsistency is now **on the record** rather than silent: the view's COMMENT
names, branch by branch, which branches are tenant-scoped (`contact` via
`sc.organization_id`; `party` via `project_tenant_org()`) and which are
designer-scoped by inheritance, states what that admits (measured: 6 client
and 5 lead rows with names, emails and telephone numbers to a manufacturer-org
co-member), and names the close.

**Why tightening the view was rejected — measured, not argued.** The view is
not the door. `probe130-w1b-fix-r6-major2-the-door.sql`:

```
-- the shipped policies on the base tables of the four branches
 designer_clients | designer_clients_studio_rw | ALL    | is_studio_comember(designer_id)
 leads            | leads_studio_select        | SELECT | is_studio_comember(designer_id)
-- and the table grants those policies run behind
 designer_clients | SELECT
 leads            | SELECT

-- premise
 comember_of_designer t | design_studio_comember f | member_of_local_dev f
-- what this caller reads from people_directory, by role
 client 6 | lead 5
-- THE VIEW IS NOT THE DOOR: the same names, emails and phones off the BASE TABLES
 designer_clients_rows = 6
 Karin Lindqvist       | karin@lindqvist-household.com | (612) 555-0190
 The Okonkwo household | adaeze@okonkwo-household.com  | (612) 555-0104
 leads_rows = 7
-- and the objects this wave gates, for contrast
 seats 0 | cards 0 | authority 0 | docs 0
```

The same caller reads the same columns from `/rest/v1/designer_clients` and
`/rest/v1/leads` with the view out of the picture. Tightening the four
branches would therefore close nothing, and the only tenant resolver those
branches can reach is `_primary_studio_for(designer_id)` — the resolver
MAJOR-1 just measured deciding wrongly on 5 of 8 projects — so it would also
repeat MAJOR-1 on the branches carrying homeowner PII.

**The close, named.** An 00584-shaped tenant sweep over `designer_clients`,
`leads`, `vendors` and `project_team_members` TOGETHER with these four
branches. It changes who sees what platform-wide (an `admin_team` org shared
with a designer satisfies `is_studio_comember` today), so it is **owed a
ruling of its own** — Fable/Kody, not this wave.

**Suite leg.** New **block 15** holds the invariant the ruling rests on: for
the same caller the client branch is neither broader nor narrower than
`designer_clients` itself (6 = 6), while every object this wave gates stays
shut. If someone later tightens the view alone, `15a` fails and points at the
ruling; if the sweep tightens the base tables too, both counts go to 0
together and it still passes.

---

## Verification

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2715 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql
 supabase/seed/00-legacy-grants.sql | 12 ++++++++++++     (project_tenant_org's REVOKE + GRANT)

$ grep -m1 NEXT_PUBLIC_SUPABASE_URL apps/designer-portal/.env.local   (repo root; the worktree has none)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321                       ← local, not Strata

$ pnpm supabase:reset
Finished supabase db reset on branch main.   (twice — once per fix pass)

$ psql -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
…
NOTICE:  13. the tenant boundary: … no access-grant row of the seeded studio through any of
         00627's four definer readers … while the studio's own owner and admin still read all
         of it, refusal and all three grants included: passed
NOTICE:  14. a studio-less job: the admin of the studio doing the work reads its seat, its site
         access card and its authority grant and may record both, the consent word on that seat
         reads NULL rather than the affirmative one because the deciding record lives where it
         cannot be read, and a co-member of the designer through a non-design organization reads
         none of it and may write nothing (r6 MAJOR-1): passed
NOTICE:  15. the client branch inherits designer_clients' own posture exactly (6 row(s) each)
         while every tenant-scoped object of this wave stays shut to the same caller — r6
         MAJOR-2 is a ruling of record, not a silent inconsistency: passed
NOTICE:  All W1b assertions passed.      (15 blocks, was 13)

$ psql -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  All W1a assertions passed.      (47 notices, unchanged)

$ # idempotency: all five files applied TWICE in one rolled-back transaction
$ psql -v ON_ERROR_STOP=1 -f /tmp/claude/w1b-idem-r6.sql | grep -Ei "ERROR|ROLLBACK"
ROLLBACK                                  (no error)

$ SUPABASE_DB_URL=…54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 1 +
+      project_tenant_org: { Args: { p_project_id: string }; Returns: string }

$ pnpm --filter @patina/supabase type-check
> tsc --noEmit                            (clean)

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/sms.test.ts
ok | 40 passed | 0 failed
$ deno test … supabase/functions/_tests/field-daily.test.ts
ok | 13 passed | 0 failed
$ deno test … supabase/functions/_tests/sms-inbound.test.ts
ok | 52 passed | 0 failed
```

Probes added this round, all under
`artifacts/people-room-crm-2026-09-11/build/`:

| Probe | What it measures |
|---|---|
| `probe128-w1b-fix-r6-blocking1-definer-readers` | the four readers, three actors, with the positive control |
| `probe129-w1b-fix-r6-major1-studioless` | the studio-less job, four actors, reads and writes |
| `probe130-w1b-fix-r6-major2-the-door` | the base tables' own posture behind the four branches |
| `probe131-w1b-fix-r6-mutation-control` | both states side by side, the fix reverted in-transaction |
| `probe132`/`probe133`/`probe134` | the committed API fixture, the `/rest/v1/rpc` answers, the teardown |
| `probe135-w1b-fix-r6-consent-word-fail-closed` | the affirmative word over an unreadable refusal, before and after |

## Still open, untouched

MINOR-42 (`identity_seat_count()` vs the seats view count over different
populations), MINOR-13's remaining siblings — including
`identity_phone_numbers()`'s seat leg at `00626:597`, which still equality-tests
`project_consent_org(pj.id)` and so returns no numbers for a studio-less job's
own studio (fail-closed, not fail-open) — MINOR-33 (`search_path` on
`party_identity_key`/`party_kind_in_directory`), MINOR-35 (`w1b-report.md` is
now seven rounds stale and still does not contain the string
`is_active_studio_member`), MINOR-27, and the rest of the carried MINOR list.
None was in this round's scope.
