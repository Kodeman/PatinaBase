# L2 — Money in place · re-review of the fix round

Reviewer: fresh context, wrote neither the lane nor the first review. Subject: `client-page-2/l2`
@ `8d14bfb69` in `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l2` (read-only; no edits,
no git writes). Fix commit `8d14bfb69` on top of the reviewed `db30ecff2`; base `origin/main`
(`26b15145e`). Prior review: `waves/w1/l2-review.md`. Fix notes: the "Fix round" section at the end of
`waves/w1/l2-impl.md`.

## Gates (run in the worktree, verbatim tails)

`pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l2/apps/client-portal type-check`
```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l2/apps/client-portal
> tsc --noEmit
```

`pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l2/apps/client-portal test -- threshold making`
```
Test Suites: 36 passed, 36 total
Tests:       641 passed, 641 total
Snapshots:   0 total
Time:        5.264 s
Ran all test suites matching /threshold|making/i.
```

Both green in the sandbox — no sandbox-disabled retry needed. 641 reproduces the lane's reported figure
exactly (617 → 641, +24 cases). `npx eslint src/components/threshold src/components/making
src/lib/threshold` → `0 errors, 2 warnings`, both the pre-existing unused-disable directives in
`the-making.tsx:554` and `tracking-row.tsx:101`. Worktree clean; `derive.ts` and `mat.tsx` still
untouched, so shared-file discipline still holds and `spine-toll.tsx` remains the one sanctioned
`making/` edit (now smaller than it was — finding 21).

## Blockers — verified against the diff

**1 · FIXED.** The receipt is derived from the row, not the address.
`lib/threshold/checkout-return.ts:113-142` adds `useCheckoutConfirmation(active, settled, onRefetch)`
— a 3s interval with a 30s cut-off (`CONFIRM_POLL_INTERVAL_MS`/`CONFIRM_POLL_TIMEOUT_MS`, the retiring
routes' own numbers, `app/orders/page.tsx:20-21`) that yields `confirming → confirmed | unconfirmed`
and never reverses. `letterbox.tsx:132-139` feeds it `status === 'paid' || invoiceBalanceCents(row) <= 0`;
`letterbox.tsx:195-201` prints `Confirming payment… This usually takes a few seconds.` →
`Paid <date>. Receipt in your email.` or, on the cut-off, the old detail page's
`Checkout returned, but Patina has not confirmed a payment yet…`. `road-orders.tsx:68-72,106-112` does
the same against `status === 'paid'`, falling through to `/orders`' own
`Your bank transfer has been started. Bank transfers take 3–5 business days to clear…` — I diffed that
sentence against `app/orders/page.tsx:112-117` and it is faithful. The contradiction the review named
(`road-orders.test.tsx:106-113`, a receipt above a piece still at `Agreed`) is gone: that test is now
`says the money landed only once the order's own row says so` and is driven by a `settled: true` model.
Held by four new cases (`letterbox.test.tsx` confirming / timeout / foreign-letter,
`road-orders.test.tsx` confirming / timeout / foreign-order).

**2 · FIXED.** `earlier-invoices.tsx:47-52` adds `isOpen` (`sent`/`partially_paid` with a balance) and
`:155-169` gives such a line its own **Settle this balance** act, unfolding the same `Settlement` on its
own row at `:184-208` with `aria-expanded`/`aria-controls`, a `0fr→1fr` grid, and the content mounted
only while open. `/invoices/[invoiceId]` now strands no balance when it retires. Covered by
`earlier-invoices.test.tsx` › `settles a second open balance on its own line, in place`.

**3 · ADDRESSED AS PRESCRIBED, still process-only.** `create-checkout-session/index.ts:283-290` and
`:524-532` carry `⚠ DEPLOY ORDER` blocks naming the `threshold` flag, the fail-closed switch, and the
gate (L8 → portal → function). The ship order is restated in `l2-impl.md`. This is exactly what the
review asked for ("record the dependency in the integration lane's ship order"), so I score it fixed —
but note plainly that nothing mechanically prevents `supabase functions deploy create-checkout-session`
running early. The integration lane owns the actual gate.

## Majors — verified against the diff

**4 · FIXED.** `letterbox.tsx:146-156` — `paymentCompleted` returns early unless
`confirm === 'confirmed'`; `paymentCancelled` still fires on the cancel return, still without an amount.
Both new negative cases assert `paymentCompleted` was not called.

**5 · FIXED.** `settlement.tsx:123-133` branches on `err.code === 'payment_processing'`, sets a separate
`processing` state rendered at `:191-199` as `role="status"` (not `role="alert"`), holds the act
(`:162` `processing !== null`) and `await onRefetch?.()`. The default sentence is byte-identical to
`payable.processingDetail` in `index.ts:294-295`.

**6 · FIXED.** `lib/threshold/road-orders.ts:38,83` adds `inFlight` (`pending_payment` with a stamped
PaymentIntent — the same predicate as `orders/page.tsx:31`); `road-orders.tsx:129` appends
`· bank transfer pending`. The act stays withheld because `payable` already excluded it.

**7 · FIXED.** `letterbox.tsx:234-244` — a `Print` act (`/invoices/<id>/print`, new tab) beside "Open the
letterbox". The print route exists (`app/invoices/[invoiceId]/print/`) and is on the KEEP list, so line
items, tax, memo and the payments list stay reachable for the letter being paid.

**8 · FIXED.** `checkout-return.ts:144-157` — `revealReturnAnchor` scrolls once, `behavior: 'auto'` under
`prefers-reduced-motion`, guarded for a null element and for a jsdom element with no `scrollIntoView`.
Called once per surface behind a `revealed` ref (`letterbox.tsx:158-164`, `road-orders.tsx:74-80`).
Three unit cases including the reduced-motion branch.

**9 · FIXED (with a residual, see N4).** `letterbox.tsx:125-129` answers a return only when
`?invoice=` names a row in `invoices` and `?order=` is absent; `road-orders.tsx:64-67` only when
`?order=` names a piece standing on this road. A hand-typed `?checkout=success&order=whatever` now
renders nothing and fires nothing — asserted by two new cases.

## Minors and nits

Applied and verified: **11** (`threshold.tsx:427` drops `ordersQuery.isPending` from the settle gate;
the road alone holds at `:624-628` — see N6), **12** (`road-orders.ts:84` + `road-orders.tsx:128`
`bought direct, not tied to this house`), **13** (`toClosedOrders`, `road-orders.ts:95-110`; "No longer
coming" at `road-orders.tsx:153-176` — see N1 and N5), **15** (`earlier-invoices.tsx:50,61,68` now use
`invoiceBalanceCents`), **16** (`settlement.tsx:171` adds `|| notifyCheckIntent.isPending`), **17**
(`settlement.tsx:131,138` `await onRefetch?.()` on both branches, threaded `threshold.tsx:616` →
`Letterbox` → `Settlement`/`EarlierInvoices`, so no `useQueryClient` in a bare-component test), **18**
(`checkout-return.ts:78-83` `@internal` with the reason), **20** (all four named cases present, plus
eight more), **21** (`spine-toll.tsx:126-145` is one `ScoredAction` with spread props), **22**
(`spine-toll.tsx:136-139` calls `onFollow?.()` on the settle path).

Accepted with a stated reason, as the review permitted: **10 (the rest)** — `hasProcessingStripe` /
`hasReconciliationRequired` remain a stated regression, since the evidence is `invoice.payments` and
`useProjectInvoices` does not select it; the `hold` prop does carry the `confirming`/`unconfirmed`
terms. **14** — the `stripe-webhook` mail links stay, owned by the retirement plan as redirects. **19** —
the `SpineToll` plate is unchanged, raised for Fable at integration.

`onRefetch` is `invoicesQuery.refetch` / `ordersQuery.refetch` at `threshold.tsx:616,633` — stable
TanStack references, so the poll effect's `[active, settled, onRefetch]` deps do not restart the
`startedAt` clock. I checked this specifically because an inline arrow there would have made the 30s
cut-off unreachable.

## New defects the fix round introduced

**N1 · major · high · `apps/client-portal/src/components/threshold/threshold.tsx:628` with
`the-road.tsx:142-145`** — Finding 13's fix added `closedOrders.length > 0` to the condition that mounts
`TheRoad`, but `TheRoad`'s own empty branch keys on `inMotion = pieces.length + orders.length`
(`the-road.tsx:71`). A client whose only direct order was refunded or cancelled — no selections in the
making, nothing pending — now gets a whole **The road** section that did not exist at `db30ecff2`, and
it opens with `Nothing on the road.` immediately above a **No longer coming** list naming the refunded
piece. The house prints an empty-state and then contradicts it in the next element, on a surface whose
stated rule is that silence never has to take anything back. `road-orders.test.tsx` covers the closed
list at the component level; nothing covers it at `TheRoad`/`Threshold` level, which is where this
appears. *Fix:* count `closedOrders` out of the road-mount condition (keep them under an in-motion road
only), or make the `inMotion === 0` sentence conditional on `closedOrders.length === 0`.

**N2 · minor · high · `apps/client-portal/src/components/threshold/letterbox.tsx:264-267` vs
`earlier-invoices.tsx:193-204`** — The `hold` that finding 10 asked for reaches only the letter in the
slot: it is raised when `settlement?.invoiceId === invoice.id`, and `EarlierInvoices` neither accepts
nor forwards a `hold`. So the invoice that was actually taken to the till — if it was a second open one,
settled from the Earlier-invoices line — keeps a live **Settle this balance** and a live *Settle the
balance* act underneath it while its own payment is `confirming`. The edge function's attempt state
machine still refuses (`index.ts:1157-1166`, `payment_processing` 409) and finding 5's fix now states
that in the standing voice, so this is an invitation to press a dead act rather than a double charge.
*Fix:* thread `settlingReturn` (the returned invoice id plus the confirm state) into `EarlierInvoices`
and raise `hold` on the matching line.

**N3 · minor · high · `apps/client-portal/src/components/threshold/letterbox.tsx:125-133,188-203`** —
`returnedRow` is looked up across *all* project invoices, so a return naming an earlier invoice prints
its receipt in the letterbox header — unlabelled, and directly above the letter in the slot, which is a
different invoice still reading `Balance $9,125, due August 15`. That is a milder version of the exact
juxtaposition finding 1 objected to: the sentence is true, but nothing on it says which letter it is
about. *Fix:* name the invoice in the receipt (`Invoice 2026-014 · Paid September 4…`), or render an
earlier invoice's receipt on its own line in `EarlierInvoices`.

**N4 · minor · medium · `apps/client-portal/src/components/threshold/letterbox.tsx:132-134` with
`lib/threshold/checkout-return.ts:26-33`** — The confirmation evidence is "this row is paid", not "this
attempt settled". `session_id` and `checkout_attempt_id` arrive on the return and are deleted unused
(`TILL_PARAMS`), so `?invoice=<an-invoice-paid-last-month>&checkout=success` typed by hand still renders
`Paid <today>. Receipt in your email.` and fires `client_payment_completed` — and the date printed is
today's, not the payment's. RLS still scopes every row, so there is no exposure and the client can only
mislead herself, but `client_payment_completed` can be re-fired by re-pasting the address, and the old
route bound to the exact attempt precisely to avoid this. *Fix:* require `paid_at`/the attempt id to
match the return before hardening to `confirmed`, and print the row's own paid date.

**N5 · nit · high · `apps/client-portal/src/lib/threshold/road-orders.ts:101-109`** — `toClosedOrders`
keeps a `project_id = null` order in *every* project (`!order.project_id || …`, the same rule as
`toRoadOrders:71`) but `ClosedOrderModel` has no `houseless` field, so the finding-12 clause
`· bought direct, not tied to this house` is not applied to closed pieces. After L8 lands multi-project
houses, one refunded houseless lamp reads as a refunded lamp in every house. *Fix:* carry `houseless`
onto `ClosedOrderModel` and append the same clause.

**N6 · nit · high · `apps/client-portal/src/components/threshold/threshold.tsx:624-628` with
`packages/supabase/src/hooks/use-direct-orders.ts:96-110`** — Finding 11's fix took the pop-in off the
whole page and put it on the road, but the road also carries The Making's own pieces (`model.road`),
which were available as soon as the invoices settled. Those now wait on an unfiltered, client-wide
`direct_orders` round-trip that still has no `staleTime`, no `enabled` and no project filter, and the
road is rendered as `null` meanwhile — no placeholder, nothing to say a section is coming. The house
looks finished and then grows a road. The lane chose one of the review's two suggested fixes, so this is
inside the prescription; the other one (a `staleTime` on the hook) would have avoided it on every
navigation after the first. *Fix:* add `staleTime` to `useDirectOrders`, or render `TheRoad` on
`model.road` immediately and hold only the orders list and the in-motion count.

## Cross-checks with no findings

- **Hooks discipline** — every hook still sits above every early return: `road-orders.tsx:56-80` before
  the `orders.length === 0 && closed.length === 0` guard at `:95`; `earlier-invoices.tsx:109-110` before
  the `earlier.length === 0` guard at `:116`; `settlement.tsx:64-72` before any branch. No
  `window`/`document` at render — the address is still read in an effect (`checkout-return.ts:88-97`),
  so SSR and first paint agree.
- **The confirm poll** — `useCheckoutConfirmation` returns `null` when inactive, so a cancel return and
  a page with no return start no interval; the interval is cleared on unmount and on settle; `timedOut`
  only hardens. Deps are stable (see above). Both fake-timer tests exercise the 30s branch.
- **Copy fidelity of the new sentences** — `Confirming payment… This usually takes a few seconds.`,
  the ACH 3–5 business days sentence, and `Checkout returned, but Patina has not confirmed a payment
  yet…` are byte-faithful to `app/orders/page.tsx:104,114-116` and the invoice detail page.
- **Security / authorization** — unchanged by the fix round. `toClosedOrders` narrows the same
  RLS-scoped `direct_orders` set and adds no column; the repointed return URLs are still built
  server-side from the payable's own row; the new print link is a static `/invoices/<id>/print` on a row
  the surface already holds. The finding-9 guards strictly reduce what the house will speak to.
- **Accessibility** — the new Earlier-invoices settle unfold carries `aria-expanded` +
  `aria-controls` and mounts its content only while open (`earlier-invoices.tsx:161-162,186-192`), so
  nothing focusable hides in a `0fr` row; `settlement-processing` is `role="status"`, `settlement-error`
  stays `role="alert"`; both receipts are `role="status"` and render after hydration.
- **Shared files** — `spine-toll.tsx` is now a smaller edit than it was, with The Making's link branch
  intact; `derive.ts` and `mat.tsx` untouched; `threshold.tsx` gained two lines and lost one. Still
  merges cleanly against the other lanes as written.

## Verdict

**MERGEABLE_WITH_FIXES** — all three blockers and all six majors are genuinely fixed in the diff, not
just in the notes, and the two rejected minors were rejected on grounds the first review explicitly
allowed. Nothing found here blocks the merge. Fix N1 before integration (it is a visible contradiction
on a real path and it newly creates a section for clients who had none) and N2 with it; N3–N6 can ride
the integration lane.
