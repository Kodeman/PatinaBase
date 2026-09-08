# Wave 3 · backend lane — adversarial review, round 1

**Program**: The Agreement, Composed · **Wave**: 3 (turnkey, P9–P14) · Date 2026-09-07
**Branch reviewed**: `agreement/w3-backend` @ `001114278` (9 commits, `main..HEAD`)
**Worktree**: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-backend`
**Reviewer**: separate context; did not write this code.

**Verdict: FIX** — four blockers, three majors. The grafts are clean, the arithmetic is
exact, the ACL posture is right and every gate I re-ran is green. What fails is what the
homeowner ends up holding: the keepsake prints no money and closes with a false sentence,
and closed-book disclosure is defeated in the bundle payload.

---

## 1 · Gates I ran myself

Scratch clone `patina_w3r` (and a pristine twin `patina_w3p` for attribution), both
`pg_dump -Fc` / `pg_restore --no-owner` of the shared stack at migration head **00577**,
ACLs preserved (I deliberately did *not* pass `--no-acl`, so grant assertions are real).
Both dropped at the end. The shared stack was never written to.

| Gate | Result |
|---|---|
| `psql -v ON_ERROR_STOP=1 -f 00578_design_build_kind.sql` | rc=0, `COMMIT`, no ERROR |
| `psql -v ON_ERROR_STOP=1 -f 00579_trade_agreements.sql` | rc=0, `COMMIT`, no ERROR |
| Object probes | `proposals_document_kind_check` 6 values · `project_commercial_documents_document_kind_check` 5 values · both `billing_cadence` CHECKs `monthly\|biweekly\|milestone\|per_draw` · `to_regprocedure('public.issue_agreement_draw_invoice(uuid,text)')` non-NULL · notices 6 / enabled 0 · templates 4 · `billing_ceiling_cents` nullable on both tables |
| `scripts/run-sql-tests.sh` on the **pristine** clone | 166 total · green 126 · expected-fail 21 · **unexpected-fail 19** |
| `scripts/run-sql-tests.sh` on the **migrated** clone | 166 total · green 132 · expected-fail 21 · **unexpected-fail 13** |
| Net-new failures | **zero.** The 13 are name-for-name the clone artifacts (pg_cron absent / ACL-ownership fidelity); the 6 that cleared are the wave's own suites |
| `commercial/design_build_test.sql` | PASS (14 blocks) |
| `commercial/trade_agreement_test.sql` | PASS (8 blocks) |
| `edge_api/public_sd_hardening_contract_test.sql` | PASS |
| `edge_api/public_rpc_authorization_contract_test.sql` | PASS |
| `commercial/agreement_parts_test` · `agreement_library_test` · `agreement_parts_projection_test` · `agreement_fee_schedules_test` · `multi_studio_signature_test` · `billing/studio_invoice_test` | PASS |
| `edge_api/platform_acl_compatibility_test.sql` | EXPECTED-FAIL (documented KNOWN_FAILURE on the local image) — see m7 |
| `python3 scripts/generate-legacy-grants.py` then `git diff` | **empty** — the committed seed is reproducible |
| `supabase gen types typescript --db-url …/patina_w3r` vs the committed `database.types.ts` | **0 differing lines** |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/types type-check` | clean |
| Types diffstat | `database.types.ts` +593/−0 · `agreement.ts` +116 · `commercial.ts` +64 — additive only |

## 2 · RC-9 — the grafts (all clean)

I diffed `pg_get_functiondef` for every redefined function between the pristine clone
(= branch-time head, 00577) and the migrated clone. **No stale graft.** Every delta is
this wave's and only this wave's:

- ten origin-motif functions: exactly one or two `= 'design_services'` → `IN ('design_services','design_build')` lines each;
- `_sign_design_services_agreement_authorized`, `guard_commercial_signature_insert`, `app_private.issue_invoice_for_actor`, `_countersign_design_services_agreement_impl`: the D-W3-3 deltas verbatim, nothing else (the countersign origin INSERT now passes `v_proposal.document_kind` instead of the `'design_services'` literal);
- `upsert_design_services_draft`: one IN-list.

I re-ran PART 7c's enumerator on the branch (excluding 00578/00579): **21 head-resolved
hits**, of which exactly **ten** carry the origin motif — the lane's list, name for name —
and all ten are grafted. `_create_furnishings_authorization_from_schedule_00444_impl` is
correctly grafted even though the sheet's own enumerator cannot see it (F-W3-5 is right:
the head is a rename in 00445/00462). Post-migration, the only functions still carrying a
`design_services`-only `document_kind` test are `materialize_standard_parts`,
`send_commercial_document` (its services-terms legs, which must not fire for the new
class), the two paper doors and `discard_agreement_parts` — all four deliberately closed
and all four named in the banner.

**RC-14 — the pins are honest.** The hardening-contract diff is 7 insertions / 7 deletions
and every changed line is a 64-hex literal. No `ASSERT` block was removed. R31 holds:
both old arities of `_sign_design_services_agreement_authorized`,
`sign_design_services_agreement_with_trusted_ip` and `upsert_agreement_parts` still exist
as wrappers with their grants (`{postgres=X, service_role=X}` / `{postgres=X,
authenticated=X}`).

**No new caller of `app_private.issue_invoice_for_actor`.** The five `PERFORM` sites in
00578 are all inside grafted bodies that already had them; `issue_agreement_draw_invoice`
calls `public.issue_invoice(uuid, date)` under the claim-adoption sandwich, as D-W3-3
requires.

**RC-12 — arithmetic.** I recomputed the Halvorsen table independently:
7 130 000 basis · 18 % → 1 283 400 fee · 8 413 400 GMP; draws 841 340 / 2 524 020 /
3 365 360 / 1 682 680 (last row takes the remainder); retainage 0 / 126 201 / 168 268 /
84 134 = 378 603; nets 841 340 / 2 397 819 / 3 197 092 / 1 598 546; release 378 603;
closing identity = 8 413 400. `_agreement_draw_rows` reproduces it with `numeric` +
`round(...)::bigint` throughout — no float, no `to_char` rounding. The invoice carries
`net_cents`, not `gross_cents`.

**Other probes.** Seeded `patina.design_build` refuses UPDATE and DELETE without the
maintenance GUC as `postgres` *and* as `service_role` ("Patina agreement templates are
immutable"). `_commercial_document_fingerprint` was not changed and SQL-T11 proves the
parts fold carries the class (RC-8, partly — see B3). The execution snapshot's
`document_hash` equals `_commercial_document_fingerprint` at execution (probed: equal).

---

## 3 · Blockers

### B1 · The homeowner's kept copy of a turnkey agreement prints no money

`_countersign_design_services_agreement_impl` writes `agreement_execution_snapshots.html`
from `public._render_agreement_snapshot_html` — W2's renderer, which was **not** widened
for the three turnkey schedule variants and appears nowhere in 00578's lineage list or its
"NOT redefined, deliberately" list. Every `pricing_basis` / `draws` / `allowances` part
falls through to the record-only fallback.

Probed on the migrated clone, driving the lane's own fixture through countersign:

```
SNAPSHOT HTML >>><h2>Pricing basis</h2><p>Recorded with your agreement.</p>
<h2>Draw schedule</h2><p>Recorded with your agreement.</p>
<h2>Allowances</h2><p>Recorded with your agreement.</p>…
```

R12 says the frozen HTML snapshot *is* what the client keeps. For an $84,134 construction
contract it keeps a document with no sum, no draws, no retainage and no allowances, while
the live door (client lane) shows all of them. Fix: teach the renderer the three variants,
or state in the banner why a turnkey keepsake may be moneyless.

### B2 · The same keepsake closes with a false statement

`_render_agreement_snapshot_html` appends `c_boundary` unconditionally:

> "This agreement authorizes design services only. Furnishings, freight, tax,
> installation, and purchasing require a separate named furnishings authorization."

On a design-build prime — which authorizes exactly that construction work — this is
homeowner-facing copy that is flatly untrue, and it is frozen into the durable record.
Confirmed in the same probe output. The boundary must be conditioned on the kind.

### B3 · Closed-book disclosure is defeated in the bundle payload (RC-4)

`get_client_commercial_document_bundle` emits `'payload', ap.payload` for every
`client_visible` part. For a design-build prime that means the raw `pricing_basis`
payload. Probed, on the lane's own closed-book fixture:

```
BUNDLE disclosure=closed_book
BUNDLE pricing_basis payload the homeowner receives =
  {"basis":"cost_plus_gmp","feeBps":1800,"gmpCents":8413400,
   "costLines":[{"id":"cabinetry","label":"Cabinetry & millwork","category":"sub","basisCents":3800000}, …],
   "subMarkupBps":0,"costBasisCents":7130000}
```

The at-cost trade prices and the studio's fee reach the homeowner under `closed_book`.
`_agreement_design_build_subs` carefully NULLs `awardedPriceCents` in that mode, and then
the cost line labelled with the same trade hands over the identical number. RC-4 asks
explicitly that a sub's bid not be derivable; it is derivable directly, not even by
`line ÷ (1 + fee)`.

This is not fixable downstream: R22 / `_agreement_fee_unnamed` counts only
**client-visible** schedule parts, and `pricing_basis` is the only fee a turnkey prime
carries — so hiding it makes the signature refuse ("This agreement names no fee."). The
studio cannot ship a closed-book turnkey agreement that keeps its costs. The bundle must
project a pro-rated schedule of values under `closed_book` and withhold `costLines` /
`feeBps` / `subMarkupBps` / `costBasisCents`.

### B4 · The seeded flow-down clause was not delivered

The lane brief lists it as a migration-2 item ("… RLS so a sub token reads only its own
agreement, **the seeded flow-down clause disabled**"); §1.2 non-goal 3 says "the seeded
flow-down clause body exists in the `patina.design_build` template with `enabled = false`
semantics … pending counsel"; R16 says it "ships disabled like R11".

Nothing is seeded. `grep -n "flow_down\|flowDown"` over both migrations returns only the
column, its comments, the freeze-guard line, the fingerprint key, and
`create_trade_agreement`'s refusal of a non-NULL `flowDownClauseKey`. The
`patina.design_build` template's ten parts (verified by SELECT) carry no flow-down clause,
and no notice/clause row holds its body. There is nothing for counsel to review. The
deviation is not recorded in the banner or in `backend-notes.md` §5.

---

## 4 · Majors

### M1 · `patina.licensing_attestation` is never materialized

PART 13: "`patina.licensing_attestation` (kind `attestation`, `client_visible = false`) is
materialized from `studio_license_attestations` at compose time". The lane declares in the
banner at 00578:7456 that it is *not* a rail row and writes no such part. The contract §1
carries `attestation` in `AGREEMENT_PART_KINDS` and an `AttestationPayload` for exactly
this. The deviation is in the migration comment but not in `backend-notes.md` §5's
deviation list, and it was not published to the designer or client lanes, both of which may
be building against the sheet. Either materialize it or get the deviation ruled.

### M2 · A sub who reloads the page after signing gets a 404

`sign_trade_agreement_by_token` revokes the token in the signing transaction (correct per
RC-1) and `resolve_trade_agreement_link` requires `status = 'active'`, returning NULL for a
revoked token (also RC-1). The consequence is that §4.5's "already signed → the settled
receipt: name, date, and nothing to press" and walk step 16's "a fresh load of the same URL
still shows the receipt" are unreachable: the `sub` lane's `page.tsx` calls `notFound()`.
`sign_trade_agreement_by_token` still answers `already_signed` with the original receipt,
so the two RPCs disagree about what a spent link is. The sheet contradicts itself here; the
lane picked one side, tested it (A3), and did not record the conflict. Someone must rule
whether a signed sub sees their receipt or a 404 — a contractor who just signed a $38,000
agreement and reloads to a dead page will call the studio.

### M3 · A business table is written outside a definer RPC

`agreement_draw_lien_waivers` ships with `GRANT SELECT, INSERT … TO authenticated` and an
INSERT policy, i.e. the designer portal writes it directly. The program rules say "No wave
writes business tables outside definer RPCs". Consequences beyond the rule: P12's "a tracked
row per draw records the *exchange*" has no RPC, so no lane has a published interface for
recording a waiver (walk step 16 requires it), and no validation of `waiver_type` against
`LIEN_WAIVER_TYPES` exists at any seam. Precedent is mixed (`trade_scope_bids` is directly
granted; `proposal_agreement_parts` is not), so this is worth an explicit ruling rather than
a silent choice.

---

## 5 · Minors

- **m1 · Unpinned `search_path` on seven new functions.** `_agreement_is_int`,
  `_agreement_contract_sum_cents`, `_agreement_draw_rows`, `_validate_pricing_basis_payload`,
  `_validate_draws_payload`, `_validate_allowances_payload`, `_validate_no_double_count` are
  created with no `SET search_path` (`proconfig` NULL) and are EXECUTE-granted to
  `authenticated`. They are `IMMUTABLE`/invoker and touch no tables, so the risk is small,
  but the program rule is "`search_path` pinned" for every migration and every other new
  function in the wave obeys it.
- **m2 · RC-10's answer is "yes, at the table".** As the seeded designer under
  `SET LOCAL ROLE authenticated`, `UPDATE public.proposals SET document_kind='design_build'`
  succeeded (probe: `NOT REFUSED, rows=1`) with no attestation on file. The gate still holds
  where it matters — `send_commercial_document`'s arm asks
  `studio_has_live_license_attestation` — but the ship report should say the kind itself is
  reachable without an attestation, since RC-10 asks the question directly.
- **m3 · The disclosure mode is never validated.** `_agreement_sub_disclosure` takes `mode`
  off *any* clause part carrying that key (not `patina.sub_disclosure` specifically) and
  never checks it against `open_book|closed_book`. `_validate_pricing_basis_payload`
  constrains `subDisclosure`, but the clause's own `mode` is unconstrained: a value like
  `openbook` passes send (non-NULL, non-conflict) and then silently behaves as closed-book in
  `_agreement_design_build_subs`.
- **m4 · Nothing writes `party = 'studio'`.** `studio_trade_agreement_signatures` models two
  parties and only the sub is ever inserted (one `INSERT INTO
  public.studio_trade_agreement_signatures` in the file). Fine for this wave, but the table
  promises a studio signature the rail cannot produce.
- **m5 · A policy named for a write path that does not exist.**
  `studio_trade_agreements_studio_rw` is `FOR ALL` with a `WITH CHECK`, while the grant to
  `authenticated` is `SELECT` only. Harmless, but the name says the opposite of the ACL.
- **m6 · The lane log overstates the banner.** `backend-notes.md` §4 says six findings are
  "recorded in the migration banner"; the banner carries F-W3-1 … F-W3-3 only. F-W3-4 (the
  `service_role` grant the sheet's PART 10 contradicts), F-W3-5 (the rename chain) and
  F-W3-6 (the pre-graft refusal order) live only in the log — F-W3-5 is in a body comment,
  F-W3-4 and F-W3-6 nowhere in the SQL.
- **m7 · The new ACL registrations never execute in the gate.**
  `edge_api/platform_acl_compatibility_test.sql` is a documented `KNOWN_FAILURES.md` entry
  that aborts on a database-level PUBLIC-privilege assertion long before line 886, where the
  wave's `$agreement_turnkey_00578$` block sits. It reports EXPECTED-FAIL on both clones, so
  the anon-denial assertions the sheet asked for (SQL-T12) are dead code there. They are
  duplicated in `public_rpc_authorization_contract_test.sql` (which passes) and in
  `design_build_test.sql` T12, so coverage exists — but the integration steward should not
  read that file's green/expected-fail as evidence.
- **m8 · GUC not restored.** `materialize_agreement_template` sets
  `app.commercial_document_id` and then clears it to `''` rather than restoring the prior
  value, unlike every other body in the file.
- **m9 · A grant the guard makes meaningless.** `GRANT ALL ON TABLE
  public.agreement_draw_invoices TO service_role` while `guard_agreement_draw_ledger`
  refuses any INSERT/UPDATE/DELETE unless `current_user = 'postgres'` — service_role can
  never write the table it holds `ALL` on.

## 6 · Nits

- **n1** The `CA` notice row is titled "Notice of Cancellation (California)" while its
  `kind` is `mandated_contents` (§7159 is a mandated-contents statute). Cosmetic; the row is
  dark.
- **n2** `agreement_draw_invoices.label` is authored text (the draw's name) living in a
  machine table outside the fingerprint. It is a copy of hashed content and the guard freezes
  it, so it cannot drift — but RC-8's wording ("any authored content in
  `agreement_draw_invoices` is a finding") deserves the explicit answer.
- **n3** Draw money is `integer` cents throughout (`gross_cents`, `net_cents`,
  `price_cents`), so a contract sum over ~$21.47M overflows. Consistent with the rest of the
  repo; worth knowing for a turnkey class.
- **n4** `guard_agreement_draw_ledger`'s refusal names a function
  (`'a draw is billed through issue_agreement_draw_invoice, never written directly'`). Only
  reachable by a direct table write, so no designer reads it.

## 7 · What I checked and found clean

Vocabulary: I read every `RAISE EXCEPTION` string and every `COMMENT` added by both
migrations. No "clause library", no "contract builder", no "variant", no "AI", no database
column name in a designer-facing sentence, no emoji, no badge/count language. "Template",
"Agreement", "Part" used per R7; the Trade Agreement is never called a "subcontract" in a
message. Homeowner-facing strings from the DB are limited to the consent sentence (composed
correctly, canonical order pricing basis → SOV → draws → retainage → allowances, matching
the sentence published to the client lane byte for byte) and the keepsake HTML (B1/B2).

RLS/ACL: `studio_trade_agreement_tokens` has RLS on with zero policies and no
authenticated grant; the sub holds no role; the three service-only RPCs are denied to
`authenticated` and `agent_writer`; `anon` holds EXECUTE on none of the 24 new functions
and no privilege on any of the seven new tables; `studio_license_attestations` has no
DELETE policy and no DELETE grant; the six notices are invisible to a non-super-admin
(`USING (enabled)`), all `enabled = false`.

Token rail: hash-at-rest only, raw token returned once by a `service_role` RPC,
revoke-then-mint, replay is idempotent and moves nothing, revocation is in the signing
transaction, fingerprint computed inside it over all eight essentials (flow-down key
included though NULL), content freeze after `sent`, signatures append-only at both the
grant and trigger layers, `commercial_document_signatures` untouched.

Commits: nine, each pathspec-scoped, Conventional Commits, no trailers, no `merge(...)`
subject, program docs force-added. Nothing under `.claude/`, `.agents/`, hooks, settings or
any `.env` was touched. The only files outside the lane's declared pathspecs are
`packages/types/src/{agreement,commercial}.ts` (the orchestrated T0 handshake, cherry-picked
to all five lanes and documented in `backend-t0-notes.md`) and the two W1/W2 SQL suites
whose assertions this wave makes false (documented in `backend-notes.md` §5).
