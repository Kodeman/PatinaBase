# Wave 3 · backend lane — log

**Program**: The Agreement, Composed · **Wave**: 3 (turnkey, P9–P14) · Date 2026-09-07
**Worktree**: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-backend`
**Branch**: `agreement/w3-backend` · **Base**: `3a503fee20c3f0eee2a51dc8ea90eda47ad8a30b`

Nothing was pushed. Nothing reached Strata. No edge function and no Worker was
deployed. The shared local stack was never reset or written to — every apply,
every test and the type generation ran against a scratch clone.

---

## 1 · What shipped

| Path | |
|---|---|
| `supabase/migrations/00578_design_build_kind.sql` | new · 7 545 lines |
| `supabase/migrations/00579_trade_agreements.sql` | new · 802 lines |
| `supabase/seed/00-legacy-grants.sql` | REGENERATED (`python3 scripts/generate-legacy-grants.py`) · +366 / −0 |
| `packages/supabase/src/database.types.ts` | REGENERATED · +593 / −0 |
| `supabase/tests/commercial/design_build_test.sql` | new · 14 assertion blocks (SQL-T1 … T15) |
| `supabase/tests/commercial/trade_agreement_test.sql` | new · 8 assertion blocks (SQL-A1 … A9 + ACL) |
| `supabase/tests/edge_api/public_sd_hardening_contract_test.sql` | re-pin only · +7 / −7, every line a hash literal |
| `supabase/tests/edge_api/platform_acl_compatibility_test.sql` | registers the wave's RPCs + a Wave-3 anon-denial block |
| `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` | registers the wave's RPCs |
| `supabase/tests/commercial/agreement_parts_test.sql` | **outside the sheet's pathspec list, and required** — see §5 |
| `supabase/tests/commercial/agreement_library_test.sql` | **outside the sheet's pathspec list, and required** — see §5 |

Mint numbers held: `ls supabase/migrations/*.sql | sort | tail -1` on this
branch was `00577_agreement_fee_schedules.sql`, so `00578` and `00579` are
`head+1` and `head+2` exactly as `env.md` predicted. **Re-check the tip before
integration** — numbers minted at branch time are provisional.

---

## 2 · Every function redefined, and the body it was grafted from

Each was head-resolved at branch time with the skill's grep
(`grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort | tail -1`),
extracted **byte-for-byte** by a builder script, and patched with an *asserted*
textual delta: the build aborts if the expected occurrence count of a delta's
anchor text does not match, which is the mechanism that catches a head that
moved under W1/W2. The builder lives at
`scratchpad/build_00578.py` + `scratchpad/grafts.py`; the migration it emitted
is what is committed.

| Function | Head grafted from | Delta |
|---|---|---|
| `_agreement_fee_unnamed` | `00575:452-492` | + a `pricing_basis` arm (F-W3-1) |
| `upsert_design_services_draft` | `00575:2325-2402` | kind allowlist |
| `_sign_design_services_agreement_authorized` | `00577:1668` (5-arg) | kind allowlist **[PINNED]** |
| `guard_commercial_signature_insert` | `00566:89-300` | origin-actor leg + via×kind matrix **[PINNED]** |
| `app_private.issue_invoice_for_actor` | `00511:3713-4096` | the retainer anchor, **both** occurrences **[PINNED]** |
| `_is_design_services_project` | `00412:2326-2338` | origin motif |
| `classify_project_time_entry_authority` | `00575:2002-2223` | origin motif |
| `guard_project_ffe_purchase_authority` | `00423:655-746` | origin motif |
| `_create_furnishings_authorization_from_schedule_00444_impl` | `00423:897-1188` | origin motif ×2 (see F-W3-5) |
| `create_trade_scope` | `00423:1284-1368` | origin motif ×2 |
| `publish_budget_checkpoint` | `00423:3266-3409` | origin motif |
| `get_client_project_threshold` | `00565:447-614` | origin motif |
| `_execute_furnishings_authorization_authorized` | `00511:5372-5773` | origin motif **[PINNED]** |
| `_execute_trade_scope_authorized` | `00511:5787-6118` | origin motif **[PINNED]** |
| `_execute_furnishings_authorization_on_paper_authorized` | `00511:4639-5025` | origin motif **[PINNED]** |
| `_execute_trade_scope_on_paper_authorized` | `00511:5039-5358` | origin motif **[PINNED]** |
| `upsert_agreement_parts` | `00577:1034` (3-arg) | 6 deltas (PART 8) |
| `materialize_agreement_template` | `00576:718-877` | the R10 gate + the class→kind flip |
| `_countersign_design_services_agreement_impl` | `00577:1942-2548` | 4 deltas **[PINNED]** |
| `send_commercial_document` | `00575:599-908` | the design-build arm + `total_amount` + the ledger materialization |
| `get_client_commercial_document_bundle` | `00577:2559-2841` | the `designBuild` arm (R13) |
| `compose_agreement_consent` | `00577:752-897` | the turnkey sentence (F-W3-2) |
| `_agreement_design_build_subs` | new in 00578 (stub) → re-headed in 00579 | see §4 |

**Pins.** Seven bodies moved and seven hashes were re-pinned in
`public_sd_hardening_contract_test.sql`, computed by reading the OLD hash off
the pristine clone and the NEW hash off the migrated one, so a pin can only
move to a hash the database actually holds (`scratchpad/repin.py`). The diff is
7 insertions / 7 deletions and **every changed line is a 64-hex literal** — no
`ASSERT` was deleted (RC-14). `_sign_design_services_agreement_authorized` is
named in that file by signature but not hashed, so its body change moved no pin.

---

## 3 · The ten head-resolved origin functions, re-derived

The build sheet's PART 7c enumerator was re-run on this branch
(`scratchpad/enum7c.py`, verbatim from §5's script). It returned **exactly ten**
head-resolved functions carrying the "design-services origin" motif:

```
_execute_furnishings_authorization_authorized            00511
_execute_furnishings_authorization_on_paper_authorized   00511
_execute_trade_scope_authorized                          00511
_execute_trade_scope_on_paper_authorized                 00511
_is_design_services_project                              00412
classify_project_time_entry_authority                    00575
create_trade_scope                                       00423
get_client_project_threshold                             00565
guard_project_ffe_purchase_authority                     00423
publish_budget_checkpoint                                00423
```

All ten are grafted. The sweep also printed nine other head-resolved bodies
mentioning `'design_services'`; each was classified, and the classification is
written into the migration banner:

- **required, and grafted here**: the ten above, plus the three PART 7b pins and
  the four composer/bundle/consent functions.
- **deliberately single-kind, left closed**: `_issue_design_services_agreement_on_paper`,
  `_record_paper_client_signature_impl` (paper execution of a turnkey prime is
  out of scope, §1.2), `discard_agreement_parts` and `materialize_standard_parts`
  (both are the nine-part design-services composition's own doors),
  `save_agreement_as_template` (Wave 4), `create_service_addendum` (an addendum
  to a turnkey prime is out of scope), `begin_direction_from_discovery`.
- **not required**: `set_invoice_studio_id` — its per-kind list scopes the
  CLIENT-ACTOR leg of a PROJECT-BOUND invoice, and every draw invoice is
  inserted by the studio or by service_role. The deposit, minted before
  countersign, has no project at all and takes 00571's studio-anchored branch.

---

## 4 · Findings against the build sheet

Six, each recorded in the migration banner rather than silently fixed.

**F-W3-1 · `_agreement_fee_unnamed` refuses every design-build signature.**
R22's fee floor (`00575:452`) counts only `rate_card`, `flat` and `per_phase`,
and a turnkey prime carries none of them. It is asked at all three doors, so
widening the kind lists alone would have shipped a client signature that raises
*"This agreement names no fee."* — from inside
`_sign_design_services_agreement_authorized`, after PART 7b had already let the
kind through. PART 7a teaches the predicate that a pricing basis carrying a
contract sum names a fee (R4's "the typed money part for this class is
`pricing_basis`"). The reading stays `client_visible`-only (R33). **The build
sheet's PART 7b list did not have this, and without it the walk's step 12 could
not happen at all.**

**F-W3-2 · `compose_agreement_consent` returns the generic fallback.**
00577's composer routes any kind outside `design_services`/`service_addendum`
to *"I agree to the scope and investment in this proposal."* — which is exactly
the sentence the walk's step 12 names as the tell of a missed branch, and it is
the sentence FROZEN INTO THE SIGNATURE ROW. PART 12b composes the turnkey
sentence from the money parts a turnkey prime actually carries.

**F-W3-3 · `create_draft_invoice` has no origin leg of its own.**
The sheet's PART 7c lists it at `00511:3846`; the enumerator attributes that
line to `app_private.issue_invoice_for_actor`, whose body it is. Not grafted.
Likewise `get_client_project_selections` carries the motif at `00423:2963` but
its head is `00441:82`, which does not — nothing to graft.

**F-W3-4 · `issue_agreement_draw_invoice` needs `service_role`.**
The sheet's PART 10 grant line says `GRANT EXECUTE … TO authenticated` while
its own step 2 requires the client-portal sign route's **service client** to
call it for the deposit (D-W3-2). The two cannot both be true. Granted to
`authenticated, service_role`; both grantees are registered in
`platform_acl_compatibility_test.sql` and asserted by name.

**F-W3-5 · the furnishings impl the sheet names carries no origin motif.**
PART 7c asks for `_create_furnishings_authorization_from_schedule_impl`. The
chain is: 00423 authors the body → **00445:83** renames it to
`_create_furnishings_authorization_from_schedule_00444_impl` and puts a
readiness wrapper in its place → **00462:1401** renames THAT wrapper to
`_..._impl`. The origin motif lives in the `_00444_impl` body, and that is what
is grafted. Grafting the function the sheet names would have changed nothing
and left the refusal standing.

**F-W3-6 · D-W3-3's ordering is the other way round.**
The sheet says the pre-graft signature "must fail at the guard, not at the RPC".
Run on the pristine clone (`scratchpad/pregraft_probe.sql`, rolled back):

```
PRE-GRAFT REFUSAL 0 (writing the kind at all):
  new row for relation "proposals" violates check constraint "proposals_document_kind_check"
PRE-GRAFT SEND: NONE — a pre-graft send lets a turnkey prime out the door
PRE-GRAFT STATE AFTER SEND: sent
PRE-GRAFT REFUSAL 1 (the client signature):
  proposal b1300000-… is not a design services agreement or addendum
```

So: the CHECK refuses the kind before anything else; with only the CHECK
widened, **`send_commercial_document` does not refuse at all** — the sheet's
§3.3 fail-open analysis, confirmed empirically — and the first function-level
refusal is the **RPC**, `_sign_design_services_agreement_authorized`, not the
guard. The guard is second and `issue_invoice_for_actor` third (at countersign).
All three are grafted; the order is recorded so the fix is proven to be the fix.

---

## 5 · Deviations, and why

1. **Two W1/W2 test files were edited outside the sheet's pathspec list**, because
   this wave's behaviour change makes their assertions false and no other lane
   owns them:
   - `agreement_parts_test.sql` R7(d) asserted `per_draw` is REFUSED with W1's
     three-value sentence. PART 2 widens both cadence CHECKs, so the case now
     asserts an *unknown* cadence is refused with the four-value sentence, and a
     new case (d2) proves `per_draw` saves and reaches the money row.
   - `agreement_library_test.sql` asserted three seeded templates and
     `NOT EXISTS patina.design_build`. PART 13 seeds the fourth; the case now
     asserts four, the design_build class, and (unchanged) that being in the
     Library is not being usable — the attestation gate is
     `materialize_agreement_template`'s question, not RLS's.
2. **`_validate_allowances_payload` takes a second, defaulted argument.** The
   cross-check the sheet requires — an allowance and its schedule-of-values line
   are one number said twice — cannot be made from the allowances payload alone.
   The one-argument call still resolves and still checks the shape; the send door
   always passes both.
3. **The turnkey payload validators run at Save only once a payload is
   materially complete** (a basis chosen AND at least one cost line; two or more
   draws; at least one allowance). R22's ruling — paid for in Wave 1's walk — is
   that A DRAFT IS ALLOWED TO BE UNFINISHED, and a freshly materialized turnkey
   template carries an empty basis and an empty draw list. Send asks all four
   unconditionally, and parts freeze when the document leaves draft (R6), so
   nothing half-composed can reach a homeowner. `_validate_no_double_count` IS
   asked at every Save: it is a contradiction, not incompleteness (§4.3).
4. **The sub-disclosure mode is authored once, on the sub-disclosure clause**,
   where §4.1 puts the selector. The sheet also allows it inside the pricing
   basis payload, so `_agreement_sub_disclosure` reads both and **refuses a
   disagreement** rather than silently resolving one; the send door refuses when
   neither says.
5. **`_agreement_design_build_subs` is a stub in 00578 and re-headed in 00579.**
   The client bundle must not name `studio_trade_agreements` before that table
   exists: a failed 00579 would otherwise leave `get_client_commercial_document_bundle`
   unplannable for every client of every kind.
6. **No `DECISIONS.md` entry.** `docs/design/the-document/DECISIONS.md` is the
   integration steward's per the Wave 2 precedent (R1 satisfied at merge). Owed.

---

## 6 · Gates

Scratch database, per the brief: `patina_w3`, cloned from the shared stack at
migration head **00577** (531 ledger rows) with `pg_dump -Fc` + `pg_restore`
(the plain-SQL dump's `\restrict` header is incompatible with psql 18 and
silently drops every `COPY`). A second, PRISTINE clone `patina_w3_base` was kept
for attribution. Both were dropped at the end.

**Clone fidelity, stated up front.** `postgres` on this stack is not a superuser
and cannot `SET ROLE supabase_auth_admin`, so `pg_restore` skipped some
ownership and five FK constraints (re-added `NOT VALID` before type generation
— see the types gate), and `pg_cron` cannot exist outside the `postgres`
database. Thirteen suites fail on BOTH clones for those reasons; the attribution
below is what matters.

### Migrations apply clean

```
psql -d patina_w3 -v ON_ERROR_STOP=1 -f supabase/migrations/00578_design_build_kind.sql
  → … CREATE FUNCTION ×22 … INSERT 0 1 … COMMIT      (no error)
psql -d patina_w3 -v ON_ERROR_STOP=1 -f supabase/migrations/00579_trade_agreements.sql
  → COMMIT                                            (no error)
```

Both re-run clean a second time (idempotent).

Object probes, not the ledger:

```
proposals_document_kind_check                     → 6 values incl. design_build
project_commercial_documents_document_kind_check  → 5 values incl. design_build
proposal_service_terms_billing_cadence_check      → monthly|biweekly|milestone|per_draw
to_regprocedure('public.issue_agreement_draw_invoice(uuid,text)')  → non-NULL
select count(*) from agreement_jurisdiction_notices              → 6
select count(*) from agreement_jurisdiction_notices where enabled → 0
patina.design_build → class design_build, 10 parts
```

### SQL suites

`scripts/run-sql-tests.sh` (needs the sandbox override), `PGURL` pointed at the
scratch DB.

| | pristine clone (pre-wave) | with 00578 + 00579 |
|---|---|---|
| total | 164 | **166** |
| green | 130 | **132** |
| expected-fail | 21 | 21 |
| unexpected-fail | 13 | **13** |
| effective-green | 151 / 164 | **153 / 166** |

**The thirteen are the same thirteen, name for name, on both clones** — every
one an artifact of the clone (`pg_cron` absent, or ACL/ownership fidelity):
`aesthete/house_portfolio`, `aesthete/jobs_queue`, `aesthete/nightly`,
`agent_os/groom`, `agent_os/vitals`, `auth/qr_auth_handoff`,
`billing/invoice_links`, `edge_api/catalog_roles_remote_conformance_negative`,
`edge_api/public_acl_residual_census`, `mood_boards/maintenance_quota`,
`notifications/decision_first_notice`, `scan_pipeline/scan_roles_conformance`,
`workflow/canonical_workflow_spine`. **Zero net-new failures.**

An interim run before the re-pin showed **fourteen** — the extra one was
`edge_api/public_sd_hardening_contract_test.sql`, exactly as it should have
been: seven bodies moved. After the re-pin it is green on the migrated clone and
red on the pristine one, which is the correct direction.

The two new suites, run directly:

```
psql -d patina_w3 -v ON_ERROR_STOP=1 -f supabase/tests/commercial/design_build_test.sql
  PASS T1  · both document_kind CHECKs admit design_build and nothing else new
  PASS T4  · the attestation gates the template at the load-bearing door
  PASS T6  · the Halvorsen table reproduces to the cent, with no float anywhere
  PASS T10 · supervision is paid once, said identically at both doors
  PASS T5/T9 · the draws agree with the contract sum, and a dark notice cannot travel
  PASS T9  · the six notices are seeded, dark, invisible and unflippable
  PASS T11 · W1's parts fold carries the turnkey class — no third CASE arm is owed
  PASS     · the draw ledger is machine-owned and written only at send
  PASS T13/T8 · the turnkey signature lands, and the deposit is offered at client_signed
  PASS T3  · per_draw reaches the authority and the origin records design_build
  PASS T14 · the retainer anchor is widened once per branch, and resolves to one
  PASS T7  · draws issue in order, a void frees one, and retainage is withheld
  PASS T2/T15 · every origin reader answers for a turnkey project
  PASS T12 · every new function is anon-denied by name and grants exactly what it should
  → 14 blocks, 0 failures

psql -d patina_w3 -v ON_ERROR_STOP=1 -f supabase/tests/commercial/trade_agreement_test.sql
  PASS A1  · create, send, mint, resolve, sign — and the link is spent
  PASS A2  · signing twice is the same receipt, not a second act
  PASS A3  · six kinds of dead link, six NULLs, no error and no leak
  PASS A5  · the DTO is frozen both ways, and carries no client, no project, no bid
  PASS A4  · one token, one agreement — and the tables are closed to everyone else
  PASS A6/A7/A8 · append-only signatures, frozen terms, and a void that spends its links
  PASS A9  · the prime keeps its two parties, and the sub signs on its own table
  PASS     · every Trade Agreement RPC grants exactly one role, and anon holds nothing
  → 8 blocks, 0 failures
```

Regression suites the sheet names, on the migrated clone:
`commercial/trade_scope_test` (expected-fail, pre-existing),
`commercial/design_services_authority_test` (expected-fail, pre-existing),
`commercial/multi_studio_signature_test` **PASS**,
`commercial/agreement_parts_test` **PASS**,
`commercial/agreement_library_test` **PASS**,
`commercial/agreement_parts_projection_test` **PASS**,
`commercial/agreement_fee_schedules_test` **PASS**,
`billing/studio_invoice_test` **PASS**,
`edge_api/public_sd_hardening_contract_test` **PASS**,
`edge_api/public_rpc_authorization_contract_test` **PASS**.

`edge_api/platform_acl_compatibility_test` aborts at line 164 on **both** clones
on a database-level PUBLIC-privilege assertion that only holds on a real
`supabase db reset` stack, so the wave's own registrations in that file were
extracted and run standalone against the migrated clone:
`PASS: the Wave 3 registrations in platform_acl_compatibility_test hold`
(`scratchpad/probe_acl.sql`). **The integration steward must re-run that file
whole on the reset shared stack.**

### ACL seed

```
python3 scripts/generate-legacy-grants.py
  → wrote supabase/seed/00-legacy-grants.sql — baseline + 2559 replayed statements
git diff --stat supabase/seed/00-legacy-grants.sql
  → 1 file changed, 366 insertions(+)          ← additive only; nothing removed (R31)
psql -d patina_w3 -f supabase/seed/00-legacy-grants.sql   → 0 errors
```

### Generated types

```
supabase gen types typescript --db-url postgresql://…/patina_w3 > <tmp>   (1 164 771 bytes)
cp <tmp> packages/supabase/src/database.types.ts
git diff --stat packages/supabase/src/database.types.ts
  → 1 file changed, 593 insertions(+), 0 deletions(-)
```

Purely additive — the seven new tables and the eight new RPCs, and nothing
removed. (The first generation showed 83 deletions; every one was a FK
`Relationships` entry the clone had lost in `pg_restore`. The five constraints
were re-added `NOT VALID` and the regeneration is clean. Written to a temp file
and copied, never a shell redirect onto the target — `pnpm db:generate`
truncates it to 0 bytes when `SUPABASE_DB_URL` is unset.)

```
pnpm --filter @patina/types type-check      → clean
pnpm --filter @patina/supabase type-check   → clean
```

---

## 7 · Owed to the integration steward

1. **`pnpm supabase:reset` on the shared stack**, twice: once to prove 00578 and
   00579 replay from zero, and once more after the regenerated
   `seed/00-legacy-grants.sql` to prove the seed replays byte-for-byte. Neither
   was run here — the shared stack is not this lane's.
2. **`edge_api/platform_acl_compatibility_test.sql` whole**, on that reset stack.
3. **Re-check the migration tip** before merging; `00578`/`00579` are provisional.
4. **`docs/design/the-document/DECISIONS.md`** — one `### R<N>` entry recording
   R10, R11, R13, R15, R16 as ruled and D-W3-1 / D-W3-2 as structural.
5. **The interface freezes the other lanes are waiting on** (published here
   because this lane cannot message another):
   - **I-3** `issue_agreement_draw_invoice(p_proposal_id uuid, p_draw_key text) RETURNS jsonb`
     → `{ drawKey, label, amountCents, retainageCents, netCents, invoiceId, invoiceStatus, payToken }`.
     `amountCents` is the GROSS and `netCents` is what the invoice carries
     (retainage is withheld, not billed). `payToken` is the `invoice_links.token`
     — build `/pay/<payToken>` from it and call nothing else; it can be `null`
     and that is recoverable, not an error. Granted to `authenticated` AND
     `service_role` (F-W3-4).
   - **I-4** `resolve_trade_agreement_link(p_token text) RETURNS jsonb`, thirteen
     keys exactly: `studioName`, `agreementTitle`, `contactDisplayName`, `scope`,
     `priceCents`, `currency`, `schedule`, `retainageBps`, `payWhenPaidDays`,
     `insuranceCertificateRequired`, `lienWaiverPolicy`, `state`,
     `existingSignature`. NULL on every miss. `sign_trade_agreement_by_token(
     p_token, p_signed_name, p_signed_ip)` returns
     `{ outcome: 'saved' | 'already_signed' | 'agreement_void' | 'invalid_link', … }`
     — a replay is `already_signed` with the ORIGINAL receipt, never an error.
   - **The client bundle** gains `designBuild: { documentId, subDisclosure, draws[],
     retainageHeldCents, subs[] }`. `draws[]` = `{ drawKey, label, grossCents,
     retainageCents, netCents, isRetainageRelease, invoiceStatus, paidAt,
     lienWaiver: { type, receivedAt } | null }`. `subs[]` = `{ displayName,
     companyName, trade, awardedPriceCents }`, and `awardedPriceCents` is NULL
     under `closed_book` (R13).
   - **The consent sentence the client lane's `consentLineFor` must mirror**, for
     the Halvorsen set (closed-book, GMP, 4 draws + 5% retainage, 3 allowances):
     > I agree to these design-build terms, the cost-plus pricing basis and its
     > guaranteed maximum price, the schedule of values, the draw schedule, the
     > retainage withheld from each draw, and the allowances and what happens if
     > they run over, and understand my signature alone does not authorize work
     > until the studio countersigns.

     Canonical fragment order, independent of the designer's part order:
     pricing basis → schedule of values → draw schedule → retainage →
     allowances. Zero fragments returns the legacy literal:
     *"I agree to these design-build terms and understand my signature alone
     does not authorize work until the studio countersigns."*
   - **Part payload shapes** (`packages/types/src/agreement.ts` is the designer
     lane's; these are what the database validates):
     `pricing_basis` `{ basis: 'fixed'|'cost_plus'|'cost_plus_gmp'|'tm_nte',
     costLines: [{id,label,category:'sub'|'general_conditions'|'allowance',basisCents}],
     costBasisCents, feeBps?, gmpCents?, nteCents?, fixedCents?, subMarkupBps?,
     subDisclosure? }` ·
     `draws` `{ retainageBps, draws: [{key,label,pct,sortOrder,retainageApplies}] }`,
     first draw keyed `deposit` with `retainageApplies:false` ·
     `allowances` `{ allowances: [{id,label,amountCents,overageRule:'change_order'|'client_credit',underageRule:'credit'|'retain'}] }` ·
     the sub-disclosure clause carries `mode: 'open_book'|'closed_book'` ·
     a supervision clause carries `supervisionFeeCents` or `supervisionFeeBps`.

---

## 8 · Advisories (not blockers)

- **A turnkey project's logged hours park in `pending_authorization`.** With the
  origin motif widened, `classify_project_time_entry_authority` takes the
  commercial path for a design-build project — and a turnkey agreement carries no
  rate card, so no authority rate matches and the hour is parked rather than
  authorized. That is R9 working as ruled (time is not this class's billing
  basis) and it is asserted as such in SQL-T15(3), but a studio that logs hours
  on a turnkey job will see them sit. Worth a ruling before the walk.
- **The composer's `patina.design_build` template seeds `retainageBps: 500`.**
  R28 says nothing the designer did not type prints as a term; R28-as-amended
  allows a preselected editor default (the cadence precedent). 5% is research 02
  §3's own default and the walk types it. Flagged so it is a ruling, not a drift.
- **`_validate_pricing_basis_payload` and its siblings return studio-facing
  sentences from the database.** §4.3 explicitly blesses this for the
  no-double-count rule ("the sentence is authored by us, not by Postgres"); the
  same reasoning is applied to the other three. Every string was read for R7
  vocabulary — no "clause library", no "contract builder", no column name, no
  "AI".
- **The pristine clone's thirteen failures** are worth one look by the steward on
  a real reset stack, to confirm they are the clone and not main.

---

# Round 1 — the adversarial review, and what moved (2026-09-07)

Seven findings came back: four blockers, three majors. All seven are addressed
in the two migrations rather than deferred. Nothing was pushed; nothing reached
Strata; the shared stack was never written to. Every number below was read off a
fresh pair of clones — `patina_w3base` (pristine, head 00577) and `patina_w3mig`
(the same dump with 00578 + 00579 applied) — cloned this round WITH their ACLs
(`pg_dump --no-owner -Fc`, no `--no-acl`), which is the fidelity the earlier run
lacked and the reason its regression numbers were noisier than they needed to be.

## R1-1 · B1 + B2 — the keepsake had no money on it, and closed with a lie

`_render_agreement_snapshot_html` (00577:476) is what R12 freezes at countersign
and what the homeowner keeps for the life of the project. Its schedule CASE knew
`rate_card / per_phase / ceiling / flat / retainer / cadence / procurement` and
nothing else, so a turnkey prime's three money parts fell through the record-only
fallback — and then the body closed, unconditionally, with *"This agreement
authorizes design services only…"* on a construction contract.

**PART 12c** grafts the function VERBATIM from 00577:476-724 and adds three arms
and a boundary that knows its class. It is now in the banner's lineage list,
where it should have been from the start.

The figures are not a second implementation: the pricing basis goes through the
same `_agreement_redact_client_payload` the bundle uses, the schedule of values
through the same `_agreement_schedule_of_values`, the draws through the same
`_agreement_draw_rows` the ledger was materialized from, and every figure is
formatted by the new `_agreement_money_to_the_cent` (`_agreement_money` rounds to
whole dollars, which is right for a services agreement and wrong for a draw of
$23,978.19). The keepsake deliberately carries NO invoice status, paid date or
waiver receipt — that is machine state which moves for years afterwards, and a
frozen page that named it would be a page that lies a week later.

The actual snapshot, read off the migrated clone by driving the lane's own
Halvorsen fixture through countersign (`scratchpad/probe.sql`, rolled back):

```
<h2>Pricing basis</h2><p>The cost of the work, plus the studio’s fee on it, and
the total will not exceed the guaranteed maximum price below.</p>
<p class="ceiling-label">Guaranteed maximum price</p><p>$84,134</p>
<h2>Schedule of values</h2><table>… $44,840 / $11,210 / $8,496 / $7,434 /
$4,720 / $4,130 / $3,304 … <tr><td>Total</td><td>$84,134</td></tr></table>
<h2>Draw schedule</h2><table>
  <tr><td>Deposit at signing</td><td>$8,413.40 of the price</td><td>$8,413.40</td></tr>
  <tr><td>Rough-in</td><td>$25,240.20 of the price · $1,262.01 held back</td><td>$23,978.19</td></tr>
  <tr><td>Cabinets set</td><td>$33,653.60 of the price · $1,682.68 held back</td><td>$31,970.92</td></tr>
  <tr><td>Substantial completion</td><td>$16,826.80 of the price · $841.34 held back</td><td>$15,985.46</td></tr>
  <tr><td>Final · retainage release</td><td></td><td>$3,786.03</td></tr></table>
<p>$3,786.03 is held back across the draws and released when the work is finished.</p>
<h2>Allowances</h2><table>… $4,000 · "Anything over this amount needs a change
order first. Anything under it comes back to you." …</table>
… clauses …
<p class="boundary">This agreement covers the work described above, at the price
shown. Anything added to it is a separate written change order before the work
is done.</p>
```

Cent for cent the walk's own table, and the closing sentence is
`design-build-body.tsx`'s verbatim, so the two surfaces cannot say different
things. Covered by the new **T17**.

## R1-2 · B3 — a closed book that published the book

`get_client_commercial_document_bundle` projected `'payload', ap.payload` for
every client-visible part, so on a closed-book turnkey prime the homeowner was
handed `costLines` (the trades AT COST), `feeBps`, `subMarkupBps` and
`costBasisCents`. Hiding the part instead is impossible: R22 counts only
client-visible fee parts and `pricing_basis` is a turnkey prime's only fee, so
`client_visible = false` makes her signature raise *"This agreement names no
fee."* RC-4 asks precisely that a trade's bid not be derivable from her copy.

`_agreement_redact_client_payload(kind, variant, payload, disclosure)` is now the
one edge: under anything that is not `open_book` (a `conflict` between the clause
and the payload included — fail closed) the four keys stay behind and the DERIVED
schedule of values goes over in their place, plus `contractSumCents`, which is
her own number and, once the cost basis is gone, no longer derivable on a plain
cost-plus basis. Under `open_book` nothing is withheld — that is what the clause
elected — and the schedule is projected in the same key so both modes read alike.
Every other part, and every other kind of document, crosses byte for byte; the
studio's own row is untouched, and the composer does not read through this
function. Covered by the new **T16** and re-asserted on the durable record by
**T17**.

⚠ **This changes the shape the client lane reads** — see §7 below. And it does
not make the schedule uninvertible: the allowance parts state their amounts AT
COST, deliberately (a change-order threshold she is not shown is not a
threshold), so the multiplier remains recoverable by arithmetic from figures she
is entitled to. Closing that would mean authoring the schedule independently of
the cost lines, which changes the walk's own pinned numbers and is a P-level
decision, not a fix. What this fix guarantees is the absolute rule: no trade's
own price, and no bid, is on her page in either mode.

## R1-3 · B4 — the seeded flow-down clause did not exist

§1.2 item 3 says the flow-down body ships seeded and disabled, in the
`patina.design_build` template, pending counsel; nothing carried it. It is now the
template's ELEVENTH entry, `enabled: false`, and
`materialize_agreement_template` skips any entry marked so — a rule stated
generally, and defaulting to `true`, so every other seeded entry composes exactly
as before. The rail still lays out **ten** parts, no agreement anywhere can carry
the key, `flow_down_clause_key` stays NULL, and `create_trade_agreement` still
refuses a payload that tries to set it. Turning it on, when counsel clears it, is
one migration flipping one boolean. Covered by the new **T18**.

## R1-4 · M2 — a sub who signed and reloaded got a 404

Signing revokes the token in the signing transaction (RC-1 requires exactly
that), and `resolve_trade_agreement_link` demanded `status = 'active'` — while
`sign_trade_agreement_by_token`, asked the same question, still answered
`already_signed` with the receipt. Two RPCs disagreeing about what a spent link
is, on the one surface with no login and no other way back in, against §4.5's
"already signed → the settled receipt" and walk step 16's "a fresh load of the
same URL still shows the receipt".

Ruled the way both documents ask: `studio_trade_agreement_tokens` gains
`spent_at`, written by the signing transaction and by nothing else. Resolve
accepts an active token, or a spent one on a signed agreement, until it expires.
Every other revocation — a void, a re-mint — carries no `spent_at` and still
resolves to NULL, so RC-1's rule holds for every revocation that is somebody
else's decision. `trade_agreement_test` A3 now runs seven cases instead of six:
the spent link comes back as the receipt (with no key of the client's on it), and
a link superseded by a re-mint is dead while its successor resolves.

## R1-5 · M3 — the lien waiver had no door

`agreement_draw_lien_waivers` was written by a direct `GRANT INSERT` plus an RLS
policy, against this build's own rule that no wave writes a business table
outside a definer RPC — and it showed: `waiver_type` was policed by nothing but a
non-empty CHECK, the trade's display name was whatever the caller typed, and P12's
recording act had no published interface at all.

The grant and the policy are withdrawn (`GRANT SELECT` only) and **PART 5b** is
the door: `record_agreement_draw_lien_waiver(draw, type, contact, through_date,
amount, storage_path, received_at)` holds the type to the four LIEN_WAIVER_TYPES
in the studio's own words, resolves the trade against the studio's roster and
snapshots its name, stamps `recorded_by` from the session, and defaults
`received_at` to now (a waiver with no date is one the ledger cannot tell the
homeowner she has). Granted to `authenticated` alone. Covered by the new **T19**,
which also asserts the homeowner still gets `{type, receivedAt}` and never the
amount or the storage path.

## R1-6 · M1 / F-W3-7 — the attestation part, ruled and published

The finding is right that the deviation was in a code comment only. It is now
**F-W3-7** in the migration banner, in the deviation list below, and published to
the designer and client lanes in §7.

The deviation stands, because the build sheet contradicts itself: PART 13 says
`patina.licensing_attestation` is "materialized from `studio_license_attestations`
at compose time" AND, in the same sentence, that it is "a studio-level record
**rather than a rail row**" whose "Client sees" cell is **no** — and §8's walk step
4 asserts **ten** parts in the rail. A row in `proposal_agreement_parts` IS the
rail: materializing one would lay out eleven, would appear in the designer lane's
parts rail (which is built and tested for ten), and would break walk step 4. So no
attestation part is materialized. What gates the class is the studio-level record
itself, asked at both load-bearing doors — `materialize_agreement_template` and
`send_commercial_document` — through `studio_has_live_license_attestation`, which
is what R10 actually rules ("gates selection of the design-build template"). The
`attestation` kind stays in the vocabulary (contract §1) and both snapshot passes
already skip it, so a later wave that decides the paper should carry the
credential can add the row without moving anything.

## Deviations, added to §5

7. **No `patina.licensing_attestation` part is materialized** (F-W3-7, above).
8. **The pricing basis reaches the homeowner redacted under closed book** (B3).
   The bundle is a projection, not a table read, and this is the one edge where
   the disclosure the clause elected can be kept. Published to the client lane.
9. **`studio_trade_agreement_tokens` carries one column `trade_rfq_tokens` does
   not** — `spent_at` (M2). The shape is otherwise 00424's verbatim; the extra
   column exists because a Trade Agreement's link, unlike an RFQ's, has a receipt
   to show after it is spent.

## Gates, re-run this round

Scratch clones `patina_w3base` / `patina_w3mig` (both dropped at the end).

```
psql -d patina_w3mig -v ON_ERROR_STOP=1 -f supabase/migrations/00578_design_build_kind.sql   → COMMIT, no error
psql -d patina_w3mig -v ON_ERROR_STOP=1 -f supabase/migrations/00579_trade_agreements.sql    → COMMIT, no error
   (both re-applied a second time on top of themselves: clean — idempotent)

supabase/tests/commercial/design_build_test.sql      → 18 PASS blocks, 0 errors
   (T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T12 T13 T14 T15 + T16 T17 T18 T19 new)
supabase/tests/commercial/trade_agreement_test.sql   →  8 PASS blocks, 0 errors
   (A3 now proves seven kinds of link, not six)

bash scripts/run-sql-tests.sh   (PGURL → the clone)
                       patina_w3base (pristine)   patina_w3mig (this wave)
   total                       166                       166
   green                       126                       132
   expected-fail                21                        21
   unexpected-fail              19                        13
   effective-green         147 / 166                 153 / 166
```

The migrated clone's thirteen are the SAME thirteen as before, name for name,
every one a clone artifact (`pg_cron` absent, or an extension/database-level ACL a
`createdb` cannot reproduce): `aesthete/house_portfolio`, `aesthete/jobs_queue`,
`aesthete/nightly`, `agent_os/groom`, `agent_os/vitals`, `auth/qr_auth_handoff`,
`billing/invoice_links`, `edge_api/catalog_roles_remote_conformance_negative`,
`edge_api/public_acl_residual_census`, `mood_boards/maintenance_quota`,
`notifications/decision_first_notice`, `scan_pipeline/scan_roles_conformance`,
`workflow/canonical_workflow_spine`. The pristine clone's nineteen are those
thirteen plus the six files this wave makes true — `design_build_test`,
`trade_agreement_test`, `agreement_parts_test`, `agreement_library_test`,
`public_sd_hardening_contract_test`, `public_rpc_authorization_contract_test` —
which is the correct direction. **Zero net-new failures.**

Named regressions, on the migrated clone: `agreement_fee_schedules_test` PASS
(the design-services keepsake still renders as W2 wrote it — the graft added arms,
it did not move one), `agreement_parts_test` PASS, `agreement_library_test` PASS,
`agreement_parts_projection_test` PASS, `multi_studio_signature_test` PASS,
`billing/studio_invoice_test` PASS, `public_sd_hardening_contract_test` PASS —
**no pin moved this round**: the four bodies edited here
(`get_client_commercial_document_bundle`, `materialize_agreement_template`,
`_render_agreement_snapshot_html`, and 00579's two RPCs) are not among that
file's hashed set, and the seven hashes re-pinned last round still hold, which the
suite proves by passing on the migrated clone and failing on the pristine one.
`commercial/trade_scope_test` and `commercial/design_services_authority_test` fail
identically on BOTH clones (pre-existing, recorded in KNOWN_FAILURES).
`edge_api/platform_acl_compatibility_test` still aborts on both clones at its
database-level `PUBLIC must retain only CONNECT` assertion — the clone's `datacl`
is empty where the stack's is not — so this round's new registrations in that file
were run standalone against the migrated clone:
`PASS: the Wave 3 round-1 registrations in platform_acl_compatibility_test hold`.
**The steward must still run that file whole on the reset shared stack.**

```
python3 scripts/generate-legacy-grants.py
  → wrote supabase/seed/00-legacy-grants.sql — baseline + 2568 replayed statements
git diff --stat supabase/seed/00-legacy-grants.sql
  → 1 file changed, 55 insertions(+), 1 deletion(-)
     the one deletion is M3: GRANT SELECT, INSERT → GRANT SELECT on
     agreement_draw_lien_waivers. No function's grant was narrowed (R31).
psql -d patina_w3mig -f supabase/seed/00-legacy-grants.sql   → 0 errors

supabase gen types typescript --db-url …/patina_w3mig  → written to a temp file, copied
git diff --stat packages/supabase/src/database.types.ts   (this round, on top of last round's +593)
  → 1 file changed, 32 insertions(+), 0 deletions(-)
     spent_at ×3 (Row/Insert/Update) + the four new functions. Purely additive.
     Five FK constraints the clone lost in pg_restore were re-added NOT VALID
     before generating, or their Relationships entries read as 83 deletions.

pnpm --filter @patina/types type-check      → clean
pnpm --filter @patina/supabase type-check   → clean
```

## Owed, added to §7 — three lanes have to move with this

1. **designer lane — REQUIRED.**
   `packages/supabase/src/hooks/use-design-build.ts:249` writes
   `agreement_draw_lien_waivers` with `.from(...).insert(...)`. That grant is
   gone. The call becomes
   `.rpc('record_agreement_draw_lien_waiver', { p_draw_id, p_waiver_type,
   p_contact_id, p_through_date, p_amount_cents, p_storage_path, p_received_at })`
   — the RPC returns the row as `{ id, drawId, drawKey, waiverType,
   contactDisplayName, throughDate, amountCents, receivedAt }`. Its jest test
   mocks the client, so the suite will stay green while production would not:
   this one has to be read, not run.
2. **client lane — REQUIRED.** On a `design_build` bundle the `pricing_basis`
   part's payload now carries `contractSumCents` and `scheduleOfValues`
   (`[{id,label,cents}]`, already in the elected disclosure mode, last line
   carrying the remainder), and under anything but `open_book` it no longer
   carries `costLines`, `feeBps`, `costBasisCents` or `subMarkupBps`.
   `readPricingBasis` should read `contractSumCents` when present and
   `scheduleOfValues` in place of deriving from `costLines`; as it stands a
   closed-book door renders no schedule of values at all and no cost-basis row.
   Under `open_book` nothing changed. `design-build-body.tsx`'s own R13 note
   ("a schedule that could not be inverted would have to be authored rather than
   derived from the cost lines, which is a backend change and not this wave's")
   is the change this is.
3. **sub lane — informational, and it unblocks them.** `/trade/<token>` after
   signing now resolves instead of 404ing: the DTO comes back with
   `state: 'signed'` and `existingSignature` filled, which is the settled-receipt
   branch §4.5 already describes. A revoked-by-void or superseded link still
   resolves to NULL and must still `notFound()`.
4. **Every lane — F-W3-7.** No `patina.licensing_attestation` part is
   materialized; the rail is ten parts. The attestation is a studio-level record
   read through `studio_has_live_license_attestation`, not a part of the paper.

---

# Round 2 — the three findings, verified, and where each one lands

Round 2 changed **no file on this branch**. All three findings were re-derived
from first principles on a fresh clone; two of them are true and correct
*about this branch's output* while their fix lies in another lane's source, and
the third is a ruling nobody in a lane has the authority to make. What this
round produced is evidence, and the exact instruction each other lane needs.

Branch is unmoved at `782fb31f9`; `git diff --stat main...HEAD` = 17 files,
14 749 insertions, 21 deletions.

## R2-1 (blocker) — CONFIRMED, and it is the client lane's source

The reviewer is right about the shape and right about the direction.

- `_agreement_redact_client_payload` (00578:1408) adds `contractSumCents` and
  `scheduleOfValues` to every `schedule/pricing_basis` payload, then under
  anything but `open_book` returns `v_payload - 'costLines' - 'feeBps' -
  'costBasisCents' - 'subMarkupBps'`. That is B3, and it is correct: those four
  keys are the disclosure the clause declined to make.
- The **keepsake agrees with the backend.** `_render_agreement_snapshot_html`
  (00578:8079) redacts through the same function and then draws its schedule
  from `v_payload->'scheduleOfValues'` (00578:8139-8157), with the Cost basis
  and Fee rows written as explicitly open-book-only rows. Read on the branch,
  the keepsake is not "rendering the full table" — it is rendering the
  *projected* table, correctly, in both modes.
- The **live door does not.** `apps/client-portal/.../design-build-body.tsx` on
  `agreement/w3-client` (read here with `git show`, since that file does not
  exist in this worktree) has `readPricingBasis` build `costLines` from
  `payload.costLines`, set `costBasisCents` as their sum, and derive
  `contractSumCents` from `gmpCents ?? nteCents ?? fixedCents` or from
  `costBasis × (1+fee)`. `scheduleOfValues(reading)` then re-derives the
  pro-ration client-side and short-circuits on
  `costLines.length === 0 || costBasisCents <= 0`. Against a redacted payload
  that is `[]`, so the SOV section, the Cost basis row and the Fee row vanish
  from a closed-book door while the keepsake of the same agreement shows the
  schedule.

So the asymmetry is real and it is one-sided: **the backend and the keepsake
speak the new contract; the client TSX still speaks the pre-B3 one.**

**Not fixable here, and it should not be faked here.** The only backend-shaped
"fix" would be to re-emit the pro-rated schedule under the key `costLines` with
`feeBps: 0` so the stale reader renders something. That would put a table that
is not cost under a name that says cost, would print a Cost basis row carrying
the contract sum, and would defeat T16, which exists to prove those four keys
are gone. Declined.

**Client lane, exactly:** `readPricingBasis` reads `payload.contractSumCents`
when present (it always is, on a design-build bundle) and returns
`payload.scheduleOfValues` — `[{id,label,cents}]`, already in the elected mode,
last line carrying the remainder — in place of re-deriving; `costLines`,
`feeBps`, `costBasisCents` become optional and their rows render only when
present, which is exactly "open book only". `ScheduleOfValuesLeaf` draws the
projected lines. And the closed-book jest fixture in
`commercial-document-shell-design-build.test.tsx` must be rebuilt from what the
bundle actually emits — the present fixture carries `costLines` on a
`closed_book` payload, a shape production cannot produce, which is why J-3 is
green over a door that renders nothing.

## R2-2 (blocker) — CONFIRMED, and it is the designer lane's source

Verified on this branch, line for line:

- 00578:581 `DROP POLICY IF EXISTS agreement_draw_lien_waivers_studio_write`,
  with no policy created in its place; 00578:592-594 `REVOKE ALL … FROM PUBLIC,
  anon, authenticated` then `GRANT SELECT` only. There is no INSERT door on the
  table.
- `agreement/w3-designer`'s `use-design-build.ts` still does
  `.from('agreement_draw_lien_waivers').insert({ draw_id, contact_id,
  contact_display_name, waiver_type, through_date, amount_cents, storage_path,
  received_at, recorded_by }).select().single()`. In production that is a 42501.

**M3 must not be undone.** Restoring the grant would restore three defects at
once, and the shipped call demonstrates all three: `waiver_type` is free text by
the 00417 doctrine and the table has no CHECK, so the client chooses the
vocabulary; `contact_display_name` is sent by the caller rather than snapshotted
off the studio's roster, so the "snapshot" can say anything; and `recorded_by`
is a caller-supplied column, so the record's author is whoever the caller names.
`record_agreement_draw_lien_waiver` (00578 PART 5b) exists precisely to close
those three, and it also resolves the contact against
`studio_contacts.organization_id` and defaults `received_at` to `now()`.

**Designer lane, exactly:** call
`.rpc('record_agreement_draw_lien_waiver', { p_draw_id, p_waiver_type,
p_contact_id, p_through_date, p_amount_cents, p_storage_path, p_received_at })`.
Note the return is **camelCase jsonb**, not a table row —
`{ id, drawId, drawKey, waiverType, contactDisplayName, throughDate,
amountCents, receivedAt }` — so `mapAgreementDrawLienWaiver`, which maps an
`AgreementDrawLienWaiverRow`, does not fit it and the call site should build the
domain object from the RPC's object directly. `contactDisplayName` comes back
from the roster, not from the input, and `recordedBy` is no longer an input at
all. The test must assert the RPC name; as written it asserts
`from('agreement_draw_lien_waivers')` and will stay green over a broken call.

## R2-3 (major) — CONFIRMED as arithmetic, and it is a ruling

Reproduced here on `patina_w3f2`, calling
`_agreement_schedule_of_values(basis,'closed_book')` with the walk's figures
(cost basis 7 130 000, fee 1800 bps, GMP 8 413 400):

```
 Cabinetry & millwork        4484000   ÷ 1.18 = 3800000
 Electrical                  1121000   ÷ 1.18 =  950000
 Plumbing                     849600   ÷ 1.18 =  720000
 General conditions / site    743400   ÷ 1.18 =  630000
 Tile allowance               472000   ÷ 1.18 =  400000
 Plumbing fixtures allowance  413000   ÷ 1.18 =  350000
 Lighting allowance           330400   ÷ 1.18 =  280000
```

Every line inverts to its exact cost, and the homeowner does not need to guess
the divisor: the client-visible allowances part states tile at 400 000 against
the schedule's 472 000, so 1.18 is on the same page as the number it unlocks,
and 4 484 000 ÷ 1.18 is the cabinetry sub's own $38 000. RC-4 asked whether a
sub's bid can be backed out of `line ÷ (1 + fee)`. On this branch it can.

Three of the four ways out, and what each costs:

1. **Author the schedule instead of deriving it.** Closes it completely; moves
   every pinned walk number; is the backend change `design-build-body.tsx`'s own
   R13 note says is "not this wave's".
2. **State the allowances at the marked-up multiple too.** Removes the anchor
   but restates a contractual allowance amount as something other than what the
   studio wrote, on the page the homeowner signs. Declined without a ruling.
3. **Rule that closed book means only "no line is labelled as a trade's
   price".** No code moves; this is what ships today, and the client body's own
   comment already says it in those words — "so no line is printed as what any
   one trade was paid. (Not: so that no line CAN be read that way)". It needs
   to be said in the ship report, not left implied.
4. **(Not in the finding, offered here.) Pass allowance-category cost lines
   through the schedule at their stated amount and spread the fee across the
   non-allowance lines only.** One function changes; the contract sum does not;
   the allowances part and the schedule finally agree instead of disagreeing by
   18%; and the multiple becomes uncomputable, because the homeowner would need
   the non-allowance cost subtotal and she has never been given it. Computed
   here on the same figures:

```
 cabinetry   cost 3800000 → 4599495   ÷ 1.18 = 3897877  (not 3800000)
 electrical  cost  950000 → 1149874   ÷ 1.18 =  974469
 plumbing    cost  720000 →  871483   ÷ 1.18 =  738545
 general     cost  630000 →  762548   ÷ 1.18 =  646227   (remainder line)
 tile        cost  400000 →  400000            = the allowances part, exactly
 fixtures    cost  350000 →  350000            = the allowances part, exactly
 lighting    cost  280000 →  280000            = the allowances part, exactly
                            ────────
                            8413400  = the GMP, to the cent
```

   Its cost: it elects a contract term — that the studio's fee is not earned on
   allowance dollars — and it moves the walk's pinned schedule numbers and
   T16/T17's expectations. That election is not a lane's to make, which is why
   it is written down here rather than committed.

**This lane implements none of the four and encodes none of them.** Baking
option 3 into a COMMENT and a test would pin a ruling that options 1, 2 and 4
would then have to unpin.

## Gates, re-run this round (no source changed; this is a regression proof)

Two fresh clones of the shared stack (`patina_w3base2` pristine at 00577,
`patina_w3f2` with both migrations applied), built with
`pg_dump --no-owner --no-acl --exclude-schema=cron`, then repaired the way
`--no-acl` requires: `supabase/seed/00-legacy-grants.sql` replayed, plus the
schema-level `USAGE` on `auth`/`extensions`/`graphql_public`/`storage`/`vault`
and the 274 `auth`/`storage` table grants and 7 function grants copied from the
shared stack. Without that repair the clone reports ~19 phantom failures that
are nothing but missing ACLs — worth recording, because the first clone this
round did exactly that and it looks like a regression until you read the error.

```
psql -d patina_w3f2 -v ON_ERROR_STOP=1 -f supabase/migrations/00578_design_build_kind.sql  → exit 0, NOTICEs only
psql -d patina_w3f2 -v ON_ERROR_STOP=1 -f supabase/migrations/00579_trade_agreements.sql   → exit 0, NOTICEs only
psql -d patina_w3f2 -f supabase/seed/00-legacy-grants.sql                                  → 0 errors

commercial/design_build_test.sql                → exit 0, 18 PASS
commercial/trade_agreement_test.sql             → exit 0,  8 PASS
commercial/agreement_fee_schedules_test.sql     → exit 0, 11 PASS
commercial/agreement_parts_test.sql             → exit 0, 30 PASS
commercial/agreement_library_test.sql           → exit 0, 14 PASS
commercial/agreement_parts_projection_test.sql  → exit 0,  5 PASS
commercial/multi_studio_signature_test.sql      → exit 0,  7 PASS
commercial/trade_scope_test.sql                 → fails identically on BOTH clones (KNOWN_FAILURES §S2)
commercial/design_services_authority_test.sql   → fails identically on BOTH clones (KNOWN_FAILURES)

bash scripts/run-sql-tests.sh   (PGURL → each clone)
                       patina_w3base2 (pristine)   patina_w3f2 (this wave)
   total                       166                       166
   green                       126                       132
   expected-fail                21                        21
   unexpected-fail              19                        13
   effective-green         147 / 166                 153 / 166
```

The thirteen are a **strict subset** of the nineteen — every one a clone
artifact (`pg_cron` absent, or a database-level ACL a `createdb` cannot
reproduce). The six the wave makes true are the difference:
`commercial/design_build_test`, `commercial/trade_agreement_test`,
`commercial/agreement_parts_test`, `commercial/agreement_library_test`,
`edge_api/public_rpc_authorization_contract_test`,
`edge_api/public_sd_hardening_contract_test`. **Zero net-new failures**, and the
numbers reproduce round 1's exactly.

The pins hold, and this run shows it from the other side: on the pristine clone
`public_sd_hardening_contract_test` dies at line 2397 on `an exact 00511
dependency profile drifted` — the re-pinned hashes — while on the migrated clone
it runs 2 779 lines further before hitting `permission denied for schema auth` at
5176, a database-level ACL the clone cannot carry. **The steward must still run
that file, and `edge_api/platform_acl_compatibility_test`, whole on the reset
shared stack.**

```
pnpm --filter @patina/types type-check      → clean (tsc --noEmit, no output)
pnpm --filter @patina/supabase type-check   → clean (tsc --noEmit, no output)
git status --short -- supabase packages     → no modifications
generated types unchanged: no schema moved this round; the checked-in
  database.types.ts already carries all 22 Wave 3 symbols
  (record_agreement_draw_lien_waiver, studio_trade_agreements,
   agreement_jurisdiction_notices, studio_license_attestations,
   issue_agreement_draw_invoice, sign_trade_agreement_by_token)
```

Both clones dropped at the end.

## What this round leaves open

- **R2-1** — client lane, required, before the walk's step 11 can pass.
- **R2-2** — designer lane, required, before the walk's step 16 can pass.
- **R2-3** — orchestrator ruling, one of the four above, said out loud in the
  ship report whichever way it goes.
