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
