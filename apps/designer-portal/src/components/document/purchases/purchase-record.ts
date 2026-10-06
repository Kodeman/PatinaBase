/**
 * C-25 (d2 §M9, D1-13): purchase records, the pure half. A purchase is a store
 * buy, a find, an antique or auction lot, a passed-through expense or a sample
 * fee, already paid when it is recorded. These helpers turn the "Bought it
 * already" form into record_studio_purchase's request (00703) and a recorded
 * purchase into the line unfold's one sentence.
 */

import type { StudioPurchaseKind, StudioPurchaseRequest, StudioPurchaseRow } from '@patina/supabase';
import { formatCurrency } from '@patina/shared';
import { fmtDay } from '@/lib/document/format';
import { purchaseAtCostCents } from '@/lib/document/invoice-composer';

export const PURCHASE_KINDS: ReadonlyArray<{ kind: StudioPurchaseKind; label: string }> = [
  { kind: 'card_retail', label: 'Store buy' },
  { kind: 'one_off', label: 'Find' },
  { kind: 'antique_auction', label: 'Antique or auction' },
  { kind: 'expense', label: 'Expense' },
  { kind: 'sample_fee', label: 'Sample fee' },
];

/** A buyer's premium belongs to a find or an auction lot. */
export const takesBuyerPremium = (kind: StudioPurchaseKind) =>
  kind === 'one_off' || kind === 'antique_auction';

/** A store buy usually has a return window; a find or a lot does not. */
export const returnableByDefault = (kind: StudioPurchaseKind) => kind === 'card_retail';

/** The value the "Paid with" select carries for the buyer's own card. */
export const OWN_CARD = 'own-card';

export interface PurchaseDraft {
  kind: StudioPurchaseKind;
  description: string;
  payeeName: string;
  /** An optional link to a maker; there is never a forced vendor. */
  vendorId: string | null;
  purchasedOn: string | null;
  amount: string;
  tax: string;
  buyerPremium: string;
  shipping: string;
  /** A studio_payment_methods id, OWN_CARD, or '' (not said). */
  paidWith: string;
  returnable: boolean;
  returnBy: string | null;
  /** false = studio overhead, no project. */
  forProject: boolean;
  ffeItemId: string;
  billableToClient: boolean;
}

export interface PurchaseContext {
  projectId: string;
  /** The project's studio; required for overhead. */
  organizationId: string | null;
  /** The buyer's own organization_members id, when known. */
  memberId: string | null;
  receiptDocumentPath?: string | null;
}

/** "$1,234.56" / "1234.5" → cents. Empty → 0 when optional, else null. */
function cents(raw: string, optional: boolean): number | null {
  const clean = raw.replace(/[$,\s]/g, '');
  if (!clean) return optional ? 0 : null;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** The draft's figures in cents, or the first thing wrong with them. */
export function draftFigures(draft: PurchaseDraft):
  | { ok: true; amountCents: number; taxCents: number; buyerPremiumCents: number; shippingCents: number; totalCents: number }
  | { ok: false; error: string } {
  const amountCents = cents(draft.amount, false);
  if (amountCents == null || amountCents <= 0) return { ok: false, error: 'Enter what it cost, in dollars.' };
  const taxCents = cents(draft.tax, true);
  const buyerPremiumCents = takesBuyerPremium(draft.kind) ? cents(draft.buyerPremium, true) : 0;
  const shippingCents = cents(draft.shipping, true);
  if (taxCents == null || buyerPremiumCents == null || shippingCents == null) {
    return { ok: false, error: 'Tax, premium and shipping are dollar figures, or blank.' };
  }
  return {
    ok: true,
    amountCents,
    taxCents,
    buyerPremiumCents,
    shippingCents,
    totalCents: amountCents + taxCents + buyerPremiumCents + shippingCents,
  };
}

/**
 * The record_studio_purchase request for a draft, or the first thing the
 * buyer still has to say. Mirrors the RPC's own refusals so the form says
 * them before the round trip; the RPC stays the authority.
 */
export function buildPurchaseRequest(
  draft: PurchaseDraft,
  ctx: PurchaseContext,
): { ok: true; request: StudioPurchaseRequest } | { ok: false; error: string } {
  const payeeName = draft.payeeName.trim();
  if (!payeeName) return { ok: false, error: 'Say who it was bought from.' };
  if (!draft.purchasedOn) return { ok: false, error: 'Say when it was bought.' };
  const figures = draftFigures(draft);
  if (!figures.ok) return figures;
  const ownCard = draft.paidWith === OWN_CARD;
  if (ownCard && !ctx.memberId) {
    return { ok: false, error: 'Your studio membership is still loading; try again in a moment.' };
  }
  if (!draft.forProject && !ctx.organizationId) {
    return { ok: false, error: 'The studio is still loading; try again in a moment.' };
  }
  const returnBy = draft.returnable ? draft.returnBy : null;
  if (returnBy && returnBy < draft.purchasedOn) {
    return { ok: false, error: 'The return date falls before the purchase.' };
  }

  const request: StudioPurchaseRequest = {
    kind: draft.kind,
    payeeName,
    amountCents: figures.amountCents,
    purchasedOn: draft.purchasedOn,
    taxCents: figures.taxCents,
    buyerPremiumCents: figures.buyerPremiumCents,
    shippingCents: figures.shippingCents,
    returnable: draft.returnable,
    returnBy,
  };
  if (draft.description.trim()) request.description = draft.description.trim();
  if (draft.vendorId) request.vendorId = draft.vendorId;
  if (draft.forProject) {
    request.projectId = ctx.projectId;
    if (draft.ffeItemId) request.ffeItemId = draft.ffeItemId;
    // R-PB7: a project buy bills at cost on its own line by default.
    request.billableToClient = draft.billableToClient;
  } else {
    request.organizationId = ctx.organizationId;
    request.billableToClient = false;
  }
  if (ownCard) {
    request.paidByMemberId = ctx.memberId;
    request.reimburseMember = true;
  } else {
    if (draft.paidWith) request.paymentMethodId = draft.paidWith;
    if (ctx.memberId) request.paidByMemberId = ctx.memberId;
  }
  if (ctx.receiptDocumentPath) request.receiptDocumentPath = ctx.receiptDocumentPath;
  return { ok: true, request };
}

/** FF&E stages a line can still be bought from (00184 ranks below ordered). */
const BUYABLE_STAGES = new Set(['specified', 'quoted', 'approved']);

interface BuyableLineInput {
  id: string;
  name: string;
  status?: string | null;
  design_disposition?: string | null;
  removed_at?: string | null;
  blocked?: boolean | null;
  trade_scope_document_id?: string | null;
  purchase_order_id?: string | null;
}

/** The lines record_studio_purchase's FF&E guard would accept. */
export function buyableLines<T extends BuyableLineInput>(
  items: readonly T[],
  purchases: readonly Pick<StudioPurchaseRow, 'ffe_item_id' | 'status'>[] = [],
): T[] {
  const bought = new Set(
    purchases
      .filter((p) => p.ffe_item_id && (p.status === 'recorded' || p.status === 'billed'))
      .map((p) => p.ffe_item_id as string),
  );
  return items.filter(
    (it) =>
      !it.removed_at &&
      it.design_disposition === 'selected' &&
      !it.blocked &&
      !it.trade_scope_document_id &&
      !it.purchase_order_id &&
      BUYABLE_STAGES.has(String(it.status ?? '')) &&
      !bought.has(it.id),
  );
}

/** A line's own purchase: the live one, else the latest returned one. */
export function purchaseForLine<P extends Pick<StudioPurchaseRow, 'ffe_item_id' | 'status' | 'purchased_on'>>(
  purchases: readonly P[] | undefined,
  itemId: string,
): P | null {
  const mine = (purchases ?? []).filter((p) => p.ffe_item_id === itemId && p.status !== 'void');
  return (
    mine.find((p) => p.status === 'recorded' || p.status === 'billed') ??
    [...mine].sort((a, b) => b.purchased_on.localeCompare(a.purchased_on))[0] ??
    null
  );
}

/**
 * The unfold's sentence for a line bought this way:
 * "Bought on Amex · Leah · 3 Oct · returnable until 2 Nov". `methodLabel` is
 * the studio payment method's own label; `payerName` names whose own card it
 * was when the buyer is to be reimbursed.
 */
export function purchaseSentence(
  p: Pick<
    StudioPurchaseRow,
    'purchased_on' | 'returnable' | 'return_by' | 'returned_on' | 'status' | 'reimburse_member'
  > &
    Partial<Pick<StudioPurchaseRow, 'amount_cents' | 'tax_cents' | 'buyer_premium_cents' | 'shipping_cents'>>,
  methodLabel: string | null,
  payerName: string | null,
): string {
  const on = p.reimburse_member
    ? `Bought on ${payerName ? `${payerName}'s` : 'a'} own card`
    : methodLabel
      ? `Bought on ${methodLabel}`
      : 'Bought';
  const parts = [on];
  if (payerName && !p.reimburse_member) parts.push(payerName);
  parts.push(fmtDay(p.purchased_on));
  if (p.reimburse_member && p.amount_cents != null) {
    const owed = purchaseAtCostCents({ ...p, amount_cents: p.amount_cents });
    parts.push(`reimburse ${payerName ?? 'the buyer'} ${formatCurrency(owed)}`);
  }
  if (p.status === 'returned') parts.push(p.returned_on ? `returned ${fmtDay(p.returned_on)}` : 'returned');
  else if (p.returnable && p.return_by) parts.push(`returnable until ${fmtDay(p.return_by)}`);
  else if (!p.returnable) parts.push('not returnable');
  return parts.join(' · ');
}
