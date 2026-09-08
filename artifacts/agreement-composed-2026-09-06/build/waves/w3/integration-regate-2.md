# Wave 3 re-gate 2 — "The Agreement, Composed" · turnkey

Independent re-gate of the close-out (R40–R47) at
`82f034a5697236f793ac1e130e02b8153a18f8d5`, branch `agreement/w3-integration`,
worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration`
(`git rev-parse --show-toplevel` printed exactly that path). The reviewer did
not write any of this code and re-ran everything from a stack it reset itself.

**Verdict: ok = true.** Every close-out ruling holds against the diff that
claims it. Every probe answered the way the ruling says it must. Every gate is
green, and the only red anywhere is the four e2e failures the brief names as
pre-existing — on a spec file byte-identical to base `main`, with no seed change
anywhere in the wave to have caused them.

---

## 0 · The stack this was judged against

`supabase db reset --workdir …/agent-agr-w3-integration` run twice by this
reviewer: once before the probes, and once at the end to hand the walk a clean
stack (the two client e2e runs leave real fixture rows behind — 4
`studio_trade_agreements` and 2 `design_build` proposals — and a walk should not
meet them). Both resets finished clean; both left the ledger at `00579`.
Recorded in `stack-notice.md`.

```
select version from supabase_migrations.schema_migrations order by version desc limit 3;
 00579
 00578
 00577          (533 rows in the ledger)
```

**Every function body in 00578/00579 matches `pg_proc`, by object probe.** A
parser walked both migrations, took the LAST definition of each
`(name, arity)` — 50 of them — and compared `md5(prosrc)` against the catalog:

```
functions defined in 00578/00579 (last def per name+arity): 50
bodies matching pg_proc exactly:                            50
MISMATCHES:                                                  0

functions (defined in 00578/00579) present in db with NULL proconfig: 0
```

Nothing a later file silently re-headed; nothing left unpinned (that second line
is R45, probed rather than asserted).

### The grants seed replayed in full

`python3 scripts/generate-legacy-grants.py` → "baseline + 2568 replayed
statements"; `git diff --stat supabase/seed/00-legacy-grants.sql` **empty**. So
the committed seed is the one the migrations imply, and it is the seed the reset
replayed as its first `[db.seed]` file.

The hardening contract test ran alone under `psql -v ON_ERROR_STOP=1` and exited
**0** (note: its own header names `./scripts/run-public-acl-psql.sh local`, a
script that does not exist in this repo — pre-existing doc drift, see F5).

Then, independently of that suite, this reviewer rebuilt both manifests
(`_00511_expected_public`, 18 rows; `_00511_expected_dependency`, 9 rows) inside
a rolled-back transaction and compared each signature's real `aclexplode` output
against the pinned `direct_roles`:

```
unresolved signatures: 0
total: 27 | exact_match: 27
```

Every tuple is `<role>:EXECUTE:postgres`, non-grantable, with no non-EXECUTE
privilege and no unexpected grantee — including **both** arities of
`sign_design_services_agreement_with_trusted_ip` (R31's restored four-argument
wrapper carries its own `service_role` grant, which is the thing that would have
gone missing if the seed had not replayed).

---

## 1 · The rulings, each against the diff that claims it

### R40 — one sentence, from what she reads · `a44ed770a` · **HOLDS**

`compose_agreement_consent` now redacts before it says a fragment
(`00578_design_build_kind.sql`, PART 12b):

```sql
    v_disclosure := public._agreement_sub_disclosure(p_proposal_id);
    v_basis := public._agreement_redact_client_payload(
      'schedule', 'pricing_basis', v_basis, v_disclosure);

    v_contract_sum := CASE
      WHEN public._agreement_is_int(v_basis->'contractSumCents')
        THEN (v_basis->>'contractSumCents')::bigint
      ELSE public._agreement_contract_sum_cents(v_basis)
    END;
    …
      IF jsonb_typeof(v_basis->'scheduleOfValues') = 'array'
         AND jsonb_array_length(v_basis->'scheduleOfValues') > 0 THEN
```

and the TS twin reads the same two keys first
(`consent-copy.ts`):

```ts
  const projected = consentInt(payload.contractSumCents);
  if (projected !== null) return projected;
  …
  const projectedLines = Array.isArray(part.payload.scheduleOfValues)
    ? consentRows(part.payload.scheduleOfValues)
    : consentRows(part.payload.costLines);
```

Fidelity: the three parts the sentence reads are already selected
`WHERE ap.client_visible`, and `_agreement_redact_client_payload` is a no-op for
anything but `('schedule','pricing_basis')` (verified in its body), so redacting
only the basis is complete, not partial. The `costLines` fallback in the TS half
fires only when the key is **absent**; a redacted payload always carries
`scheduleOfValues` (possibly `[]`), which is why the two halves cannot part
company on the surface the homeowner reads. Probe P3 confirmed the frozen
sentence equals `compose_agreement_consent`'s own output, and the record page
files that row's sentence (`record/page.tsx:170`,
`consentSentence={signature.consentSentence ?? block.sentence}`).

### R41 — the closed-book door reads the projection · `d5070a98e` · **HOLDS**

```ts
  const projectedSum = payloadCents(payload.contractSumCents);
  const contractSumCents =
    projectedSum !== null && projectedSum > 0 ? projectedSum : …
  const projectedLines = Array.isArray(payload.scheduleOfValues) ? … : null;
…
export function scheduleOfValues(reading: PricingBasisReading): ScheduleOfValuesLine[] {
  if (reading.scheduleOfValues !== null) return reading.scheduleOfValues;
```

`scheduleOfValues` and `contractSumCents` are read off the payload the bundle
actually sends, in both disclosures; `costLines` is never the door's first
source. The jest fixture is now `pricingBasis()` = redacted with
`authoredPricingBasis()` kept only for the derivation tests. See F2 for the
dead-but-surviving pro-rating branch underneath the projection.

### R42 — the lien waiver goes through the door the backend built · `774d7a4d4` · **HOLDS**

```ts
      const { data, error } = await supabase.rpc('record_agreement_draw_lien_waiver', {
        p_draw_id: input.drawId,
        p_waiver_type: input.waiverType,
        p_contact_id: input.contactId,
        p_through_date: input.throughDate,
        p_amount_cents: input.amountCents,
        p_storage_path: input.storagePath,
        p_received_at: input.receivedAt,
      });
```

Exactly the RPC's seven arguments, in the catalog's own order
(`record_agreement_draw_lien_waiver(p_draw_id uuid, p_waiver_type text,
p_contact_id uuid, p_through_date date, p_amount_cents integer,
p_storage_path text, p_received_at timestamptz)`), and
`RecordAgreementDrawLienWaiverResult` is key-for-key the RPC's own
`jsonb_build_object` list (`id, drawId, drawKey, waiverType,
contactDisplayName, throughDate, amountCents, receivedAt`).
`contactDisplayName` and `recordedBy` are gone from the input, as ruled.

The table keeps SELECT only — probed, not assumed:

```
authenticated | SELECT
service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
policies: agreement_draw_lien_waivers_studio_select | SELECT | {authenticated}
```

so the old direct insert would have raised 42501 in production exactly as the
commit says.

### R43 — closed book means studio-authored lines · `b3eda0212` · **HOLDS**

Three doors, all present.

`_agreement_schedule_of_values` no longer touches a cost line under a closed
book:

```sql
  IF p_disclosure IS DISTINCT FROM 'open_book' THEN
    IF jsonb_typeof(p_payload->'scheduleOfValues') <> 'array' THEN
      RETURN '[]'::jsonb;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(… 'cents', (line->>'cents')::bigint) …
```

`_validate_pricing_basis_payload` holds those lines to the sum:

```sql
    IF v_sov <> v_contract THEN
      RETURN 'The schedule of values must come to the contract sum, to the cent.';
    END IF;
```

`send_commercial_document` asks for them at all:

```sql
    IF v_disclosure <> 'open_book'
       AND jsonb_array_length(
             public._agreement_schedule_of_values(
               v_pricing_basis, v_disclosure)) = 0 THEN
      RAISE EXCEPTION 'a closed-book agreement needs a schedule of values written for your client'
```

The designer half matches (`design-build.ts`: `if (mode !== "open_book") return
basis.scheduleOfValues…`, plus `seedScheduleOfValues()` offering the single
`"Construction"` line the ruling names as a complete answer), and the types
declare `DesignBuildScheduleOfValuesLine` once in `agreement.ts` with
`commercial.ts` re-exporting it. Two wording nits at F3.

### R44 — one types file · verification only · **HOLDS, verified mechanically**

`packages/types/src/agreement.ts` is 595 lines on the branch (not the ruling's
545 nor the wave report's 565 — R43 added `DesignBuildScheduleOfValuesLine` and
the `scheduleOfValues` field after the merge, which accounts for the difference).
The substance is what matters, and it was checked by declaration text, not by
line count:

```
integration exports: 66
112e6f838 (base main)  exports= 37  missing=0  byte_differs=0
agreement/w3-backend   exports= 52  missing=0  byte_differs=1  → DesignBuildPricingBasisPayload
agreement/w3-designer  exports= 65  missing=0  byte_differs=1  → DesignBuildPricingBasisPayload
agreement/w3-client    exports= 52  missing=0  byte_differs=1  → DesignBuildPricingBasisPayload
agreement/w3-edge      exports= 52  missing=0  byte_differs=1  → DesignBuildPricingBasisPayload
agreement/w3-sub       exports= 52  missing=0  byte_differs=1  → DesignBuildPricingBasisPayload
```

Every Wave 1–2 export is byte-identical inside it; the one declaration that
differs from every lane is the deliberate widening the ruling names, now also
carrying R43's `scheduleOfValues`. All five lanes' consumers compile against it
(`@patina/types`, `@patina/supabase`, designer, client type-checks all clean;
admin builds).

### R45 — pin the search_path · `504cdf125` · **HOLDS**

`SET search_path = public, pg_temp` added to `_agreement_is_int`,
`_agreement_contract_sum_cents`, `_agreement_draw_rows`,
`_agreement_schedule_of_values`, `_agreement_redact_client_payload` and the four
`_validate_*` payload functions — nine, each with the same one-line reason. The
proof is the catalog probe above: **0 of the 50 functions this wave defines has
a NULL `proconfig`.** (The fix uses `public, pg_temp` rather than the ruling's
`'public'`; that is the file's own convention beside `_agreement_money_to_the_cent`
and it is strictly tighter, so it satisfies the rule.)

### R46 — the sub lane executes · `c07eb728a` + `dc3a36dfb` · **HOLDS, all five clauses**

(a) client type-check clean on the branch, `KIND_LABEL`/`design_build` widening
present in both `commercial-document-shell.tsx:32` and `consent-copy.ts:91`.
(b) the fourth case now mints at `sent` and withdraws out of band; all four run
(see §3). (c) the re-open assertion is pinned to the horn `00579` actually takes —
`resolve_trade_agreement_link` admits `t.status = 'active' OR t.spent_at IS NOT NULL`
and then refuses a spent token whose agreement is not `signed`, so a spent link
reads back the settled receipt and never a second form; probe P6 exercised
exactly that. (d) `/trade` joined the NetworkOnly list:
`/^https?:\/\/[^/]+\/(pay|plans|share|rfq|trade|evidence|field)\//` in
`next.config.js`, with the layout's guest-route comment updated beside it.
(e) `test:coverage` is the named command and the sub lane's own directory clears
the floor comfortably: `src/app/trade/[token]` — **95.33 / 92.92 / 100 / 99.21**.

The 500 that had kept the lane from ever executing is genuinely fixed at the
cause: `MIN_SIGNED_NAME_LENGTH` and `SignTradeAgreementResult` moved out of the
`'use server'` module into `./types`, which is the only shape Next accepts.

### R47 — a question from the origin door files to the agreement's studio · `89e15f067` · **HOLDS**

```tsx
        projectId={paper.houseless ? null : projectId}
        designerId={paper.houseless ? (paper.designerId ?? null) : null}
```

with `designerId: proposal.designer_id ?? null` carried onto the mark and
`DoorProposal.designerId` declared for it. `DoorActs` then routes
`projectId ? startThread(projectId) : startDirectThread(studioProfileId)`, so a
houseless paper can no longer file into whichever house the reader happens to be
standing in — the letterbox door's own behaviour, now shared. A project-bound
door is byte-unchanged. One wording note at F4.

---

## 2 · The probes — every one refused, or answered, as ruled

All eight ran **through the granted role** (`SET LOCAL ROLE authenticated` /
`service_role` / `anon`, never as `postgres`), on the reset stack, in one
transaction rolled back at the end. The Halvorsen figures were retyped from
`source/fixtures.json` into the probe's own table rather than read from the
table the test under review reads.

```
P1 PASS  design-build template: refused with no attestation (23514), refused expired,
         10 parts + kind flip with a live one
P2 PASS  draws: gross 8413400 = GMP; retainage held 378603 per draw; one release of
         378603 at final; nets + release = 8413400
P2(b) PASS  materialized ledger at send: gross 8413400, retainage 378603, release 378603
P3 PASS  which ran: metadata.via='sign_design_services_agreement' on a design_build;
         consent sentence frozen = compose_agreement_consent
P3      sentence: I agree to these design-build terms, the cost-plus pricing basis and
         its guaranteed maximum price, the schedule of values, the draw schedule, the
         retainage withheld from each draw, and the allowances and what happens if they
         run over, and understand my signature alone does not authorize work until the
         studio countersigns.
P4 PASS  offer is a second call after the signature row exists; its failure left
         signature+state+invoice count unchanged; only the deposit issues before executed
P5 PASS  executed authority …: billing_cadence='per_draw', status='active', project=…
P6 PASS  sub token: signed once (outcome=saved, token spent), refused twice
         (already_signed, one row, first name kept), re-resolve is a receipt not a form
P7 PASS  sub DTO: 13 frozen keys, own agreement only, no bid-ledger/client/prime key at
         any depth; the guest read and write paths never name trade_scope_bids /
         trade_rfq_requests / trade_rfq_tokens
P7b     anon studio_trade_agreements → denied · outsider → 0
        anon studio_trade_agreement_signatures → denied · outsider → 0
        anon studio_trade_agreement_tokens → denied · outsider → denied
P7b PASS
P8 PASS  six notices seeded WI/MN/IL/CA/NY/MA, all enabled=false, invisible to owner and
         homeowner under RLS, absent from the client bundle and the keepsake
```

Notes on what each of those actually asserted, where the wording hides work:

- **P1** takes all three states in order and reads the kind and the part count
  back by `SELECT` after each: with no attestation the RPC refuses with SQLSTATE
  `23514` and the sentence *"the design-build template needs a current licensing
  attestation on file"*, the kind does **not** flip and **zero** parts are laid
  out; an attestation that expired yesterday refuses identically; only with
  `expires_on` in the future does it lay out ten parts and flip
  `document_kind` to `design_build`.
- **P2** compares every draw row — gross, retainage held, net — against the
  fixture line by line (`deposit 841340/0/841340`, `rough_in
  2524020/126201/2397819`, `cabinets_set 3365360/168268/3197092`, `substantial
  1682680/84134/1598546`), then the columns, then the single release row, then
  the closing identity `nets + release = totalPaid`. The deposit holds no
  retainage because `retainageApplies` is false on it. P2(b) repeats the three
  totals against the ledger `send_commercial_document` materializes, so the
  projection and the stored rows are the same arithmetic.
- **P3** asserts *which function ran*, not that a call returned:
  `commercial_document_signatures.metadata->>'via'` is
  `'sign_design_services_agreement'`, and `guard_commercial_signature_insert`
  admits an INSERT on that table only from the capability-stamping impl inside
  the same `txid_current()`, so the marker cannot be forged from any other path.
  The document it signed is a `design_build`, the state reaches `client_signed`,
  the frozen sentence is `compose_agreement_consent`'s (never the generic
  fallback), and no `trade_scope_terms` row exists — i.e. the turnkey signature
  did not borrow another kind's transaction, which is the exact defect the
  route's `SERVICES_SIGNING_KINDS` allowlist was written to prevent.
- **P4** runs the **failing** second call first, deliberately: with the
  signature row already on the table, `issue_agreement_draw_invoice(…,
  'no_such_draw')` raises, and the signature id, the `commercial_state` and the
  count of draw rows carrying an invoice are all unchanged afterwards. Then the
  succeeding call mints the deposit at the **net** (841340, retainage withheld
  rather than billed) with a 64-hex payer token, and *still* leaves the
  signature id and the state alone. `rough_in` before countersignature refuses
  with *"a draw is billable once the agreement is executed"*.
- **P8** is the DB half of "render nowhere": six rows, none enabled, and the
  studio owner and the homeowner each read **zero** of them through their own
  granted role, with neither the client bundle nor
  `_render_agreement_snapshot_html` carrying the string `jurisdiction` or
  `Notice of Cancellation`. The UI half is F1.

### No pre-existing `_shared` file changed

```
git diff --stat 112e6f838 HEAD -- supabase/functions/_shared/
 supabase/functions/_shared/trade-agreement-emails.test.ts | 258 +++++
 supabase/functions/_shared/trade-agreement-emails.ts      | 247 +++++
```

Two **new** files, zero deletions, no existing `_shared` module touched — so no
importer outside `trade-agreement-send` needs redeploying for this wave.

---

## 3 · The gates

| # | Gate | Result |
|---|---|---|
| 1 | `supabase db reset --workdir …/agent-agr-w3-integration` (this reviewer, twice) | clean both times · ledger `00579, 00578, 00577` |
| 2 | function-body object probe (00578/00579 vs `pg_proc`) | 50/50 exact · 0 NULL `proconfig` |
| 3 | `python3 scripts/generate-legacy-grants.py` + `git diff` | "baseline + 2568 replayed statements" · diff empty |
| 4 | `public_sd_hardening_contract_test.sql` under `psql -v ON_ERROR_STOP=1` | exit **0** |
| 5 | independent 00511 manifest ACL probe | 27 signatures, 27 exact matches, 0 unresolved |
| 6 | `./scripts/run-sql-tests.sh` | total **166** · green **145** · expected-fail **21** · **unexpected-fail 0** · effective 166/166 |
| 7 | `SUPABASE_DB_URL=… pnpm db:generate` + `git diff --exit-code packages/supabase/src/database.types.ts` | file 1.2 MB (not truncated) · **diff exit 0** |
| 8 | `pnpm exec turbo build --filter=@patina/types --force` | 1 successful, 1 total |
| 9 | `pnpm --filter @patina/types type-check` | clean |
| 10 | `pnpm --filter @patina/supabase type-check` · `test` | clean · **93 files, 1145 passed, 12 skipped** |
| 11 | `pnpm --filter @patina/designer-portal type-check` · FULL `test` | clean · **544 suites, 6662 tests, 12 snapshots — all passed** |
| 12 | `pnpm --filter @patina/client-portal type-check` · `test:coverage` | clean · **134 suites, 2233 passed** · coverage **75.17 / 70.70 / 75.23 / 77.51** against the 70/60/70/70 floor · exit 0 |
| 13 | `rm -rf apps/admin-portal/.next/types && pnpm --filter @patina/admin-portal build` (unsandboxed) | exit **0** |
| 14 | `deno test --allow-all --config supabase/functions/deno.json` on `_shared`, `proposal-send`, `commercial-document-notify`, `trade-agreement-send` | **465 passed, 0 failed** |
| 15 | `deno check --config supabase/functions/deno.json` on the three `index.ts` | exit 0 each · **no `deno.lock` at the repo root** |

### The client e2e

Run against **a server this reviewer started**, not a reused one — the recorded
hazard is that `playwright.config.ts` pins no flag override in `webServer.env`
and reuses whatever is on :3002. Nothing was listening on :3002 beforehand; the
server was started with `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
read from `supabase status -o env`, `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
and env.md's three-flag override
`NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true,agreement-library:true,design-build:true`;
`npx playwright test … --workers=1` was run from `apps/client-portal` (never
`pnpm … test:e2e --`, which does not pass the flag through), and the server was
stopped afterwards.

**Whole suite, `--workers=1`, `PATINA_W3_TURNKEY_GATE=1`: 44 passed, 4 failed (4.8m).**
The four are exactly the four the brief excludes:

```
[chromium] › tests/plans-link.spec.ts:190:7  › renders the set for the holder, signs prints, and dies on revoke
[chromium] › tests/share-link.spec.ts:114:7  › a share with a board renders it view-only for a guest (B3)
[chromium] › tests/threshold.spec.ts:277:7   › prints the five facts the seed put in the house
[chromium] › tests/threshold.spec.ts:340:7   › names the other houses on the mat for a client who keeps several
```

The brief names the last two as `threshold:158` and `threshold:221`; the line
numbers do not match, and that is worth saying plainly rather than waving
through (F6). They are nonetheless the same two reds: `threshold.spec.ts` is
**byte-identical to base `main`** (`git diff 112e6f838 HEAD --
apps/client-portal/tests/threshold.spec.ts` is empty), the wave changes **no
seed data at all** (the only diff under `supabase/seed/` is the generated
grants file), and the two failure signatures are the two the rulings record
verbatim — `:277` fails on the due day (`"September 14"` expected, page says
`"September 15"`, the timezone fragility) and `:340` fails on the other-houses
count (`2` expected, `7` present, the seed-accumulation drift). Nothing else was
red.

### The two runs the rulings name, re-run on their own

```
✓ design-build-door.spec.ts:368  signs through the turnkey arm, then offers the deposit
✓ design-build-door.spec.ts:490  the offer is an offer: ignore it and the signature still stands
✓ origin-door.spec.ts:298        stands the origin agreement at #door, not "no active projects yet"
✓ origin-door.spec.ts:319        lands on that door from the retired /proposals/<id> address
✓ origin-door.spec.ts:335        keeps the signed agreement on the next visit, before the countersignature
✓ trade-agreement-link.spec.ts:175  the sub signs with no session, sees only their own terms, and the link is spent
✓ trade-agreement-link.spec.ts:272  a well-formed token with no matching agreement is a calm dead link
✓ trade-agreement-link.spec.ts:283  a malformed token never reaches the DB and is also a dead link
✓ trade-agreement-link.spec.ts:294  a withdrawn agreement resolves to nothing, not to a form
9 passed (50.6s)
```

`PATINA_W3_TURNKEY_GATE=1` was set for every run, so a silent skip of E2E-2
would have thrown rather than passed. R46's E2E-3 and R47's E2E-2 both executed.

---

## 4 · Findings

None blocks. All four substantive ones are recorded so the next reader does not
have to rediscover them; two are documentation-only.

**F1 · minor · confidence 0.95 — "render nowhere" is true of the rows, not of
the room.** `apps/designer-portal/src/components/document/rooms/drafting/agreement/turnkey/jurisdiction-attachments.tsx`
draws all six seeded jurisdictions as greyed lines reading
`DESIGN_BUILD_COPY.noticeHeldForCounsel`, from a **code-resident**
`SEEDED_JURISDICTIONS` list — deliberately, "so a studio in Wisconsin can see
that the notice exists and that Patina is not pretending otherwise". No row
content crosses (P8: owner and homeowner both read zero rows; neither the bundle
nor the keepsake carries a notice), there is no enable control anywhere, and
`onAttach` is unreachable while every row is disabled. R11 as ruled — "seeded
with `enabled = false`; no UI to enable until counsel reviews" — is satisfied
exactly. The re-gate brief's stricter phrasing is not, and if the intent was
that a studio should see nothing at all, that is a copy decision for Kody, not a
defect to fix here.

**F2 · nit · confidence 0.9 — the pro-rating branch R43 deleted everywhere else
survives in the client body, contradicting its own docstring.**
`apps/client-portal/src/components/commercial/design-build-body.tsx`
`scheduleOfValues()` says the surviving derivation "is the open-book arithmetic,
integer throughout" — but the code below the open-book branch still divides
`line.basisCents * contractSumCents / costBasisCents` and gives the last line the
remainder, i.e. the exact closed-book pro-rating R43 forbids. It is unreachable
in production: the bundle always projects `scheduleOfValues`, so
`reading.scheduleOfValues !== null` returns first. The designer's own
`design-build.ts` deleted its copy of that branch outright. Deleting this one
(returning `[]` for a projection-less closed book, as the SQL does) would make
the file say what it does.

**F3 · nit · confidence 0.95 — one of the three schedule-of-values refusals
differs between the two doors.** SQL: *"Every schedule-of-values line needs an
amount above zero."* (`00578`, `_validate_pricing_basis_payload`). Designer:
*"Every schedule-of-values line needs an amount."* (`design-build.ts`,
`validatePricingBasis`). The other two — "…needs a name." and "The schedule of
values must come to the contract sum, to the cent." — match byte for byte, which
is the standard this wave sets for itself everywhere else.

**F4 · minor · confidence 0.3 that this is a defect — R47's parenthetical says
"keyed by proposal"; the code keys by studio.** `DoorActs` calls
`startDirectThread.mutateAsync(studioProfileId)` → `rpc_start_direct_thread`, so
two origin agreements from one studio to one household would share a single
thread. I read this as satisfying R47 rather than missing it: the ruling's own
title says "files to the agreement's **studio** thread", the designer id is
taken from the paper's own row (`proposal.designer_id`) rather than from the
house being read — which is the substance of "keyed by proposal" — and
`letterbox-door.tsx` already keys the identical act this way, which is the
precedent the ruling cites. Flagged for a one-word ruling confirmation, not a
change.

**F5 · advisory · confidence 1.0 — a test file names a script that does not
exist.** `supabase/tests/edge_api/public_sd_hardening_contract_test.sql:2-3`
instructs the reader to run it via `./scripts/run-public-acl-psql.sh local`;
there is no such file in `scripts/` (checked). Pre-existing, not this wave's —
recorded because a reader following the header would conclude the suite cannot
be run. It runs clean under plain `psql -v ON_ERROR_STOP=1` (exit 0) and under
`run-sql-tests.sh`.

**F6 · advisory · confidence 1.0 — the excluded e2e reds are at `:277` and
`:340`, not `:158` and `:221`.** Evidence that they are nonetheless the same two
tests is in §3 (spec byte-identical to base main, no seed change in the wave,
failure signatures matching the recorded TZ and seed-accumulation reds). Worth
correcting in the next brief so a future re-gate does not read the mismatch as a
new failure.

**F7 · advisory · confidence 0.6 — the R43 send guard does not reach an open
book.** `send_commercial_document` requires a non-empty schedule of values only
`WHEN v_disclosure <> 'open_book'`; an open-book turnkey derives its table from
the cost lines instead, so one carrying no cost lines would send with an empty
schedule. Constructing one takes a priced basis with no lines beneath it, which
`_validate_pricing_basis_payload`'s cost-basis identity and R22's fee floor make
awkward — hence advisory rather than a finding. Named only because the closed
book now has a door and the open book still does not.

---

## 5 · What this re-gate did not do

- No production mutation of any kind, no `db push`, no `functions deploy`, no
  portal deploy, no push. Nothing was run against Strata.
- No product code was changed. The only writes were this file, `stack-notice.md`,
  and the two `supabase db reset` runs.
- `apps/designer-portal/playwright.design-build.config.ts` (designer E2E-1) was
  not run — no close-out ruling names it, and the wave report already records it
  as unrun.
- The six commercial suites in `KNOWN_FAILURES.md`, `direct_order_attribution_test.sql`,
  designer-portal lint, and the carried lane minors listed in the wave report's
  "Carried, not fixed" section were not re-litigated; none is a close-out ruling.
- The two threshold e2e reds were reasoned to be pre-existing from the diff and
  the seed rather than reproduced on a `main` checkout — that would have meant a
  second full reset against a different tree, and the evidence in §3 is direct.
