/**
 * C-25 (d2 §M9, D1-13): the "Bought it already" form's request args, the
 * line unfold's sentence, and which lines a buy can land on.
 */
import { fmtDay } from '@/lib/document/format';
import {
  OWN_CARD,
  buildPurchaseRequest,
  buyableLines,
  purchaseForLine,
  purchaseSentence,
  type PurchaseContext,
  type PurchaseDraft,
} from '../purchase-record';

function draft(partial: Partial<PurchaseDraft> = {}): PurchaseDraft {
  return {
    kind: 'card_retail',
    description: 'Pair of table lamps',
    payeeName: '  CB2 ',
    vendorId: null,
    purchasedOn: '2026-10-03',
    amount: '$1,200.50',
    tax: '96',
    buyerPremium: '',
    shipping: '',
    paidWith: 'pm-amex',
    returnable: true,
    returnBy: '2026-11-02',
    forProject: true,
    ffeItemId: 'line-1',
    billableToClient: true,
    ...partial,
  };
}

const ctx: PurchaseContext = { projectId: 'proj-1', organizationId: 'org-1', memberId: 'mem-leah' };

describe('buildPurchaseRequest — the record_studio_purchase args', () => {
  it('a studio-card store buy on a project line, billed at cost (R-PB7)', () => {
    const out = buildPurchaseRequest(draft(), { ...ctx, receiptDocumentPath: 'proj-1/receipt.jpg' });
    expect(out).toEqual({
      ok: true,
      request: {
        kind: 'card_retail',
        payeeName: 'CB2',
        description: 'Pair of table lamps',
        amountCents: 120050,
        purchasedOn: '2026-10-03',
        taxCents: 9600,
        buyerPremiumCents: 0,
        shippingCents: 0,
        returnable: true,
        returnBy: '2026-11-02',
        projectId: 'proj-1',
        ffeItemId: 'line-1',
        billableToClient: true,
        paymentMethodId: 'pm-amex',
        paidByMemberId: 'mem-leah',
        receiptDocumentPath: 'proj-1/receipt.jpg',
      },
    });
  });

  it('my own card asks to be reimbursed and names no studio method', () => {
    const out = buildPurchaseRequest(draft({ paidWith: OWN_CARD }), ctx);
    if (!out.ok) throw new Error(out.error);
    expect(out.request.reimburseMember).toBe(true);
    expect(out.request.paidByMemberId).toBe('mem-leah');
    expect(out.request.paymentMethodId).toBeUndefined();
  });

  it('a studio-overhead expense names the studio and never bills a client', () => {
    const out = buildPurchaseRequest(
      draft({ kind: 'expense', forProject: false, ffeItemId: 'line-1', billableToClient: true }),
      ctx,
    );
    if (!out.ok) throw new Error(out.error);
    expect(out.request.organizationId).toBe('org-1');
    expect(out.request.projectId).toBeUndefined();
    expect(out.request.ffeItemId).toBeUndefined();
    expect(out.request.billableToClient).toBe(false);
  });

  it("a find's buyer's premium and shipping ride along; a store buy's premium is zeroed", () => {
    const find = buildPurchaseRequest(draft({ kind: 'antique_auction', buyerPremium: '240', shipping: '85.5' }), ctx);
    if (!find.ok) throw new Error(find.error);
    expect(find.request.buyerPremiumCents).toBe(24000);
    expect(find.request.shippingCents).toBe(8550);
    const store = buildPurchaseRequest(draft({ buyerPremium: '240' }), ctx);
    if (!store.ok) throw new Error(store.error);
    expect(store.request.buyerPremiumCents).toBe(0);
  });

  it('drops the return date when the buy is not returnable', () => {
    const out = buildPurchaseRequest(draft({ returnable: false }), ctx);
    if (!out.ok) throw new Error(out.error);
    expect(out.request.returnable).toBe(false);
    expect(out.request.returnBy).toBeNull();
  });

  it.each([
    [{ payeeName: ' ' }, ctx, 'Say who it was bought from.'],
    [{ purchasedOn: null }, ctx, 'Say when it was bought.'],
    [{ amount: '' }, ctx, 'Enter what it cost, in dollars.'],
    [{ tax: 'ten' }, ctx, 'Tax, premium and shipping are dollar figures, or blank.'],
    [{ paidWith: OWN_CARD }, { ...ctx, memberId: null }, 'Your studio membership is still loading; try again in a moment.'],
    [{ forProject: false }, { ...ctx, organizationId: null }, 'The studio is still loading; try again in a moment.'],
    [{ returnBy: '2026-10-01' }, ctx, 'The return date falls before the purchase.'],
  ] as const)('refuses %o before the round trip', (partial, context, error) => {
    expect(buildPurchaseRequest(draft(partial), context)).toEqual({ ok: false, error });
  });
});

describe('purchaseSentence — the unfold fact', () => {
  const row = {
    purchased_on: '2026-10-03',
    returnable: true,
    return_by: '2026-11-02',
    returned_on: null,
    status: 'recorded',
    reimburse_member: false,
    amount_cents: 120050,
    tax_cents: 9600,
    buyer_premium_cents: 0,
    shipping_cents: 0,
  };

  it('reads "Bought on Amex · Leah · 3 Oct · returnable until 2 Nov"', () => {
    expect(purchaseSentence(row, 'Amex', 'Leah')).toBe(
      `Bought on Amex · Leah · ${fmtDay('2026-10-03')} · returnable until ${fmtDay('2026-11-02')}`,
    );
  });

  it("names the reimbursement owed on the buyer's own card, at cost", () => {
    expect(purchaseSentence({ ...row, reimburse_member: true }, null, 'Leah')).toBe(
      `Bought on Leah's own card · ${fmtDay('2026-10-03')} · reimburse Leah $1,296.50 · returnable until ${fmtDay('2026-11-02')}`,
    );
  });

  it('says returned, or not returnable', () => {
    expect(purchaseSentence({ ...row, status: 'returned', returned_on: '2026-10-20' }, 'Amex', null)).toBe(
      `Bought on Amex · ${fmtDay('2026-10-03')} · returned ${fmtDay('2026-10-20')}`,
    );
    expect(purchaseSentence({ ...row, returnable: false, return_by: null }, null, null)).toBe(
      `Bought · ${fmtDay('2026-10-03')} · not returnable`,
    );
  });
});

describe('buyableLines / purchaseForLine', () => {
  const line = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: id,
    status: 'approved',
    design_disposition: 'selected',
    removed_at: null,
    blocked: false,
    trade_scope_document_id: null,
    purchase_order_id: null,
    ...extra,
  });

  it('keeps only the lines the RPC guard would accept', () => {
    const items = [
      line('ok'),
      line('specified', { status: 'specified' }),
      line('ordered', { status: 'ordered' }),
      line('removed', { removed_at: '2026-10-01' }),
      line('proposed', { design_disposition: 'proposed' }),
      line('blocked', { blocked: true }),
      line('trade', { trade_scope_document_id: 'doc-1' }),
      line('on-po', { purchase_order_id: 'po-1' }),
      line('bought'),
      line('returned'),
    ];
    const purchases = [
      { ffe_item_id: 'bought', status: 'recorded' },
      { ffe_item_id: 'returned', status: 'returned' },
    ];
    expect(buyableLines(items, purchases).map((l) => l.id)).toEqual(['ok', 'specified', 'returned']);
  });

  it("finds a line's live purchase first, else its latest returned one, never a void", () => {
    const purchases = [
      { id: 'a', ffe_item_id: 'l1', status: 'returned', purchased_on: '2026-09-01' },
      { id: 'b', ffe_item_id: 'l1', status: 'returned', purchased_on: '2026-09-20' },
      { id: 'c', ffe_item_id: 'l2', status: 'void', purchased_on: '2026-09-20' },
      { id: 'd', ffe_item_id: 'l3', status: 'returned', purchased_on: '2026-09-20' },
      { id: 'e', ffe_item_id: 'l3', status: 'billed', purchased_on: '2026-09-01' },
    ];
    expect(purchaseForLine(purchases, 'l1')?.id).toBe('b');
    expect(purchaseForLine(purchases, 'l2')).toBeNull();
    expect(purchaseForLine(purchases, 'l3')?.id).toBe('e');
    expect(purchaseForLine(undefined, 'l1')).toBeNull();
  });
});
