# L2 — Money in place (client-page-2/l2)

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l2` · branch `client-page-2/l2`
from `origin/main` (`26b15145e`).

Absorbs `/invoices`, `/invoices/[invoiceId]`, `/orders` into the Threshold: the balance is settled in the
letterbox, every earlier invoice is kept behind the one letter, and pieces bought direct stand on the road
with the act that pays for them.

## What was built

### (a) Settling in place — the letterbox
- **`apps/client-portal/src/components/threshold/settlement.tsx`** (new) — the pay ceremony. Owns
  `useInvoicePaymentOptions`, `useStartCheckout`, `useNotifyCheckIntent`; renders `SpineToll` with the
  chooser laid in and the act wired to a Checkout claim. Behaviour copied from
  `src/app/invoices/[invoiceId]/page.tsx`: ACH default, `card_surcharge_bps` null-while-loading (never
  quote the 3% default at a studio configured lower), `DEFAULT_CARD_SURCHARGE_BPS` on a resolved failure,
  one session per press (busy gate + check-method no-op), `payment_reconciliation_required` copy
  byte-copied, `clientEvents.paymentStarted/paymentMethodSelected/checkIntentSubmitted` fired at the same
  moments. Quotes the charge total when a fee applies.
- **`apps/client-portal/src/components/threshold/payment-method-chooser.tsx`** (new) — the old
  `app/invoices/[invoiceId]/payment-method-chooser.tsx`, logic and words unchanged (option labels,
  "Preferred · lowest fee", fee arithmetic incl. the ACH cap, `CHECK_REMIT_FALLBACK`, memo-line copy,
  "Let <designer> know a check is coming" with its one-notification guard). Chrome moved to the house's
  idiom (hairlines, `ScoredAction` for the notify act) — no plates, no rounded borders, no colour.
- **`apps/client-portal/src/components/making/spine-toll.tsx`** (edited — the plan's one sanctioned
  `making/` edit) — added an optional `settle` prop and `children`. With `settle`, `spine-toll.tsx:112`'s
  outbound `href={/invoices/${invoiceId}}` becomes an in-place button; without it (The Making) the link is
  unchanged. The Making's tests are green.
- **`apps/client-portal/src/lib/threshold/checkout-return.ts`** (new) — the return reader.
  `readCheckoutReturn(search)` (`success` → settled; `cancel`/`cancelled` → unchanged),
  `cleanedCheckoutUrl(href, hash)`, `consumeCheckoutReturn()` (module-scope: read ONCE per page load,
  clean the address, serve the same answer to both readers — the letterbox and the road would otherwise
  race each other's cleanup), and the `useCheckoutReturn()` hook.
- **`letterbox.tsx`** (edited) — reads the return on mount and states it: `Paid <date>. Receipt in your
  email.` / `Nothing changed.`, then the params are struck out and the address left at `#letterbox`. Fires
  `paymentCompleted`/`paymentCancelled` once with the returned invoice id. An order's return is left to
  the road. New props: `invoices` (the raw project invoices — currency + designer + what is kept behind
  the letter) and `designerName`.

### (b) Earlier invoices
- **`apps/client-portal/src/components/threshold/earlier-invoices.tsx`** (new) — a fold in the letterbox,
  every non-draft non-void invoice as a dated one-line receipt (`visibleInvoices` from
  `@/app/budget/rollup`, so the house and /budget cannot disagree), newest first, each with **Print** →
  `/invoices/<id>/print` in a new tab. It renders even when the slot is empty, so a fully-paid project
  keeps its record; the letter currently in the letterbox is not duplicated behind it.

### (c) Direct orders on the road
- **`apps/client-portal/src/lib/threshold/road-orders.ts`** (new) — `toRoadOrders(orders, projectId)`:
  keeps `pending_payment`/`paid` orders belonging to this project (or to no project — they have no other
  house to stand in); stop from what the order knows (unpaid → Agreed, paid → Released to maker, paid with
  a `shipping.tracking_number` → In transit); `payable` copies `/orders`' rule (pending, no PaymentIntent).
- **`apps/client-portal/src/components/threshold/road-orders.tsx`** (new) — one line per piece with its
  stop and price, **Pay for this piece** → `useStartDirectOrderCheckout`, inline failure, and the same
  return reader (an order return states its receipt here, not in the letterbox).
- **`the-road.tsx`** (edited) — optional `orders`/`today`; orders count toward "pieces in motion";
  "Nothing on the road." only when neither kind of piece is moving.
- **`threshold.tsx`** (edited, 5 minimal changes) — `useDirectOrders` import + call, `ordersQuery.isPending`
  added to the settle gate, the Letterbox mount gains `invoices`/`designerName`, and the road renders when
  either pieces or orders exist.

### The return URL (edge function)
`useStartCheckout`/`useStartDirectOrderCheckout` take no return path — `create-checkout-session` builds it.
Repointed **server-side, derived from the payable's own project** (no client-supplied path, so no
open-redirect surface):

- invoice: `${CLIENT_PORTAL_URL}/projects/${invoice.project_id}?invoice=${invoice.id}&checkout=success|cancelled`
  (+ `session_id`, and the attempt params `invoice-checkout-core.ts` appends). **No `#letterbox` fragment
  in the edge function** — the attempt-param appender concatenates after this string and a fragment would
  swallow them; the letterbox sets the anchor itself when it cleans the address, so the client still lands
  at `/projects/<id>#letterbox`.
- direct order: `/projects/${order.project_id}?order=…&checkout=…` when the order has a project, else the
  existing `/orders?order=…` (an order raised without a project has no house to return to).

⚠ **Deploy ordering** — this edge-function change must not ship ahead of the portal. Until L8 lands and
the new portal is what everyone gets, a repointed return would drop the payer on a project page that does
not read `?checkout=`. Deploy the client portal first (or together), then
`supabase functions deploy create-checkout-session`.

### Package change
`packages/supabase/src/hooks/use-direct-orders.ts` — `DirectOrder` gains `project_id?: string | null`.
The column is already in `DIRECT_ORDER_COLUMNS`; only the interface under-declared it. Optional, so
`useCreateDirectOrder`'s RPC row is not made to promise a field it may not carry.

## Files

New:
- `apps/client-portal/src/lib/threshold/checkout-return.ts`
- `apps/client-portal/src/lib/threshold/road-orders.ts`
- `apps/client-portal/src/components/threshold/settlement.tsx`
- `apps/client-portal/src/components/threshold/payment-method-chooser.tsx`
- `apps/client-portal/src/components/threshold/earlier-invoices.tsx`
- `apps/client-portal/src/components/threshold/road-orders.tsx`
- `apps/client-portal/src/lib/threshold/__tests__/checkout-return.test.ts`
- `apps/client-portal/src/lib/threshold/__tests__/road-orders.test.ts`
- `apps/client-portal/src/components/threshold/__tests__/settlement.test.tsx`
- `apps/client-portal/src/components/threshold/__tests__/payment-method-chooser.test.tsx`
- `apps/client-portal/src/components/threshold/__tests__/earlier-invoices.test.tsx`
- `apps/client-portal/src/components/threshold/__tests__/road-orders.test.tsx`

Edited:
- `apps/client-portal/src/components/threshold/letterbox.tsx`
- `apps/client-portal/src/components/threshold/the-road.tsx`
- `apps/client-portal/src/components/threshold/threshold.tsx` (minimal: 1 import line, 1 hook call, 1 gate
  term, the Letterbox mount, the road mount)
- `apps/client-portal/src/components/making/spine-toll.tsx`
- `apps/client-portal/src/components/threshold/__tests__/letterbox.test.tsx`
- `apps/client-portal/src/components/threshold/__tests__/the-road.test.tsx`
- `apps/client-portal/src/components/threshold/__tests__/threshold.test.tsx` (added the `useDirectOrders`
  mock — the surface now reads it)
- `packages/supabase/src/hooks/use-direct-orders.ts`
- `supabase/functions/create-checkout-session/index.ts`

## Hooks used (all existing — no new hook added)
`useStartCheckout`, `useInvoicePaymentOptions`, `useNotifyCheckIntent`, `useDirectOrders`,
`useStartDirectOrderCheckout`, `InvoiceCheckoutError` (all `@patina/supabase`); `visibleInvoices`
(`@/app/budget/rollup`); `journeyStageIndexForStatus` / `GOODS_JOURNEY_STAGES`
(`@/components/commercial/journey-stepper`); `moneyInWords` (`making/standing-sentence.ts`, unedited).

## Copy sources
- `src/app/invoices/[invoiceId]/payment-method-chooser.tsx` — every option label, fee label, badge, check
  panel and notify string.
- `src/app/invoices/[invoiceId]/page.tsx` — the pay handler, the reconciliation sentence, the analytics
  calls, the return-param names.
- `src/app/orders/page.tsx` — the payable rule for a direct order.
- `docs/design/the-client-page/path-b-the-threshold.html:393-417` — the letterbox unfold's order (figures,
  then the ways to pay, then one act).

## Gate output (verbatim)

`pnpm --dir .codex/worktrees/agent-cpc-l2/apps/client-portal type-check`
```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l2/apps/client-portal
> tsc --noEmit
```

`pnpm --dir .codex/worktrees/agent-cpc-l2/apps/client-portal test -- threshold making`
```
Test Suites: 36 passed, 36 total
Tests:       617 passed, 617 total
Snapshots:   0 total
Time:        5.064 s
Ran all test suites matching /threshold|making/i.
```
(610 before this lane; the 7 new suites are settlement, payment-method-chooser, earlier-invoices,
road-orders ×2, checkout-return, plus the letterbox/the-road additions.)

`npx eslint src/components/threshold src/components/making src/lib/threshold`
```
/…/src/components/making/the-making.tsx
  554:5  warning  Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps')

/…/src/components/making/tracking-row.tsx
  101:9  warning  Unused eslint-disable directive (no problems were reported from '@next/next/no-img-element')

✖ 2 problems (0 errors, 2 warnings)
```
Both warnings are pre-existing in files this lane did not touch. (`react-hooks/immutability` flagged
`window.location.href = url` in `road-orders.tsx`; it now calls `window.location.assign(url)`.)

`pnpm --filter @patina/supabase test`
```
 Test Files  84 passed (84)
      Tests  989 passed | 12 skipped (1001)
```

`pnpm --filter @patina/supabase type-check`
```
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
```

`pnpm --filter @patina/admin-portal build` — completed, route table printed, no type errors.

Edge function:
```
deno test --config supabase/functions/deno.json .../invoice-checkout-core.test.ts
ok | 13 passed | 0 failed (21ms)

deno check --config supabase/functions/deno.json .../create-checkout-session/index.ts
Check supabase/functions/create-checkout-session/index.ts
```

## NOT verified
- **Nothing was driven in a browser.** No local Supabase, no dev server, no Playwright — jest only, per
  the lane's constraints. The settle path was never taken against a real Stripe test session.
- **The repointed return URL is untested end-to-end.** The edge function is not deployed; the reader is
  tested against synthetic query strings only.
- **Coverage floor not measured** — `test -- threshold making` runs without `--coverage`; the full jest
  run with the 70/60/70/70 gate belongs to integration.
- **The road's drawing does not draw direct orders.** They appear as lines with their stop, not as rects
  on the SVG (the drawing's geometry is typed on `RoadPieceModel`).
- **A paid direct order never leaves the road** — `direct_orders` carries no arrival signal, so a piece
  bought direct stays at "Released to maker"/"In transit" indefinitely. Same as `/orders` today.
- **An order with `project_id = null` appears on every project's road** for a multi-project client. The
  alternative was losing it entirely once `/orders` retires.
- **Cancelled and refunded direct orders are not shown anywhere** on the Threshold (they are not coming).
- The letterbox states `Paid <date>` on the return without waiting for the webhook. The old page polled
  for the exact payment row; `useProjectInvoices` does not select `payments`, so that evidence is not
  available on this surface. The balance corrects itself on the next invoices refetch.

---

# Fix round (review `waves/w1/l2-review.md`)

Every blocker and major applied; ten of the eleven minors/nits applied, one rejected with a reason and
one accepted as a stated regression. Gate output at the end.

## Fixed, by finding number

**1 · blocker — the house no longer says money moved on the strength of a query string.**
`letterbox.tsx` / `road-orders.tsx` now derive the receipt from the ROW, not the address. A new
`useCheckoutConfirmation` (`lib/threshold/checkout-return.ts`) polls the surface's own re-read every 3s
for 30s — the invoice detail page's own interval and timeout — and yields `confirming` → `confirmed` |
`unconfirmed`. Copy, byte-copied from the routes being retired:
- letterbox: `Confirming payment… This usually takes a few seconds.` → `Paid <date>. Receipt in your
  email.` (the plan's sentence, now true when it is said) or, on timeout, `Checkout returned, but Patina
  has not confirmed a payment yet. Do not submit another payment until the status is known.`
- road: the same confirming line, then `/orders`' own `Your bank transfer has been started. Bank
  transfers take 3–5 business days to clear — we’ll email your receipt as soon as it lands.`
Nothing reverses: `confirming` only hardens. Settled evidence is `status === 'paid'` or
`invoiceBalanceCents(row) <= 0` for a letter, `status === 'paid'` for an order.

**2 · blocker — a second open invoice can be paid.** `earlier-invoices.tsx`: a line that is still open
(`sent`/`partially_paid` with a balance) carries **Settle this balance** beside Print, unfolding the same
`Settlement` on its own line (`aria-expanded`/`aria-controls`, `0fr→1fr`, content mounted only while
open). Nothing leaves the page; `/invoices/[id]` strands no balance when it retires. `derive.ts` is still
untouched — the row→model conversion is local to the file.

**3 · blocker — the repointed return URL is gated on the flagless portal.**
`create-checkout-session/index.ts` carries a `⚠ DEPLOY ORDER` block at the invoice `successUrl` and at
`directOrderReturnBase`: this function must not ship before L8 removes the `threshold` flag and the
flagless portal is live, or a client outside the flag lands on the old dashboard, which reads no
`?checkout=`. **Integration lane ship order: L8 merged → client portal deployed → `supabase functions
deploy create-checkout-session`.**

**4 · major — `paymentCompleted` fires on confirmation, not on the return.** The letterbox reports
`client_payment_completed` only when `confirm === 'confirmed'`; an abandoned ACH debit or a failure is
never counted. `paymentCancelled` still fires on the cancel return, with no amount (this surface has no
exact attempt evidence, and the old page deliberately omitted it rather than sampling a balance).

**5 · major — `payment_processing` is a standing fact, not a failure.** `settlement.tsx` branches on
`err.code === 'payment_processing'`, renders the till's own `payable.processingDetail` (`err.message`) in
a `role="status"` paragraph (`settlement-processing`), holds the act, and re-reads the invoices.

**6 · major — an order in flight says so.** `RoadOrderModel.inFlight` (`pending_payment` with a stamped
PaymentIntent) adds `· bank transfer pending` to the line — `/orders`' `Processing (bank transfer
pending)` in the road's own grammar. The act stays withheld (`payable` already excluded it).

**7 · major — the letter being paid is printable.** A `Print` act (`/invoices/<id>/print`, new tab) sits
beside "Open the letterbox", so the line items, tax, memo and payments list stay reachable for the open
letter after `/invoices/[invoiceId]` retires.

**8 · major — the return lands on its anchor.** `revealReturnAnchor` scrolls the letterbox (or the road)
into view once after the receipt renders, `behavior: 'auto'` under `prefers-reduced-motion`. Guarded for
jsdom and for a page where the element never mounts.

**9 · major — the house speaks only about rows it is holding.** The letterbox answers a return only when
`?invoice=` names an invoice in this project's list; the road only when `?order=` names a piece standing
on it. A hand-typed `?checkout=success&order=whatever` now says nothing and fires no event.

**10 · minor (partial, see rejections) — the act is held while a return is unconfirmed.**
`Settlement.hold` carries the old `canPay`'s `confirmState !== 'confirming' | 'unconfirmed'` terms, and
the `payment_processing` branch holds it too.

**11 · minor — first paint no longer waits on `direct_orders`.** `ordersQuery.isPending` is out of
`threshold.tsx`'s settle gate; the ROAD alone holds until orders settle (`ordersSettled`), so the "pieces
in motion" count still never rewrites itself.

**12 · minor — a houseless order says it is houseless.** `RoadOrderModel.houseless` renders `· bought
direct, not tied to this house`, so the same lamp standing in two houses after L8 does not read as two
lamps.

**13 · minor — refunded and cancelled orders are kept.** `toClosedOrders()` + a "No longer coming" list
at the end of the road: `<name> · Refunded|Canceled · bought <date> · <money>`, `/orders`' own words, no
act, never in the in-motion count.

**15 · minor — `invoiceBalanceCents` everywhere.** `earlier-invoices.tsx` no longer restates the
arithmetic.

**16 · minor — the chooser is held while a check notification is in flight.**
`disabled={startCheckout.isPending || notifyCheckIntent.isPending}`.

**17 · minor — the reconciliation branch re-reads.** `await onRefetch?.()` on both the reconciliation and
the processing branch. `onRefetch` is threaded `threshold.tsx` → `Letterbox` → `Settlement` (and to
`EarlierInvoices`), so no `useQueryClient` is required in a test that renders a bare component.

**18 · minor — `resetCheckoutReturn` is marked `@internal`** with the reason (it re-arms the latch; a
second read would replay a receipt).

**20 · minor — the four missing test cases, plus more.** `settlement.test.tsx`: card with
`useInvoicePaymentOptions.isPending` disables the act; `balanceCents <= 0` disables; `payment_processing`
renders as `role="status"` and holds the act; `hold` disables; the check-intent hold.
`letterbox.test.tsx`: a settled return **with the invoice still open in the slot** stays at "Confirming"
and counts nothing; the timeout sentence; a return naming a letter this house is not holding.
`road-orders.test.tsx`: settled-only receipt, confirming, timeout, foreign order, in-flight clause,
houseless clause, the closed list. `road-orders.test.ts`: `inFlight`/`houseless`/`settled` and
`toClosedOrders`. `checkout-return.test.ts`: `revealReturnAnchor` including reduced motion.

**21 · nit — one act in `spine-toll.tsx`.** The two `ScoredAction` branches are one element with spread
props; the sanctioned `making/` edit is now ~20 lines and the label lives in one place.

**22 · nit — `onFollow` fires on the settle path too**, so the toll's reporting has a counterpart in
place. (`Settlement` passes no `onFollow` today, so no behaviour changed for The Making.)

## Rejections and accepted regressions

- **10 (the rest) — `hasProcessingStripe` / `hasReconciliationRequired` are an accepted regression.**
  The evidence is `invoice.payments`, and `useProjectInvoices` does not select it. Adding a nested
  `payments` select to a `@patina/supabase` hook changes the payload for every consumer of that hook in
  three portals and needs a client-side RLS answer for `invoice_payments` — not a minimal shared-file
  edit, and the double-charge case it guards is still refused by the edge function (409) and now stated
  in the standing voice (finding 5). Stated here as the review permits.
- **14 — the webhook's email links stay as they are.** `stripe-webhook` links live in mail already sent;
  repointing them now would break for every client outside the `threshold` flag (finding 3's problem, in
  a place with no way to hold the deploy). The retirement plan owns `/orders` and `/invoices/<id>` as
  redirects. Said explicitly, as the finding asked.
- **19 — no change.** The plate belongs to `SpineToll`, which The Making renders as-is; stripping it here
  would either fork the toll or change The Making's surface. Raised for Fable at integration as the
  review suggests.

## Gate output (verbatim)

`pnpm --dir .codex/worktrees/agent-cpc-l2/apps/client-portal type-check`
```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l2/apps/client-portal
> tsc --noEmit
```

`pnpm --dir .codex/worktrees/agent-cpc-l2/apps/client-portal test -- threshold making`
```
Test Suites: 36 passed, 36 total
Tests:       641 passed, 641 total
Snapshots:   0 total
Time:        5.552 s
Ran all test suites matching /threshold|making/i.
```
(617 before the fix round; 641 after — 24 new cases.)

`npx eslint src/components/threshold src/components/making src/lib/threshold`
```
✖ 2 problems (0 errors, 2 warnings)
```
Both warnings are the pre-existing unused-disable directives in `the-making.tsx` and `tracking-row.tsx`,
files this lane has not touched.

`deno check --config supabase/functions/deno.json supabase/functions/create-checkout-session/index.ts`
```
Check supabase/functions/create-checkout-session/index.ts
```

Full client-portal jest (not a lane gate, run as a regression check): **136 of 138 suites pass, 1467 of
1468 tests pass.** The two failures are pre-existing on `origin/main` and untouched by this lane —
`src/lib/data/__tests__/orders.test.ts` cannot resolve `../orders` (the module does not exist on
`origin/main` either) and `src/lib/__tests__/portal-access.test.ts` › `foreignPortalFromDomain` fails on
the manufacturer case (last touched by `fe1cec874`, before this branch).

## Still NOT verified
Everything the first report listed still stands, minus the receipt claim, which is fixed. Additionally:
the confirmation poll has never run against a real webhook — only against jest fake timers and synthetic
rows.
