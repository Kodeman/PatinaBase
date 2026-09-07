# Wave 1 · lane `backend` — adversarial review, round 4

Reviewer: separate context, did not write this code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-backend`
(`git rev-parse --show-toplevel` confirmed), branch `agreement/w1-backend`,
HEAD `5fb10ed93`, 26 commits ahead of `main`, 20 files, +9904/−27.

**Filename note.** The brief named this file `backend-review-r3.md`. That file
already exists on the branch (commit `c9e4f7f9b`, the review whose findings the
brief carries as PRIOR ROUND FINDINGS), and the lane's own notes call the work
under review **round 4**. Overwriting `r3` would destroy a distinct earlier
review, so this one is `backend-review-r4.md`. The orchestrator should read
r1 → r2 → r3 → r4 in commit order, not filename order.

## Verdict

**fix** — no blocker; one new major, two majors carried forward, nine minors,
sixteen nits. Nothing here makes 00575 unsafe on Strata: every graft is clean,
every `SECURITY DEFINER` pins `search_path`, every extension call is
schema-qualified, RLS lands in the same file, the grants seed is regenerated,
the pinned hash is an honest re-pin, and a parts-less document's fingerprint is
byte-identical to what it was before the file.

---

## Gates I ran myself

Scratch DBs, both built unsandboxed from the shared stack and dropped at the
end. ⚠ The shared stack is **no longer at 00574** — it carries an earlier,
pre-R17 copy of 00575 (`_agreement_floor_unmet` present, `discard_agreement_parts`
absent, `authenticated` still holding UPDATE on `proposal_service_terms`), so
neither scratch DB is a pristine 00574 baseline. I worked around it two ways:

- **`patina_w1rev`** — `pg_dump --no-owner --exclude-schema=cron` restored into a
  fresh database, the two new tables `DROP … CASCADE`'d so they are created by
  the migration rather than inherited, then 00575 applied.
  ⚠ `--no-acl` (as env.md's recipe writes it) strips every GRANT and makes
  `agreement_parts_test.sql` and `public_sd_hardening_contract_test.sql` fail
  with `permission denied for table proposals` / `a public 00511 direct ACL
  tuple drifted`. The recipe in env.md should drop `--no-acl`.
- **`patina_w1ctl`** — the same dump, with 00575's objects dropped AND the ten
  redefined functions restored **verbatim from their `grep|sort|tail -1` head
  bodies** (00412 / 00422 / 00423 / 00425 / 00477 / 00566), the projection
  triggers dropped and the terms/rates write grants restored. A reconstructed
  pre-00575 control, and the closest thing available to a virgin apply.

```
psql -v ON_ERROR_STOP=1 -f supabase/migrations/00575_agreement_parts.sql
  patina_w1rev  → rc=0, 0 ERROR, 9 NOTICE (all "does not exist, skipping")
  patina_w1rev  → applied a SECOND time: rc=0, 0 ERROR   (criterion Q)
  patina_w1ctl  → rc=0, 0 ERROR, 11 NOTICE   (apply onto a pre-00575 baseline)

SQL suites, per file, against patina_w1rev (§7 lane-backend list, all 11):
  commercial/agreement_parts_test.sql              rc=0 · 22 PASS
  commercial/agreement_parts_projection_test.sql   rc=0 ·  5 PASS
  commercial/multi_studio_signature_test.sql       rc=0 ·  7 PASS
  commercial/design_services_paper_issue_test.sql  rc=0 · 13 PASS
  schedule/ceremony_hardening_test.sql             rc=0 · 15 PASS
  edge_api/public_sd_hardening_contract_test.sql   rc=0 ·  0 ERROR
  commercial/design_services_authority_test.sql    rc=3  ← see m7
  commercial/design_services_gap_hardening_test.sql rc=3 ← see m7
  commercial/authorized_schedule_test.sql          rc=3  ← see m7
  commercial/executed_on_paper_test.sql            rc=3  ← see m7
  commercial/trade_scope_test.sql                  rc=3  ← see m7

  The lane's own two suites and the pinned-hash suite also pass on
  patina_w1ctl (22 / 5 / 0 errors) — i.e. on a database that had never seen
  00575 before this apply.

python3 scripts/generate-legacy-grants.py
  → baseline + 2232 replayed statements; `git status --porcelain` on
    supabase/seed/00-legacy-grants.sql is EMPTY afterwards — the committed
    seed is the generated one.

supabase gen types typescript --db-url …/patina_w1rev  vs the committed file
  → 87 differing lines, ALL of them either the five FK Relationship blocks a
    scratch restore cannot rebuild (engagement_events_user_id,
    invoice_links_created_by/invoice_id, organization_members_user_id ×2,
    user_roles_user_id) or my own `_fp_00423` probe function. No agreement
    object differs — the committed types are in sync with 00575.

pnpm --filter @patina/types    type-check → clean
pnpm --filter @patina/supabase type-check → clean
pnpm --filter @patina/supabase test       → 87 files, 1068 passed | 12 skipped
```

No production mutation. No `db push`, no `functions deploy`, no `wrangler`. The
shared stack was READ (one `pg_dump`) and never written or reset. Nothing pushed.
No `.env`, `.claude/`, hooks or settings touched.

---

## The attacks, and what they returned

### A · Fingerprint conditionality (F-1) — PASS

I installed `_commercial_document_fingerprint`'s **pre-00575 body** (00423:1214,
verbatim, renamed `_fp_00423`) alongside the new one and compared across every
proposal in the database:

```
select count(*), count(*) filter (where _fp_00423(id) = _commercial_document_fingerprint(id))
  from public.proposals;   →  11 | 11
kinds present: legacy 5 · trade_scope 2 · furnishings_authorization 2 · design_services 2
```

Byte-identical for all four document kinds. No in-flight `client_signed`
agreement is bricked by this file.

### B · Fingerprint coverage — PASS

Every column of a part, mutated in turn, then recomputed:

```
title moved · kind moved · variant moved · part_key moved · payload moved
required moved · client_visible moved · source_template_key moved
source_part_id moved · position moved · updated_at UNCHANGED (correct)
```

### C · Client-visibility mismatch — PASS

`client_visible` moves the digest (above) and the bundle omits the row
(probe Q5b: a document with two studio-only money parts returns
`parts=[Services | Terms]`). F-3 holds.

### D · Guard bypass by direct insert — PASS with a deviation (m5)

As the second studio co-member, on a **sent** document:

```
UPDATE → 42501 permission denied for table proposal_agreement_parts
DELETE → 42501 permission denied for table proposal_agreement_parts
INSERT → 42501 permission denied for table proposal_agreement_parts
upsert_agreement_parts  → 42501 draft proposal … not found or access denied
discard_agreement_parts → 42501 draft proposal … not found or access denied
```

Refused nine ways, but by the **grant**, not the trigger, because R17(c)'s
revoke reached this table too. As the table owner (the only role that can get
past the grant) the trigger does fire: `23514 proposal_agreement_parts is
immutable after its proposal leaves draft`. Criterion D expected
`check_violation`; see m5.

### E · Guard bypass by cascade — pre-existing red (n5)

`DELETE FROM public.proposals` on a **draft** carrying nine parts →
`23514 proposal_service_rates is immutable after its proposal leaves draft`.
Identical class on the pre-00575 control. The criterion does not describe the
repo, with or without this change.

### F · RLS leak to a non-member — PASS

```
outsider SELECT proposal_agreement_parts → 0 rows
outsider upsert / materialize / discard  → 42501 insufficient_privilege ×3
client   SELECT proposal_agreement_parts → 0 rows (no policy for them)
```

### G · RLS on studio defaults — PASS

```
plain member INSERT → 42501 new row violates row-level security policy
plain member UPDATE → 0 rows
plain member SELECT → 1 row (their own studio)
policies: member_select cmd=r · admin_insert cmd=a · admin_update cmd=w
```

### H · Projection drift — PASS

`_project_agreement_terms` diffed line-by-line against `upsert_design_services_draft`'s
head body (00422:1747-1794). The only differences are the two named in §3.7 and
R17: the NULL-preserving ceiling read, and the `p_allow_null_ceiling boolean`
argument that gates it. `upsert_design_services_draft` calls the same helper.
`agreement_parts_projection_test.sql` passes 5/5.

### I · Projection over-reach (R5) — PASS

A `clause` part carrying `cents`, `cadence` and `depositPercent`, plus a
`schedule`/`flat` part carrying `cents`, saved beside the real money parts:

```
terms after: ceiling=2400000 cadence=monthly deposit=NULL retainer=0
```

Prose stayed prose; the `flat` variant recorded and hashed and wrote nothing.

### L · Readiness false-green — **FAILS in one direction (M1-new below)**

The ceiling half is now solid at every door, and over both scopes:

```
P1 client-visible rate card + studio-only ceiling → 23514 an agreement that bills time needs a ceiling
P2 studio-only rate card + no ceiling anywhere    → 23514 an agreement that bills time needs a ceiling
P3 both client-visible                            → ACCEPTED
```

Round 3's M1 is fixed and correct. The **fee** half of R4 is not — see below.

### M · Readiness false-red — PASS

A flat-fee agreement (`schedule`/`flat`, no rate card, no ceiling) saves, sends,
and leaves `billing_ceiling_cents = NULL` with zero rate rows. A composed
rate-card agreement sends, is client-signed, countersigns
(`newlyExecuted=true`) and snapshots `project_billing_authorities.billing_ceiling_cents
= 2400000`. Neither the projection wall nor the parts freeze breaks the ceremony.

### N · NULL ceiling downstream (F-2) — PASS

All four readers grafted from their true heads (00566:841 countersign,
00422:2449/:2467 summary, 00412 `classify_project_time_entry_authority`), each
delta exactly one `IS NULL` disjunct or one `CASE`.

### O / P · Pinned-hash honesty and head-body grafting — PASS

The re-pinned hash matches the applied function byte for byte:

```
SELECT encode(digest(convert_to(prosrc,'UTF8'),'sha256'),'hex') FROM pg_proc
 WHERE oid = to_regprocedure('public._countersign_design_services_agreement_impl(uuid,text,jsonb)')
 → 8995735d7c966a6bd4db4a1669ee043b12398b9d64fe676c2281ece2536bc0b3   = the pinned value
```

`sign_design_services_agreement_with_trusted_ip`'s entry is untouched.
Every one of the ten redefined functions was diffed against its
`grep|sort|tail -1` head; every delta is one of the ones §3 names. No stale
graft, no silently reverted 00566 studio resolution.

### R · Grants — PASS

```
proposal_agreement_parts   authenticated: SELECT t · INSERT f · UPDATE f · DELETE f
proposal_service_terms     authenticated: SELECT t · UPDATE f
_agreement_floor_unmet / _requires_rate_card / _assert_cents / _project_agreement_terms
   proacl = postgres=X/postgres  (no caller ACL at all)
search_path pinned on all ten new/redefined functions
trigger order on proposal_service_terms: …_authored then …_projection (alphabetical, as claimed)
```

### T · Unknown-kind resilience — PASS

`kind='wormhole', variant='quantum', payload={}` is accepted, hashed, and
projects nothing.

### U · Wave leakage — PASS

No `save_agreement_part`, `save_agreement_as_template`,
`materialize_agreement_template`, `studio_agreement_parts`,
`agreement_templates`, `compose_agreement_consent` or
`agreement_execution_snapshots` anywhere in the diff except one comment naming
`studio_agreement_parts` as the W2 FK target that does not exist yet.

### U′ · Edge NULL-ceiling — PASS, no edge change needed

`money()` at `commercial-document-notify/core.ts:54-56` returns `null` for a
null figure and the ceiling line is omitted. No edge function is touched by this
lane, so no redeploy chain follows from it.

### V · Vocabulary (R7) — PASS

All 64 refusal sentences in 00575 read in the designer's words. The only
database identifier in any of them is the inherited freeze sentence's
`TG_TABLE_NAME` (n4). No "clause library", no "contract builder", no "AI", no
"variant" in any string a person reads.

---

## Findings

### M1-new · major · confidence 0.90 — R4's *fee* floor is a UI rule only; the DB lets an agreement with no money on the homeowner's page out the door

`supabase/migrations/00575_agreement_parts.sql:337` (`_agreement_floor_unmet`)

R4's floor is "parties, signature block, **one typed money part for a class that
bills**; a ceiling part is required whenever a rate card is present." 00575
implements the second clause at every door and the first clause **nowhere**.

Two probes on `patina_w1rev`, both straight through the granted RPC and then
through `send_commercial_document`:

```
R3 · a composition of two clause parts and NO money part at all
     upsert_agreement_parts → accepted
     send_commercial_document → SENT
     terms row: billing_ceiling_cents=NULL, 0 rate rows

Q5 · a rate card AND a ceiling, both client_visible = false
     upsert_agreement_parts → accepted
     send_commercial_document → SENT
     client bundle parts = [Services | Terms]         ← no money on her page
     bundle serviceTerms.billingCeilingCents = 2400000, rates = 1
     countersign snapshots an hourly authority behind a page that names no fee
```

Q5 is the same shape as the round-3 M1 the lane just fixed, one step further
along: R21 bound the floor to the client-visible scope, and a composition where
**nothing** is client-visible satisfies the client half vacuously
(`bool_or(ap.client_visible)` over the money parts is `false`, so
`billsTime.in_the_client_copy` is false and the client disjunct never fires).

The designer lane implements the missing rule correctly and blocks both cases —
`agreement/readiness.ts:224-238`, `const clientFacing = parts.filter(p => p.clientVisible !== false)`
then "This agreement names no fee. Add a rate card, a flat fee, or a per-phase
fee." So the room reds it and the database ships it, which is precisely what
build-sheet criterion L forbids: *"push the same payload past the UI straight to
`upsert_agreement_parts` and `send_commercial_document` and confirm the DB
refuses too — readiness is UI, `_agreement_requires_rate_card` and the R4 floor
are the real gate."*

Reachable today only by a hand-made payload, exactly like the round-3 M1 —
and exactly the loop 00575's own comment says the DB floor exists to close.

**Fix** — add the fee half to `_agreement_floor_unmet` (or a sibling predicate
called from the same three doors): a `design_services`/`service_addendum`
document that carries parts must carry at least one **client-visible** schedule
part whose variant is in the fee set (`rate_card`, `flat`, `per_phase`,
`retainer`, …) with a value actually set. Refuse in the room's own words —
"this agreement names no fee". Pin probes R3 and Q5 as SQL cases. If the
orchestrator would rather keep the fee half in the UI, rule it and amend
criterion L, because as written the sheet says the opposite.

### M2 · major · confidence 1.00 — two implementations of the same hooks still ship

`packages/supabase/src/hooks/use-agreement-parts.ts:1`

Round 3 aligned the signatures; round 4 added `useDiscardAgreementParts` to the
package set. Nothing imports any of it. The designer portal still defines and
uses its own at `apps/designer-portal/src/hooks/use-commercial-documents.ts:561`
and `:584` and `.../use-studio-agreement-defaults.ts:135`
(`agreement-composer.tsx:33-34, 68-69`; `account-studio-page.tsx:39,178`).
447 lines of package hooks plus 646 lines of package tests, unreferenced by any
app. The repo rule is "`@patina/supabase` hooks for Supabase data" (CLAUDE.md).
Unchanged from round 3; the swap is now purely mechanical.

**Fix** — orchestrator decision at integration: delete one set, point the
composer at the survivor. Do not ship both.

### M3 · major · confidence 0.85 — half-fixed: the DB can un-compose, the product cannot

`.../drafting/agreement/agreement-composer.tsx:104-112` (designer lane)

The DB half is done and correct. `discard_agreement_parts` (00575:2945) exists,
is granted to `authenticated`, refuses outsiders and non-drafts, and round-trips
exactly:

```
Q1a materialize on mount            → materialized=true partCount=9
Q1b flag-off Save after compose     → 23514 This agreement is composed from parts. …
Q1c discard                         → {"discarded": 9, "partCount": 0, …}
Q1d fingerprint restored=t · terms identical=t · rates identical=t
Q1e flag-off Save after discard     → AUTHORS AGAIN
```

But **nothing calls it**: `grep -rn discard` over the composer folder returns
nothing, and the mount effect still fires `materialize.mutate` with no user act,
so merely opening the Contract Room still composes the draft irreversibly for
every co-member the per-person flag has not reached.

**Fix** — cross-lane. Wire `useDiscardAgreementParts` into the composer as an
action available while the document is draft, or defer materialize to the first
edit (with the send-path caveat the lane notes record). Orchestrator's call.

### m-new · minor · confidence 1.00 — an Addendum to a composed Agreement silently drops the composition

`supabase/migrations/00575_agreement_parts.sql` (nothing teaches
`create_service_addendum` about parts)

```
Q3 · composed agreement, executed, then create_service_addendum(project, title)
     → addendum e07f3d6f-…  parts = 0
```

`create_service_addendum` copies `proposal_service_terms` and
`proposal_service_rates` to the new proposal but not
`proposal_agreement_parts` — and the new proposal has no parts, so the R17
projection wall lets that write through. The addendum's `document_kind` is
`service_addendum`, which `materialize_standard_parts` accepts, so opening it in
the Contract Room seeds the **nine standard parts from the projection**: every
custom part, every non-money variant (flat, per_phase, draws, allowances,
attachments, attestations), the designer's order and every `client_visible`
choice are gone. R7 names Addendum as first-class vocabulary; W1 leaves it
composition-blind.

**Fix** — either carry the origin's parts into the addendum, or record the
limitation in the sheet so W2's Addendum work starts from it.

### m1 · minor · confidence 1.00 — the bundle's `parts` key is still absent on the legacy early-return

`supabase/migrations/00575_agreement_parts.sql:3040`

```
seeded legacy proposal b0000000-0000-0000-0000-000000000002, read by its client:
  keys = document · has_parts = f
```

Contract §2.4: "a new top-level `parts` key, **always present**, `[]` when the
document has none". The migration's own comment at :3094-3098 repeats it. Build
sheet §3.10 simultaneously instructs "the `'legacy'` early-return … is
untouched", so the sheet contradicts itself and the implementer followed the
instruction rather than the claim. The client adapter defends
(`apps/client-portal/src/lib/commercial-documents.ts` `?? []`), so nothing
breaks. Round-2 R5 / round-3 m1, unfixed.

**Fix** — add `'parts', '[]'::jsonb` to the early-return, or amend contract §2.4
and the in-migration comment.

### m2 · minor · confidence 1.00 — `materialize_standard_parts` does not widen `legacy` → `design_services`

`supabase/migrations/00575_agreement_parts.sql:2723`

```
P13 · kind BEFORE=legacy → materialize → materialized=true partCount=9 → kind AFTER=legacy
```

`upsert_agreement_parts` performs the widen at :2513-2517; materialize does not,
and does not touch `commercial_state`. Combined with m1, those nine parts are
hashed into the fingerprint yet invisible to the client, whose bundle takes the
legacy early-return. Round-2 R6 / round-3 m2, unfixed.

**Fix** — widen in materialize too, or refuse to seed a document whose kind is
outside `('design_services','service_addendum')`.

### m3 · minor · confidence 1.00 — `useUpdateStudioAgreementDefaults`'s doc comment describes a failure mode that does not happen

`packages/supabase/src/hooks/use-studio-agreement-defaults.ts:109-113`

The comment says a non-admin write "reaches no rows rather than erroring, so the
caller checks the returned row". Both shapes throw:

```
P11a plain member INSERT → 42501 new row violates row-level security policy
P11b plain member UPDATE → 0 rows  → .select().single() → PGRST116 → `if (error) throw`
```

Round-2 R7 / round-3 m3, unfixed.

### m4 · minor · confidence 1.00 — a back-dated rate is re-stamped to now() the first time the agreement is composed

`supabase/migrations/00575_agreement_parts.sql:2665-2678` (`v_rates`)

```
P5 · a rate written through the seven-facet door with effectiveAt 2026-01-01, then composed
     before = [Lead Designer@15000 eff=2026-01-01]
     after  = [Lead Designer@15000 eff=2026-09-07]
```

`v_rates` builds only `version` / `roleName` / `hourlyRateCents` / `sortOrder`,
so `_project_agreement_terms` falls to `COALESCE((v_rate->>'effectiveAt')::timestamptz, now())`.
`classify_project_time_entry_authority` filters authority rates on
`effective_at <= NEW.started_at`, so a back-dated rate stops applying to the
hours it was written for. Bounded, because rates freeze at send. Round-2 R8 /
round-3 m4, unfixed.

### m5 · minor · confidence 1.00 — the parts table's write grant was withdrawn: sound, still unruled, and four documents say otherwise

`supabase/migrations/00575_agreement_parts.sql:206-210`

```
authenticated on proposal_agreement_parts: SELECT t · INSERT f · UPDATE f · DELETE f
```

Build sheet §3.3 writes `GRANT SELECT, INSERT, UPDATE, DELETE`; contract §2 says
"RLS: studio read/write"; SQL test case 13 says "as the second studio member,
SELECT and UPDATE a part → both succeed"; criterion D expects `check_violation`
where a caller now gets `42501`. R17(c) authorised the revoke on
`proposal_service_terms` and `proposal_service_rates` **only**. Both portals read
the table and write only through the RPC, so nothing in the product breaks.
Round-3 m5, unfixed.

### m6 · minor · confidence 1.00 — three raw Postgres cast errors still escape as the composer's save note

`supabase/migrations/00575_agreement_parts.sql:2483, 2489, 2670`

```
P6a sortOrder='first'        → 22P02 invalid input syntax for type integer: "first"
P6b sourcePartId='not-a-uuid'→ 22P02 invalid input syntax for type uuid: "not-a-uuid"
P6d clientVisible='maybe'    → 22P02 invalid input syntax for type boolean: "maybe"   ← new this round
P6c required='yes'           → accepted (Postgres reads 'yes' as true)
P6e depositPercent=50.5      → accepted (numeric column)
```

Round 4 hand-worded eight previously-leaking cases; these three remain. None
names a table or column, so R7's letter holds — but
`agreement-composer.tsx:210-216` prints RPC error text verbatim as `saveNote`,
so a designer reads raw Postgres. Round-3 m6, partly unfixed.

**Fix** — validate `sortOrder`, `sourcePartId` and `clientVisible` in the same
loop that words the other refusals, or drop `sourcePartId` from the accepted
payload in W1 (it is a W2 column shipping nullable and unused).

### m7 · minor · confidence 1.00 — five of the eleven backend gate suites are still unproven, and their documented failure is not the failure they show

`artifacts/…/build/waves/w1/build-sheet.md:1156`

```
patina_w1rev (00575 applied)                  patina_w1ctl (heads restored, no 00575)
design_services_authority_test    :177  ──── identical message, identical line
design_services_gap_hardening_test:128  ──── identical
authorized_schedule_test          :308  ──── identical
executed_on_paper_test            :214  ──── identical
trade_scope_test                  :196  ──── identical
   e.g. "design services agreement d7300000-… not found or access denied"
```

Not caused by 00575 — I proved it against a control with the ten head bodies
restored. But note that `supabase/tests/KNOWN_FAILURES.md:83-87` documents these
five as failing at `schedule line … is not ready for authorization:
["designDisposition"]`, which is **~130 lines later and a different function**.
Both scratch DBs descend from a shared stack that is itself dirty, so this is
most likely a scratch-restore artifact — but it means five of eleven gate suites
have not been proven green for this wave in any run.

**Fix** — integration must run all eleven on a full `pnpm supabase:reset` stack
before merge. Do not merge on a scratch-DB result.

### n1 · nit · confidence 1.00 — `SET CONSTRAINTS uniq_agreement_part_position DEFERRED` is a no-op

`00575:2516`. The constraint is declared `DEFERRABLE INITIALLY DEFERRED` at
:164-168; `pg_constraint` on the applied DB shows `condeferrable=t condeferred=t`.
Round-2 R9, unfixed.

### n2 · nit · confidence 1.00 — `v_rate jsonb` declared and unused in `upsert_design_services_draft`

`00575:2050`. The loop that used it moved into `_project_agreement_terms`.
Round-2 R10, unfixed.

### n3 · nit · confidence 1.00 — the three new RPCs `REVOKE … FROM PUBLIC, anon, service_role` without naming `authenticated`

`00575:2714, :2919, :2988`, unlike the 00422 family. Applied ACLs are identical
(`postgres=X/postgres,authenticated=X/postgres`), so style, not exposure.
Round-2 R11, unfixed.

### n4 · nit · confidence 1.00 — the freeze sentence still prints the raw table name

`00575:228`. Probe R5a, as the table owner:
`23514 proposal_agreement_parts is immutable after its proposal leaves draft`.
Inherited verbatim from 00423:440 and now unreachable by `authenticated`
because of m5's revoke. Round-2 R12, unfixed.

### n5 · nit · confidence 1.00 — build-sheet criterion E does not describe the repo

`build-sheet.md:1240`. Probe R1: deleting a **draft** proposal carrying parts →
`23514 proposal_service_rates is immutable after its proposal leaves draft`,
identical on the pre-00575 control. 00575 does not cause it; the criterion is
simply wrong about today. Round-2 R13, unfixed.

### n6 · nit · confidence 1.00 — F-5 stands as ruled

`record_paper_client_signature`'s head is still `00477`; 00575 does not redefine
it, so its unrelaxed rate-card refusal survives and a composed flat-fee
agreement's client signature cannot be recorded from a printed copy. Ruled
"keep" in `rulings-2026-09-06.md`; relax by `_agreement_requires_rate_card` in W2.

### n7 · nit · confidence 1.00 — R20's paperwork is still owed

`build-sheet.md:594`. §3.7 step 6 and §6.2 cases 6-7 still instruct projection
"by `part_key`, not by variant"; the implementation reads money by kind+variant
under any key (:2632-2660) and refuses a second money shape
("an agreement carries only one %", :2543-2559), and the suite pins the
implementation. R20 records the deviation as accepted; the sheet was never
amended, and the duplicate refusal is still undeclared in the frozen §2.4.

### n8 · nit · confidence 1.00 — a modified test file is not in the lane's pathspec table

`supabase/tests/commercial/design_services_paper_issue_test.sql` is modified
(two ASSERT strings plus a comment, necessary because refusals B and C were
reworded) but build sheet §2.1 names only `public_sd_hardening_contract_test.sql`.

### n9 · nit · confidence 1.00 — the hook signatures deviate from the frozen §2.4 interface

`packages/supabase/src/hooks/use-agreement-parts.ts:183, :229, :260`. §2.4 freezes
no-arg factories invalidating `['agreement-parts', proposalId]`,
`commercialKeys.document(proposalId)` and `['proposal', proposalId]`. The shipped
hooks bind `proposalId` at construction and invalidate `commercialKeys.all`.
Broader invalidation is safe; the signature change is what makes M2's swap
mechanical. Record the deviation or restore the frozen shapes.

### n10 · nit · confidence 1.00 — `CadencePayload` admits `'per_draw'`, which the door refuses

`packages/types/src/agreement.ts:49` matches contract §2.4 verbatim; `00575:2487-2492`
refuses anything outside monthly/biweekly/milestone with "billing runs monthly,
every two weeks, or at milestones". Documented in-migration as deliberate; W3's
CHECK widen closes it.

### n11 · nit · confidence 1.00 — the pinned-hash re-pin is honest, and it is more than one hex string

`supabase/tests/edge_api/public_sd_hardening_contract_test.sql:1894, :4519`. One
`body_sha256` moved (verified equal to the applied function's digest above) with
a lineage comment in the 00566 style; `arguments`, `result_type`, `final_config`
and `security_definer` are unchanged; the ACL, caller and lock-order contracts
are untouched; `sign_design_services_agreement_with_trusted_ip`'s entry is not
touched. The second hunk restructures the canonical-addendum fixture because
R17(c) removed the grant it used, and is documented in place. Criterion O said
"exactly one hex string moved" — name the fixture restructure at integration so
it is not read as a loosening.

### n12 · nit · confidence 1.00 — `discard_agreement_parts` is not in the frozen cross-lane interface

New RPC (00575:2945) plus a new package hook, both added in round 4 to answer
M3. Neither appears in contract §2, build sheet §2.4, or any ruling. Additive
and correct, but the frozen interface should say so before the designer lane
codes against it.

### n13 · nit · confidence 0.90 — flag-off refusal copy is not byte-identical

Probe R2, a parts-less `design_services` draft with no terms row:
`design-services send requires terms, and role rates whenever a rate card is
present` where main says `design-services send requires terms and role rates`.
The seven-facet room prints RPC messages verbatim
(`service-agreement-drafting-room.tsx:270-274`). The path is close to
unreachable (`upsert_design_services_draft` refuses an empty rates array, so
terms-without-rates needs a separate delete), and the sentence now names "a rate
card" — a concept the seven-facet room does not have. The sign-side twin
(`design services agreement requires terms, and at least one role rate whenever a
rate card is present`) is homeowner-facing if it ever fires.

### n14 · nit · confidence 1.00 — the designer lane's comment about the DB floor is now stale

`apps/designer-portal/src/components/document/rooms/drafting/agreement/readiness.ts:245-247`
says `_agreement_floor_unmet` "reads EVERY part, visible or not". As of this
round it reads both scopes. One line, designer worktree. (The lane's own notes
already record this as owed.)

### n15 · nit · confidence 0.85 — `discard_agreement_parts`'s comment over-promises the fingerprint restoration

`00575:2976-2978`: "the fingerprint goes back to what it was before the first
part landed". True after a bare `materialize` (probe Q1d), but a save between
materialize and discard has already projected the composed money into the terms
row, and discard deliberately does not re-project — so the digest returns to the
*composed-terms* value, not the pre-open one. Also: discard does not undo the
`legacy → design_services` widen `upsert_agreement_parts` performs.

### n16 · nit · confidence 1.00 — env.md's scratch-DB recipe is wrong, and the shared stack is no longer at 00574

`env.md:100-116` writes `pg_dump --no-owner --no-acl`; `--no-acl` strips every
GRANT and makes two of the lane's own gate suites fail with
`permission denied for table proposals` and `a public 00511 direct ACL tuple
drifted`. And `env.md:60` records the shared stack at `00574, 00573, 00572`; it
now reports head `00575` carrying a **pre-R17** body of this branch's file
(`_agreement_floor_unmet` present, `discard_agreement_parts` absent,
`authenticated` still holding UPDATE on `proposal_service_terms`). Any scratch DB
dumped from it inherits stale bodies unless the new objects are dropped first.
The integration steward's reset clears it; recorded so nobody reads a green from
that stack as a green for this branch.

---

## What I did not do

- No `pnpm supabase:reset`. The shared stack is not this reviewer's to reset, and
  the five red suites in m7 can only be settled there.
- No portal gates. The designer and client lanes carry their own reviews; I read
  their files only where a backend claim reached into them (M1-new, M2, M3, m6,
  n13, n14).
- Both scratch DBs (`patina_w1rev`, `patina_w1ctl`) dropped at the end of the round.
