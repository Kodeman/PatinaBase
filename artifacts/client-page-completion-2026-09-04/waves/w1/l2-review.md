# L2 — Money in place · adversarial review

Reviewer: fresh context, did not write the lane. Subject: `client-page-2/l2` @ `db30ecff2`
in `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l2` (read-only; no edits, no git writes).
Diff base `origin/main` (`26b15145e`). Lane report: `waves/w1/l2-impl.md`.

## Gates (run in the worktree, verbatim tails)

`pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l2/apps/client-portal type-check`
```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l2/apps/client-portal
> tsc --noEmit
```

`pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l2/apps/client-portal test -- threshold making`
```
Test Suites: 36 passed, 36 total
Tests:       617 passed, 617 total
Snapshots:   0 total
Time:        5.045 s
Ran all test suites matching /threshold|making/i.
```
Both green; the lane's reported figures reproduce exactly. Worktree clean, branch pushed
(`origin/client-page-2/l2` == `db30ecff2`). `mat.tsx` and `derive.ts` are untouched — shared-file
discipline holds (see §7 finding 18 for the one `making/` edit).

## Absorb list — act by act

| Old act (route) | In place now? | Where |
|---|---|---|
| Pay the open invoice — start Checkout (`/invoices/[id]`) | ✅ | `settlement.tsx:86` via `SpineToll` settle prop |
| Choose ACH / card / check, see the fee (`/invoices/[id]`) | ✅ byte-faithful | `payment-method-chooser.tsx` |
| Tell the designer a check is coming (`/invoices/[id]`) | ✅ byte-faithful | `payment-method-chooser.tsx:174-196` |
| Read the return from the till (`?checkout=`) | ⚠️ present but **unconfirmed** | finding 1 |
| Confirm against the webhook-backed payment row (poll) | ❌ dropped | findings 1, 4, 5 |
| Read "What's included" / subtotal / tax / Paid / Balance due | ❌ dropped | finding 7 |
| Read the designer's memo on the invoice | ❌ dropped | finding 7 |
| Read the Payments list ("No payments recorded yet") | ❌ dropped | finding 7 |
| Print / save PDF **for the invoice being paid** | ❌ dropped | finding 7 |
| Print an earlier invoice | ✅ | `earlier-invoices.tsx:117-127` |
| See every invoice, paid and open (`/invoices` list) | ⚠️ partial — this project only; voids dropped | findings 2, 13 |
| **Pay a second open invoice** (`/invoices` → detail) | ❌ **no act exists** | finding 2 |
| See direct orders with their status (`/orders`) | ⚠️ partial | findings 6, 13 |
| Pay for a direct order (`/orders`) | ✅ | `road-orders.tsx:80-93` |
| See a cancelled / refunded direct order (`/orders`) | ❌ dropped | finding 13 |

Hooks and payloads that did move are faithful: `useStartCheckout` payload
(`{invoiceId, paymentMethod}`), `clientEvents.paymentStarted` argument shape, the ACH default, the
`card_surcharge_bps` null-while-loading rule, the `DEFAULT_CARD_SURCHARGE_BPS` resolved-failure
fallback, the one-session busy gate, the `payment_reconciliation_required` sentence, every chooser
label / `CHECK_REMIT_FALLBACK` / memo-line string, and `/orders`' payable rule
(`pending_payment && !stripe_payment_intent_id`) are all byte-identical to the old files. The
divergences are listed below.

## Findings

**1 · blocker · high · `apps/client-portal/src/components/threshold/letterbox.tsx:140-150`
(and `road-orders.tsx:51-61`)** — The house states `Paid <date>. Receipt in your email.` on a bare
`?checkout=success`, with nothing from the webhook behind it. The route this replaces never claimed
that: `invoices/[invoiceId]/page.tsx:129-146` derived the display from the exact webhook-backed
payment row and rendered `Confirming payment…`, `Your payment provider is still processing this
payment. The balance will update after Patina receives confirmation.`, or `Checkout returned, but
Patina has not confirmed a payment yet. Do not submit another payment until the status is known.`
ACH is the preferred, default method and settles in 3–5 business days, so the ordinary case now
tells a homeowner she has paid while the letter directly beneath still reads `Balance $9,125, due
August 15` — copy that reverses on the next refetch, on the one subject where the house must not be
wrong. `road-orders.test.tsx:106-113` demonstrates the same contradiction: the receipt renders above
a piece still at `Agreed` with `Pay for this piece` live. Note the plan text literally specifies this
sentence, so this needs a ruling as well as a fix, but it cannot ship as written.
*Fix:* say only what the return proves (`Checkout returned — your receipt follows when the payment
clears.`) and hold `Paid <date>` until an invoice/order refetch shows it settled.

**2 · blocker · high · `apps/client-portal/src/components/threshold/earlier-invoices.tsx:117-127`** —
A second open invoice cannot be paid anywhere on the Threshold. `derive.ts:453-457` puts only the
soonest-due open invoice in the letterbox; every other `sent`/`partially_paid` invoice lands in
Earlier invoices with **Print** as its sole act, while `house-ledger`'s `owedCents` (derive.ts:154-163)
sums all of them. `/invoices/[invoiceId]` is on the ABSORB list (inventory:83), so deleting it strands
the second balance. The plan's L2 text asked only for "dated one-line receipts with Print", so this is
an inherited plan gap — but it defeats the plan's own goal ("delete the old surface without loss").
*Fix:* give an open line in Earlier invoices its own settle act (promote it into the same
`Settlement`), or keep `/invoices/[id]` until it has one.

**3 · blocker · high · `supabase/functions/create-checkout-session/index.ts:279-284`** — The return
URL is repointed at `/projects/<id>`, but on this branch `/projects/[projectId]` renders the Threshold
only behind the `threshold` PostHog flag and is explicitly fail-closed
(`making/project-surface-switch.tsx:57-71`). Any client not in the flag who pays now lands on the old
project dashboard, which reads no `?checkout=` at all: no receipt, no cancellation notice, and the
till's params left sitting on the address. The lane report flags portal-before-function deploy order
but not the flag, which is the harder constraint. *Fix:* block this function deploy on L8 (flag
removed, flagless portal live) and record the dependency in the integration lane's ship order.

**4 · major · high · `apps/client-portal/src/components/threshold/letterbox.tsx:108-117`** —
`clientEvents.paymentCompleted` now fires on the bare return, with `amountCents` omitted. The old page
(`invoices/[invoiceId]/page.tsx:148-197`) fired it only once `resolveReturnedCheckoutPayment`
resolved the exact attempt to `confirmed`, and deliberately omitted the amount rather than sampling a
balance another payment may have moved. `client_payment_completed` will now count abandoned ACH
debits and outright failures as completed revenue. *Fix:* fire on confirmation, not on the return.

**5 · major · high · `apps/client-portal/src/components/threshold/settlement.tsx:103-111`** — The
`InvoiceCheckoutError` code `payment_processing` is unhandled. The old page treated it as
success-in-progress (`setCheckoutReturn({outcome:'success'})`, reset the timeout, refetch, poll —
`page.tsx:249-258`); here it falls through to `setPayError(err.message)` and renders inside
`role="alert"`, so a client whose bank transfer is already clearing is told, in the failure voice,
that her payment did not start. *Fix:* branch on `err.code === 'payment_processing'` and state
`payable.processingDetail` as a standing fact (`role="status"`), not an alert.

**6 · major · high · `apps/client-portal/src/lib/threshold/road-orders.ts:32-35`** — `stopOf` maps
every non-`paid` order to `Agreed`, dropping `/orders`' `Processing (bank transfer pending)` for a
`pending_payment` row that already carries a `stripe_payment_intent_id` (`orders/page.tsx:28-32`). A
client who paid by ACH days ago sees her lamp at `Agreed`, with no act and no sentence — the surface
goes silent on money she believes has left her account. *Fix:* add the in-flight case
(`pending_payment && stripe_payment_intent_id`) with its own clause; `payable` already excludes it.

**7 · major · high · `apps/client-portal/src/components/threshold/letterbox.tsx:209`** — The invoice
being paid is the one invoice with no Print act and no detailed read anywhere on the surface:
`EarlierInvoices` excludes `exceptId` (`earlier-invoices.tsx:77`) and `Settlement` renders totals
only. Retiring `/invoices/[invoiceId]` therefore also retires "What's included" (line items,
subtotal, tax %, Paid / Balance due arithmetic), the designer's memo, and the Payments list, with no
route left to reach them for the open letter. *Fix:* add a `Print` act to the open letter (the print
route is KEEP), or unfold the line items in place.

**8 · major · medium · `apps/client-portal/src/lib/threshold/checkout-return.ts:70-76`** — The
cleaned address sets `#letterbox` / `#road` through `history.replaceState`, which never scrolls. On
the Threshold the letterbox sits well below the first viewport, so the returning payer lands at the
top of the house with her receipt off-screen and no signal it exists. The plan's return URL
(`/projects/<id>#letterbox?checkout=…`) assumed the anchor would land her at it. *Fix:* after
consuming, scroll the anchor into view once (`scrollIntoView`, `behavior` guarded by
`prefers-reduced-motion`).

**9 · major · medium · `apps/client-portal/src/components/threshold/road-orders.tsx:31-32` and
`letterbox.tsx:105-106`** — Neither reader checks the returned `invoice`/`order` id against what the
surface is actually holding, so any hand-typed `/projects/<mine>?checkout=success&order=whatever`
prints `Paid <today>. Receipt in your email.` and fires `paymentCompleted`. RLS still scopes every
row, so there is **no cross-client or cross-project data exposure** — but the house asserts a payment
fact it has not verified, from a URL the client controls. *Fix:* speak only when the returned id
matches a row this surface is rendering.

**10 · minor · high · `apps/client-portal/src/components/threshold/settlement.tsx:126`** — The settle
act is enabled on any positive balance, dropping the old `canPay` guards `!hasProcessingStripe &&
!hasReconciliationRequired && confirmState !== 'confirming' | 'processing' | 'unconfirmed'`
(`page.tsx:341-347`). The edge function still refuses (409), so there is no double charge, but the
client is invited to press an act that cannot work. `useProjectInvoices` (`use-invoices.ts:457-472`)
does not select `payments`, so the evidence genuinely is not on this surface. *Fix:* extend the
project-invoices select with `payments`, or state the accepted regression in the lane report.

**11 · minor · high · `apps/client-portal/src/components/threshold/threshold.tsx:427`** —
`ordersQuery.isPending` joins the settle gate, so every project page's first paint now blocks on an
unfiltered, client-wide `direct_orders` round-trip (`use-direct-orders.ts:97-110` — no `enabled`, no
`staleTime`, no project filter) that most clients have no rows for. *Fix:* give `useDirectOrders` a
`staleTime`, or gate only the road on it rather than the whole house.

**12 · minor · high · `apps/client-portal/src/lib/threshold/road-orders.ts:43`** — An order with
`project_id = null` renders on **every** project's road. L8 lands multi-project houses in the same
wave, so the same lamp will stand in two houses at once and be payable from either. The lane names
the trade-off; the multi-project collision is the part that gets worse this wave. *Fix:* show
houseless orders on the active project only, or label them "bought direct, not tied to this house".

**13 · minor · medium · `apps/client-portal/src/lib/threshold/road-orders.ts:42`** — Cancelled and
refunded direct orders disappear entirely; `/orders` showed them with their word (`Refunded`,
`Canceled`, `orders/page.tsx:24-33`) and every row's `created_at`. Once `/orders` retires a refunded
client has nowhere to see the refund. *Fix:* a "no longer coming" line in Previously, or keep them at
the end of the road with their word and date.

**14 · minor · medium · `supabase/functions/create-checkout-session/index.ts:516-519`** — Only this
function was repointed. `stripe-webhook/index.ts:1282,1297,1367` still emails clients
`/orders?order=<id>` and `:392,439,490,528` still emails `/invoices/<id>`; the inventory (lines
429-431) marks the `/orders` ones as breaking. *Fix:* repoint the webhook's order links to
`/projects/<project_id>#road` in the same change set, or leave `/orders` as a redirect the retirement
plan owns — and say which.

**15 · minor · medium · `apps/client-portal/src/components/threshold/earlier-invoices.tsx:40-43`** —
The balance is restated as `Math.max(total_cents - amount_paid_cents, 0)` instead of
`invoiceBalanceCents` from `@patina/shared`, which is the arithmetic every other money surface uses
(`derive.ts:20`, `spine-toll.tsx:91`, `budget/rollup.ts:30`) and which `spine-toll.tsx:89-95` has a
comment insisting on. Same answer today; one more place to drift. *Fix:* import
`invoiceBalanceCents`.

**16 · minor · medium · `apps/client-portal/src/components/threshold/settlement.tsx:135`** — The
chooser's `disabled` drops the old page's `|| notifyCheckIntent.isPending` (`page.tsx:574`), so the
options stay live while a check-intent notification is in flight. Trivial in effect, but it is one of
the "byte-faithful" claims. *Fix:* add the term.

**17 · minor · medium · `apps/client-portal/src/components/threshold/settlement.tsx:104-109`** — The
reconciliation branch drops the old page's `await refetch()`, so after "your designer will follow up"
the letterbox keeps showing figures that may already have moved. *Fix:* invalidate the project
invoices query on that branch.

**18 · minor · medium · `apps/client-portal/src/lib/threshold/checkout-return.ts:81-84`** —
`resetCheckoutReturn()` is shipped production code whose only purpose is the test seam for a
module-scope latch. It is small and honestly commented, but it exports a way for any caller to make
the house replay a receipt. *Fix:* hide the latch behind a factory the tests instantiate, or mark the
export `@internal`.

**19 · minor · low · `apps/client-portal/src/components/making/spine-toll.tsx:107-110`** — The
settlement now unfolds inside `SpineToll`'s plate (`rounded-[3px] border … bg-[var(--bg-surface)]`)
on a surface whose stated idiom is hairlines and typography — the lane deliberately stripped plates
and rounded borders from the chooser (`payment-method-chooser.tsx:14-23`) and then wrapped it in one.
Reuse of the toll is what the plan asked for, so this is a design question for Fable, not a defect.
VISION §6 otherwise holds: no shadows, no red/green (the old terracotta error colour is gone), no
badges (the ACH `badge` became an unaccented `aside`), no tabs, no header, `ScoredAction` throughout,
no "AI". *Fix:* none required; raise at integration if the plate reads wrong in the first viewport.

**20 · minor · medium · tests — `__tests__/settlement.test.tsx`** — Missing the case the file's own
comment calls load-bearing: `useInvoicePaymentOptions.isPending === true` with `method === 'card'`
must disable the act (`!surchargeKnown`, settlement.tsx:126) so no session is claimed at an unknown
fee. Also missing: `balanceCents <= 0` disables; `payment_processing` (finding 5); a settled return
rendered *with the invoice still open in the slot* (finding 1's contradiction). Everything present is
behaviour-level and the mocks match `making/__tests__` idiom. *Fix:* add the four cases.

**21 · nit · high · `apps/client-portal/src/components/making/spine-toll.tsx:123-147`** — The two
`ScoredAction` branches differ only in `href`/`onClick`/`loading`/`disabled`; one element with
conditional props keeps the sanctioned `making/` edit half the size and the label in one place —
which matters because this file is the merge point with The Making. *Fix:* single element, spread
props.

**22 · nit · medium · `apps/client-portal/src/components/making/spine-toll.tsx:83-88`** — With
`settle` given, `onFollow` is silently ignored, so the toll's `tollFollowed` reporting has no
counterpart on the settle path. *Fix:* call `onFollow` from the settle branch too, or say in the prop
doc that it is link-only.

## Cross-checks with no findings

- **Hooks discipline** — every hook sits above every early return (`road-orders.tsx:27-32` before the
  `orders.length === 0` guard; `settlement.tsx:49-54`); no `window`/`document` at render;
  `useCheckoutReturn` reads the address in an effect and starts `null`, so SSR and first paint agree.
- **Settle before speaking / silence** — `ordersQuery.isPending` joins the gate (threshold.tsx:427);
  a failed orders query yields `[]`, not an error string; `EarlierInvoices` returns `null` rather
  than printing an empty-state card.
- **Accessibility** — this lane adds no overlay or sheet, so `role="dialog"` / focus trap / Esc do
  not apply. The unfolds render their content only while open (`letterbox.tsx:189`,
  `earlier-invoices.tsx:103`), so nothing focusable hides in a `0fr` row; `aria-expanded` +
  `aria-controls` are on both; the chooser is a native `radiogroup` with `aria-labelledby` and a
  polite live region on the unknown fee; failures carry `role="alert"`, receipts `role="status"`, and
  the receipt appears after hydration so it is announced.
- **Security / authorization** — `useDirectOrders` is RLS-scoped (`client_id = auth.uid()`, 00267) and
  keeps the 00540 column allowlist; `toRoadOrders` narrows further, never widens. The repointed
  return URL is built **server-side from the payable's own row** — no client-supplied path, so no
  open-redirect. `loadInvoicePayable`'s client-only authorization (index.ts:228-238) is untouched, and
  `invoices.project_id` is `NOT NULL` (00178:31), so no `/projects/null`. `cleanedCheckoutUrl`
  returns path+search+hash only. No act skips an authorization the old route enforced.
- **Shared files** — `mat.tsx` and `derive.ts` are not touched; `threshold.tsx` is 5 additive edits
  (import, hook call, gate term, Letterbox props, road mount) and `spine-toll.tsx` is purely additive
  with the link branch preserved for The Making. Merges cleanly against the other lanes as written.

## Verdict

**NOT_MERGEABLE** as it stands. Findings 1 and 3 are hard gates (the house claims money has moved
when it has not; the repointed return URL breaks for every client outside the `threshold` flag).
Finding 2 needs a ruling — the plan asked for Print-only, but shipping it retires the only way to pay
a second open invoice. Everything else is fixable in a round; the craft, the copy fidelity of what
did move, and the test discipline are otherwise strong.
