# Wave 3 · client lane — notes

Branch `agreement/w3-client`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-client`,
base `112e6f838` + the T0 types commit `f25fa65be` (cherry-picked before the
lane forked, so `COMMERCIAL_DOCUMENT_KINDS` already carries `design_build`).

Nothing was deployed. No production mutation of any kind was run. The shared
local Supabase stack was neither reset nor written to.

---

## 1 · The forcing function fired, which is how I know I-1 landed

The build sheet predicted `commercial-document-shell.tsx`'s compiler-total
`KIND_LABEL` map would stop type-checking the moment `design_build` reached
`@patina/types`, and that if it did **not**, the dist was stale. On a fresh
`pnpm turbo build --filter=@patina/types` in this worktree:

```
src/components/commercial-document-shell.tsx(26,7): error TS2741:
  Property 'design_build' is missing in type '{ design_services … }'
src/components/threshold/door-gate.tsx(266,7): error TS2322:
  Type '"design_build"' is not assignable to type 'MakingGateKind'.
```

Two forcing functions, not one — `MakingGateKind` in `lib/analytics/events.ts`
is compiler-total the same way. Both are fixed in this lane.

## 2 · The fail-open misroute (§3.3's one site that actively does the wrong thing)

`app/api/proposals/[id]/sign/route.ts` derived its allowlist from
`COMMERCIAL_DOCUMENT_KINDS` (`:6`) and then routed
`furnishings → trade_scope → else`. So the T0 types commit **auto-admitted**
`design_build` into an `else` branch that would have signed a turnkey prime as
a plain design-services agreement — no deposit, no design-build validation, and
an HTTP 200 byte-identical to the correct one.

Fixed by retiring the fall-through. `SERVICES_SIGNING_KINDS` is now a positive
set (`design_services`, `service_addendum`, `design_build`); a kind that is in
the allowlist but in no routing branch now answers `409 not_signable` instead of
borrowing another kind's transaction. The double-negative
`isClientSignedServicesRetry` (`:102-105`) now reads off the same set — the
admission it always made for `design_build` was correct and is now made on
purpose.

**Which RPC ran is asserted, not the status code**, in three places:
- `sign/route.ts.__tests__` — the service client's RPC call ORDER
  (`['sign_design_services_agreement_with_trusted_ip', 'issue_agreement_draw_invoice']`),
  and that neither `execute_furnishings_authorization_with_trusted_ip` nor
  `execute_trade_scope_with_trusted_ip` was called;
- `consent-copy.test.ts`'s drift guard — reads the route off disk and pins that
  `design_build` is inside a signing-kinds set and that the old double negative
  is gone;
- `tests/design-build-door.spec.ts` — from the database:
  `commercial_document_signatures.metadata->>'via' = 'sign_design_services_agreement'`
  plus a `agreement_draw_invoices` deposit row, which only the turnkey arm mints.

## 3 · P13 · The deposit is offered, never asked for first (R15, D-W3-2)

Structural rather than careful, in three layers:

1. `offerDepositDraw()` in the sign route is a **separate call made after** the
   signature RPC returned. Its every failure shape — RPC refused, RPC threw,
   `payToken` null, amount ≤ 0 — returns `null`, and the route still answers
   `ok: true` with the signature intact. Four jest cases, one per shape.
2. `door-gate.tsx` stores the offer only after `setSignedAt`, `setReceiptInked`
   and `onSigned?.()` have run, and renders it only under `signedAt`.
3. `deposit-offer.tsx` renders **nothing** for a null — asserted as
   `toBeEmptyDOMElement()`, and separately that no `alert`, no "unavailable",
   no "try again" reaches the page.

Nothing about the offer touches `ready` (`door-gate.tsx:247`), the act's
`disabled`, or any preflight — pinned by a jest case that arms and disarms the
act with an offer pending.

**Zero Stripe code.** The offer is `href="/pay/<payToken>"`, a plain link to the
already-shipped payer surface. The drift guard greps the route's source for
`create-checkout-session` and `stripe` and fails on either.

`p_draw_key: 'deposit'` is called through the **service** client, per PART 10
step 2's exception: the client's own signature is the authority for her own
deposit. Asserted (the user-session client is never asked for that RPC).

## 4 · The turnkey body

`components/commercial/design-build-body.tsx` is its own body, not
`AgreementPartsBody` with extra sections — that renderer closes with "This
agreement authorizes design services only", which is false of a paper that
prices the trades, and it has nowhere to hang a draw ledger. Asserted both
ways: the services sentence is absent, and the turnkey boundary sentence is
present.

Parts render in the **designer's order**, with two derived sections hung off the
parts they belong to: the schedule of values under the pricing basis it is
derived from, and the trades under the sub-disclosure clause that decides how
much of them is shown. A part set with no sub-disclosure clause still shows the
trades, after everything the agreement says.

**RC-12 · no floats.** Every figure is an integer number of cents until the
moment it is formatted, and `moneyToTheCent()` formats from the integer
(dollars through `Intl`, the two cent digits appended as digits) rather than
from `cents / 100`. The Halvorsen table is asserted cent-for-cent against
`source/fixtures.json`:

| | |
|---|---|
| cost basis | `7130000` |
| fee 18% | `1283400` |
| GMP | `8413400` |
| SOV (closed book) | `4484000 · 1121000 · 849600 · 743400 · 472000 · 413000 · 330400` → `8413400` |
| draws, net | `841340 · 2397819 · 3197092` … rendered from the ledger, never recomputed |

The schedule of values is the ONE derivation this lane performs (it is derived
from the pricing basis' cost lines, never separately authored). Closed book
pro-rates as one integer expression `cost × sum / basis` and **the last row
takes the remainder**, so the column sums to the contract price exactly — pinned
by an uneven-division case as well as the Halvorsen one. Open book shows the
trades at cost with the fee as its own line; the two still sum to the price.

**Draws are read, never recomputed.** Gross / retainage / net come off the
ledger the send transaction wrote. Where no ledger exists the authored draws
show label and share only — no figure is invented for them.

**R13.** `subs` carries identities always; `awardedPriceCents` renders only under
`open_book`, and the body withholds a price a `closed_book` DTO carried anyway
(defence in depth over the RPC's own rule). The adapter maps the shape it knows
and discards the rest — a `subs` row padded with `bids`, `losingBidCents` and
`bidCount` loses all three at the edge, asserted by key set and by absence in
the DOM, in both disclosure modes. An `attestation` part is never drawn.

## 5 · Consent

`consentLineFor('design_build')` is its own sentence — not the design-services
one (which would say "design-services terms" over a paper that carries none) and
not the generic fallback, which is exactly what a missed branch looks like on
the signing surface. A new test iterates `COMMERCIAL_DOCUMENT_KINDS` and fails
if any live kind lands on the fallback.

`composeConsentLine` / `composeSummaryLine` gained a turnkey arm with its own
canonical variant order (`pricing_basis → draws → allowances → retainer →
ceiling`). Two parts each say two things, so the turnkey fragments return a
list: the pricing basis names both the price it sets and the schedule of values
built from its cost lines; the draws name both the schedule and the retainage.
On the Halvorsen fixture:

> I agree to these design-build terms, the guaranteed maximum price, the
> schedule of values, the draw schedule, the retainage withheld from each draw,
> and the allowances, and understand my signature alone does not authorize work
> until the studio countersigns.

`signLabelFor('design_build')` is `Sign and accept` (a turnkey prime is
countersigned), pinned rather than left to the fallthrough.

> ⚠ **Cross-lane, for integration.** These sentences are the client half of a
> pair. `public.compose_agreement_consent(uuid)` is the SQL half, and the sign
> route sends the DATABASE's sentence to the RPC while the door renders this
> one. If the backend lane's composer does not learn `design_build`, a
> homeowner reads one sentence and files another. Named here rather than
> assumed. Also flagged: `BillingCadence` in `packages/types/src/commercial.ts`
> does not carry `'per_draw'`, so the client bundle adapter coerces it to
> `'monthly'` — inert today (no turnkey surface reads `serviceTerms
> .billingCadence`) but it is a real narrowing, and that file is the designer
> lane's.

## 6 · Carried from R30 (hotfix review round 4, N1 and N2)

**N1 · the origin door can ask its studio a question.** `DoorActs` withheld
"Ask a question" on `!projectId`, and an origin agreement is bound to no
project until countersignature — so a household's very first paper was the one
door in the house offering three acts where every other door offers four. The
house rule ("an act that cannot complete is not offered") stands; its scope was
wrong. The question now routes to the studio ON THE AGREEMENT via
`rpc_start_direct_thread`, which the `designer_clients` roster row (or the live
lead) behind every sent agreement already authorizes. `DoorGate` gained
`designerId`; `LetterboxDoor` already resolved it per paper for the receipt and
now hands it down. With neither a project nor a designer the act is still
withheld.

**N2 · a failed papers read is not an empty house.** `useClientSafeProposals`
sets no `retry`, so it inherits the app's `retry: 2`; after the third failure
the query settles with no data, `origins` and `kept` are empty, and the
household met `ProjectsEmptyState` — "no active projects yet" over the very
agreement R30 exists to reach. The door now renders `PapersUnread` ("Your papers
could not be drawn just now. Nothing on them has changed.") with a **Try again**
that calls `refetch`, and it suppresses "Nothing is waiting for you." — a page
that could not read the papers does not know that. Beside a standing letter the
letter still draws and the notice sits with it, so the money surface is never
held back.

Four jest cases for N2 (the notice, the retry, beside a letter, and the genuine
empty state still reaching `ProjectsEmptyState`); five for N1 (offered with a
studio, withheld with neither, the direct thread called with the designer id and
the project thread NOT, the project rail kept where a project exists, and the
refusal spoken in the house's own words). `threshold.test.tsx`'s `DoorActs` stub
became a witness so the wiring itself is asserted.

## 7 · Read and decided, not edited (RC-13)

| Site | Decision |
|---|---|
| `commercial-document-shell.tsx:683` — `kind !== 'furnishings_authorization' && kind !== 'trade_scope'` gating "Awaiting countersignature" | **Correct as-is.** Those two are the one-act executions with no countersignature; a turnkey prime is countersigned and belongs on the other side. Commented and pinned by a test. |
| `sign/route.ts` `isClientSignedServicesRetry` | Rewritten to read the positive set. Same behaviour for all three services kinds; the fail-open shape is gone. |
| `wall-gate.tsx:250` `KIND_LABEL.trade_scope` | **No peer.** The wall is the act of accepting FINISHED TRADE WORK, which exists only where the client holds the trade scope. On a turnkey prime the studio holds each Trade Agreement and the client's money moves on the draw schedule; there is no acceptance for her to give. Commented. |
| `lib/threshold/derive.ts:63` `kind: 'proposal' \| 'trade_scope' \| 'invoice'` | **No edit.** Threshold vocabulary, not `document_kind`; a turnkey prime is a `'proposal'` here. Commented. |
| `threshold.tsx:822` `enclosure.kind === "trade_scope"` | **No edit**, same vocabulary. Not in this lane's pathspecs and left untouched. |
| `decline/route.ts` | Reads the shared set — free via I-1, verified, unedited. |

Lane sweep run (`grep -rn "trade_scope" <lane pathspecs> | grep -v "trade_scope_\|.test."`): every remaining hit is one of the rows above or the single-kind `api/trade-scopes/[id]/accept/route.ts`, which is not this lane's and is correctly closed.

## 8 · Gates run

```
pnpm --filter @patina/client-portal type-check      → clean (tsc --noEmit, no output)
pnpm --filter @patina/client-portal test            → 131 suites / 2156 tests passed
pnpm --filter @patina/client-portal test:coverage   → same, floors met
    All files 74.78 / 70.25 / 74.95 / 77.11   (floor 70 / 60 / 70 / 70)
    design-build-body.tsx   90.00 / 76.15 / 88.23 / 94.33
    deposit-offer.tsx      100.00 /100.00 /100.00 /100.00
    consent-copy.ts         97.69 / 88.88 /100.00 / 99.06
    door-acts.tsx           92.30 / 91.30 / 85.71 / 94.89
    door-gate.tsx           95.48 / 88.96 / 88.00 / 98.33
    letterbox-door.tsx      96.96 / 86.72 / 90.90 / 97.80
    commercial-documents.ts 88.20 / 86.01 / 95.65 / 92.04
npx playwright test --list tests/design-build-door.spec.ts → 2 tests collected
```

Baseline before this lane: the same suite at 129/2012 (R30's round-4 figures).

## 9 · What was NOT verified

- **`tests/design-build-door.spec.ts` has not been executed.** It cannot pass
  until the backend lane's migration is on a stack: it mints a real
  `document_kind = 'design_build'` proposal, seeds a
  `studio_license_attestations` row, sends through
  `send_commercial_document`'s turnkey arm, and reads `agreement_draw_invoices`.
  The spec **skips loudly and by name** when
  `select … from agreement_draw_invoices` errors ("the Wave 3 turnkey migration
  is not applied to this local stack … run pnpm supabase:reset first"), so it
  becomes a real gate the moment the migration lands and never reports a silent
  green. Collected by Playwright (2 tests) but not run.
- The shared local stack was deliberately not reset or written to, per the lane
  brief, so nothing in this lane was driven against live data.
- The `design-build` flag itself has no client-side gate: a homeowner has no
  flag to read, and the kind cannot exist with the flag off (a design-build
  proposal is only creatable through the designer's flag-gated template
  picker). Flag-off byte identity on this surface therefore rests on "no
  document of this kind exists", which the designer lane's gate owns.
- Prettier reports formatting drift on every file this lane touched. The repo
  has no root Prettier config and the hook says the check is advisory; the
  files were left in the repo's existing style rather than reflowed, which
  would have buried the diff.
- Not run here (other lanes' gates): designer-portal jest, admin-portal build,
  Deno, SQL suites, `pnpm db:generate`.

## 10 · Commits

```
07690c52d feat(client): the sign route routes design-build explicitly, and offers the deposit after the signature
789389d6b feat(client): the consent she ticks learns the design-build class
cbd9a80e5 feat(client): the homeowner reads a design-build agreement
746a3c52a feat(client): the door offers the deposit after the signature, and never gates on it
29da43c7e fix(client): the origin door asks its studio, and says when the papers could not be drawn
23256de9b test(client): drive the turnkey door end to end, asserting which RPC ran
```

Every commit stages explicit pathspecs and touches only
`apps/client-portal/**` (plus this file, force-added under the gitignored
`build/` tree). No `.claude/`, `.agents/`, hooks, settings or `.env` file was
touched. No worktree was created or removed. Nothing was pushed.
