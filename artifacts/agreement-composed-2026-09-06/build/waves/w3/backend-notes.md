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
