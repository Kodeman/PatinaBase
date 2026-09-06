# The pre-cutover invoice page — recovered from git (2026-09-06)

## 1. Where it lived and when it died

**Last commit where the files existed:** `98e36a9eb` ("fix(client): cross-lane review fixes before cutover", 2026-09-04) — i.e. `923c0e935^`.
**Deleted in:** `923c0e935` "chore(client): retire old portal — routes, api, hooks, tests" (2026-09-04 15:43), merged to main as `d95bb80a0`.

Files (retrieve with `git show 923c0e935^:<path>`):

| Path | Lines | Role |
|---|---|---|
| `apps/client-portal/src/app/invoices/page.tsx` | 197 | List route `/invoices` |
| `apps/client-portal/src/app/invoices/[invoiceId]/page.tsx` | 752 | Detail route `/invoices/[invoiceId]` — the page in question |
| `apps/client-portal/src/app/invoices/[invoiceId]/payment-method-chooser.tsx` | 198 | The ACH/Card/Check toggle |
| `apps/client-portal/src/app/invoices/[invoiceId]/checkout-return.ts` | 55 | Resolves the exact Stripe-returned payment row |
| `apps/client-portal/src/app/invoices/[invoiceId]/__tests__/payment-method-chooser.test.tsx` | 195 | RTL tests |
| `apps/client-portal/src/app/invoices/[invoiceId]/__tests__/checkout-return.test.ts` | 97 | |
| `apps/client-portal/src/app/invoices/__tests__/page.test.tsx` | 58 | |
| `apps/client-portal/src/app/invoices/[invoiceId]/print/page.tsx` | — | **Survived**; still at HEAD |

The toggle was introduced in `3b5ac2090` "feat(client-portal): payment method chooser with inline surcharge" (2026-08-05).

## 2. Structure of `/invoices/[invoiceId]` (at `923c0e935^`)

Client component (`'use client'`), `max-w-3xl px-6 py-10`, raw elements + CSS vars (deliberately no `@patina/design-system` import). Top to bottom:

1. **Back link** → `/invoices`
2. **Checkout-return banners** — seven states: `confirming` / `confirmed` / `processing` / `unconfirmed` / `failed` / `refunded` / `requires_refund`, plus a dismissible `cancelled` banner
3. **Header row** — status eyebrow (`statusHeadline`: "Paid in full" / "Voided by your designer" / "Past due" / "Partially paid" / "Awaiting payment"), `<h1>` invoice number, subline `{project.name} · from {designerName}`; right side = **Pay $X** button + **Print / save PDF** link
4. **3-up amount summary** — Total / Paid / Balance (or "Void"), with `Due {date}` under balance
5. **`<PaymentMethodChooser>`** — rendered only when `canPay`
6. Processing-payment notice
7. **Line items** — `<h2>What's included</h2>`; time lines annotated "Design time logged by your designer · {hours}"; qty × unit shown when qty ≠ 1
8. **Totals block** — Subtotal / Tax (n%) / Total / [Paid −, Balance due] / [fee row, Total to pay]
9. **Note from the designer** (memo)
10. **Payments** section with `<PaymentRow>` rows
11. **Void footnote**

**Studio branding:** `useStudioIdentity({ projectId: invoice?.project_id })`; `designerName = identity?.name ?? invoice.designer?.full_name ?? business_name ?? 'your designer'`.

**Hooks/data (all from `@patina/supabase`):** `useInvoice`, `useInvoicePaymentOptions`, `useNotifyCheckIntent`, `useStartCheckout`, `useStudioIdentity`, `InvoiceCheckoutError`. Analytics: `clientEvents.invoiceView / paymentMethodSelected / paymentStarted / paymentCompleted / paymentCancelled / checkIntentSubmitted` from `@/lib/analytics/events`.

**Auth gating:** `/invoices` was **not** in the public-path allowlist in `apps/client-portal/src/middleware.ts`. Signed-out → redirect to `/auth/signin?callbackUrl=…`; signed-in but wrong role domain → `/wrong-portal`. Row visibility beyond that was RLS: only issued (non-draft) invoices on the client's own projects; the page additionally hard-returned "Invoice not found." for `invoice.status === 'draft'`.

## 3. The surcharge math and the live total

`packages/shared/src/invoice/index.ts` (unchanged at HEAD):

```ts
export const ACH_SURCHARGE_BPS = 80;              // 0.8%
export const ACH_SURCHARGE_CAP_CENTS = 500;       // $5 cap
export const DEFAULT_CARD_SURCHARGE_BPS = 300;    // 3% fallback
export const CHECK_REMIT_FALLBACK = 'Contact your designer for mailing details';

/** ((cents * bps + 5000) / 10000) floored — exact integer half-up, SQL's twin. */
function surchargeFormula(amountCents: number, bps: number): number {
  return Math.floor((amountCents * bps + 5000) / 10000);
}
export function achSurchargeCents(amountCents: number): number {
  if (!(amountCents > 0)) return 0;
  return Math.min(surchargeFormula(amountCents, ACH_SURCHARGE_BPS), ACH_SURCHARGE_CAP_CENTS);
}
export function cardSurchargeCents(amountCents, cardBps = DEFAULT_CARD_SURCHARGE_BPS) {
  if (!(amountCents > 0)) return 0;
  return surchargeFormula(amountCents, cardBps);
}
export function onlineSurchargeCents(method, amountCents, cardBps = DEFAULT_CARD_SURCHARGE_BPS) {
  return method === 'us_bank_account'
    ? achSurchargeCents(amountCents)
    : cardSurchargeCents(amountCents, cardBps);
}
```

Page-level derivation (`page.tsx:353-363`) — this is what made the total move live:

```tsx
const cardSurchargeBps: number | null = paymentOptions.isPending
  ? null
  : (paymentOptions.data?.card_surcharge_bps ?? DEFAULT_CARD_SURCHARGE_BPS);
const surchargeKnown = method !== 'card' || cardSurchargeBps !== null;
const surcharge =
  method === 'check'
    ? 0
    : onlineSurchargeCents(method, balance, cardSurchargeBps ?? DEFAULT_CARD_SURCHARGE_BPS);
const chargeTotal = balance + surcharge;
```

Note the deliberate asymmetry: `null` **only while loading** (renders an em dash rather than quoting 3% at a studio that charges less); a resolved failure falls back to 300 ("over-quoting is survivable, under-quoting is not").

**Totals block, surcharge rows (`page.tsx:667-682`):**

```tsx
{canPay && surchargeKnown && surcharge > 0 && (
  <>
    <div className="flex justify-between py-0.5">
      <span className="type-meta-small">
        {method === 'us_bank_account' ? 'Bank transfer fee' : 'Card processing fee'}
      </span>
      <span className="type-label">{formatCurrency(surcharge, invoice.currency)}</span>
    </div>
    <div className="flex justify-between border-t border-[var(--border-default)] py-1.5">
      <span className="type-label">Total to pay</span>
      <span className="font-heading text-base font-semibold text-[var(--text-primary)]">
        {formatCurrency(chargeTotal, invoice.currency)}
      </span>
    </div>
  </>
)}
```

**Pay button (`page.tsx:499-515`)** — the label itself carried the live number, and the icon swapped `Landmark` ↔ `CreditCard`:

```tsx
{canPay && method !== 'check' && (
  <button type="button" onClick={handlePay} disabled={startCheckout.isPending} …>
    {startCheckout.isPending ? <Loader2 className="… animate-spin" />
      : method === 'us_bank_account' ? <Landmark className="h-3.5 w-3.5" />
      : <CreditCard className="h-3.5 w-3.5" />}
    Pay {formatCurrency(chargeTotal, invoice.currency)}
  </button>
)}
```

`canPay` = status `sent`|`partially_paid` AND `balance > 0` AND no processing Stripe payment AND no `requires_refund` AND confirmState not in confirming/processing/unconfirmed.

## 4. The toggle itself (`payment-method-chooser.tsx`)

A controlled `role="radiogroup"` labelled **"How would you like to pay?"**, `grid sm:grid-cols-3`, min 44px targets, selected option gets `--accent-primary` border + `--bg-surface` fill:

```tsx
const options: PaymentOption[] = [
  { value: 'us_bank_account', label: 'Bank transfer (ACH)',
    badge: 'Preferred · lowest fee', feeCents: achSurchargeCents(balanceCents) },
  { value: 'card', label: 'Card',
    feeCents: cardSurchargeBps === null ? null : cardSurchargeCents(balanceCents, cardSurchargeBps) },
  { value: 'check', label: 'Mail a check', feeCents: 0 },
];

function feeLabel(cents: number | null, currency: string): string {
  if (cents === null) return '—';
  return cents > 0 ? `+ ${formatCurrency(cents, currency)} processing fee` : 'No fee';
}
```

Check panel copy (shown when `method === 'check'`): "Mail your payment to" → `checkRemitTo?.trim() || CHECK_REMIT_FALLBACK` → "Write invoice {n} on the memo line." → button `Let {designerName} know a check is coming` → after send `{designerName} has been notified` + status line "Thanks — {designerName} knows a check is on its way." Re-entry guarded so a double-click sends one notification.

**Paid/settled state:** header eyebrow "Paid in full"; the chooser and Pay button disappear (`canPay` false); `<PaymentRow>` renders `Received {date}` and, when a fee was collected, `· + $X processing fee ($Y charged)`.

## 5. Docs and images

- `docs/design/the-client-page/README.md` — design brief for the replacement; L65 names the money standing ("Invoice No. 4 balance $9,125 due"), L112/128-130 map invoices → `#letterbox`.
- `docs/superpowers/specs/2026-09-04-the-client-page-design.md` — the cutover spec; L133 "Letterbox ← soonest-due open invoice", L156 the retired-route map.
- `docs/design/the-client-page/shots/path-a-*.png`, `path-b-*.png` — mockups of the two candidate client pages, **not** the old invoice page.
- `artifacts/ios-daily-return-2026-08-26/mock/deck-assets/c-13-invoice-detail.804.jpg` and `c-13b-invoice-detail-scrolled.804.jpg` — **iOS** invoice detail (`InvoiceDetailView.swift`).
- `artifacts/studio-invoices-2026-09-05/build/waves/walk/shots-merge-r1/04c-letterbox-open.png`, `04d-card-leg-blocked.png`, `06b-duo-letterbox.png`, `06c-duo-check-payee.png`, `06d-duo-print.png` — screenshots of the **new** letterbox (post-cutover, 09-05).

No screenshot of the old web `/invoices/[invoiceId]` page exists in the repo.

## 6. What HEAD does with invoices now

- **Route:** the standalone page is gone. `apps/client-portal/src/lib/retired-routes.ts` maps `/invoices` → anchor `letterbox` and `/invoices/<id>` → `/` (or `/projects/<id>`) with `?invoice=<id>#letterbox`, issued as a **308** from `middleware.ts`. Only `/invoices/[invoiceId]/print/page.tsx` survives as a real route.
- **Components:** `apps/client-portal/src/components/threshold/letterbox.tsx` (+ `letterbox-door.tsx`, `earlier-invoices.tsx`, `letter-payee.ts`), settlement in `apps/client-portal/src/components/threshold/settlement.tsx`, chooser at `apps/client-portal/src/components/threshold/payment-method-chooser.tsx`, checkout return moved to `apps/client-portal/src/lib/threshold/checkout-return.ts`, rollup at `apps/client-portal/src/lib/threshold/invoice-rollup.ts`.
- **Toggle survived, near-verbatim.** Same three options, same `achSurchargeCents`/`cardSurchargeCents`, same `CHECK_REMIT_FALLBACK`, same null-while-loading em dash. Changes: `badge` renamed `aside`, the design-system-free plates replaced by hairline chrome, and errors routed through `refusalSentence` (`@/lib/threshold/refusal`); the file header says "the same three ways to pay, the same fee arithmetic, the same check panel and the same words. What changed is the chrome."
- **Totals presentation changed.** The "Bank transfer fee / Card processing fee" + "Total to pay" table rows are gone. `settlement.tsx:183-192` replaces them with a single sentence: `You will be charged ${chargeTotal} — the balance and a ${surcharge} processing fee.` The pay affordance is now `SpineToll`'s settle action rather than a `Pay $X` button. `surcharge`/`chargeTotal` math is byte-identical to the old page.
- **Auth:** still required. `/` is explicitly not public in `middleware.ts`, so the letterbox sits behind sign-in + the client role-domain gate.
