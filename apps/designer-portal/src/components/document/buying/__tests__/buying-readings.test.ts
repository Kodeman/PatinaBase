import {
  formatMarkup,
  nextActOf,
  purchaseOrderFoot,
  readByMaker,
  readByNextAct,
  type BuyingLine,
  type BuyingPurchaseOrder,
  type NextActLine,
} from '@/lib/document/buying-readings';

const line = (over: Partial<BuyingLine> & { id: string }): BuyingLine => ({
  quantity: 1,
  vendor_id: null,
  vendor_name: null,
  trade_price_cents: null,
  unit_price_cents: null,
  line_total_cents: null,
  purchase_order_id: null,
  purchase_order: null,
  ...over,
});

const hale = { vendor_id: 'v-hale', vendor_name: 'Hale Upholstery' };
const visual = { vendor_id: 'v-visual', vendor_name: 'Visual Comfort' };
const ardent = { vendor_id: 'v-ardent', vendor_name: 'Ardent Rug' };

const po1042 = {
  id: 'po-1042',
  vendor_id: 'v-hale',
  po_number: 'PO-1042',
  status: 'in_production',
  sent_at: '2026-10-03',
  acknowledged_at: '2026-10-04',
  confirmed_eta: '2026-11-14',
};
const po1046 = {
  id: 'po-1046',
  vendor_id: 'v-ardent',
  po_number: 'PO-1046',
  status: 'confirmed',
  sent_at: '2026-10-01',
  acknowledged_at: null,
  confirmed_eta: '2026-10-20',
};

const LINES: BuyingLine[] = [
  line({ id: 'sconce', ...visual, quantity: 2, trade_price_cents: 63_000, unit_price_cents: 90_000, line_total_cents: 180_000 }),
  line({ id: 'sofa', ...hale, trade_price_cents: 648_000, line_total_cents: 972_000, purchase_order_id: 'po-1042', purchase_order: po1042 }),
  line({ id: 'chairs', vendor_name: 'Someone, not yet a maker', quantity: 2 }),
  line({ id: 'ottoman', ...hale, trade_price_cents: 192_000, line_total_cents: 288_000 }),
  line({ id: 'rug', ...ardent, trade_price_cents: 435_000, line_total_cents: 400_000, purchase_order_id: 'po-1046', purchase_order: po1046 }),
  line({ id: 'console' }),
];

const read = (canSeeMargin: boolean, lines = LINES) =>
  readByMaker(lines, (l) => l, { canSeeMargin });

describe('readByMaker — grouping', () => {
  it('groups maker → its POs → lines not on a PO, open POs first by soonest ETA, No maker yet last', () => {
    const reading = read(false);
    expect(reading.groups.map((g) => g.maker)).toEqual([
      'Ardent Rug', // open PO arriving 20 October
      'Hale Upholstery', // open PO arriving 14 November
      'Visual Comfort', // nothing ordered yet
      null, // No maker yet
    ]);
    const haleGroup = reading.groups[1];
    expect(haleGroup.orders.map((o) => o.label)).toEqual(['PO-1042']);
    expect(haleGroup.orders[0].lines.map((l) => l.id)).toEqual(['sofa']);
    expect(haleGroup.notOnOrder.map((l) => l.id)).toEqual(['ottoman']);
  });

  it('puts every line without a vendor in the "No maker yet" group, even one carrying a loose name', () => {
    const noMaker = read(false).groups.at(-1)!;
    expect(noMaker.key).toBe('no-maker');
    expect(noMaker.maker).toBeNull();
    expect(noMaker.notOnOrder.map((l) => l.id)).toEqual(['chairs', 'console']);
  });

  it('prints no "No maker yet" group when every line has a maker', () => {
    const reading = read(false, LINES.filter((l) => l.vendor_id));
    expect(reading.groups.some((g) => g.maker === null)).toBe(false);
    expect(reading.frontMatter).not.toMatch(/need a maker/);
  });
});

describe('readByMaker — totals', () => {
  it('sums trade × quantity per group and over every row printed (V11)', () => {
    const reading = read(false);
    const visualGroup = reading.groups.find((g) => g.maker === 'Visual Comfort')!;
    expect(visualGroup.notOnOrder[0].tradeCents).toBe(126_000);
    expect(visualGroup.tradeTotal).toEqual({ currency: 'USD', cents: 126_000 });
    expect(reading.tradeTotal).toEqual({
      currency: 'USD',
      cents: 126_000 + 648_000 + 192_000 + 435_000,
    });
    expect(reading.makerCount).toBe(3);
    expect(reading.needMakerCount).toBe(2);
  });

  it('writes the front matter as one sentence', () => {
    expect(read(false).frontMatter).toBe(
      'Three makers · $14,010 trade · two lines need a maker',
    );
  });

  it('says so when no trade cost is known yet rather than printing $0', () => {
    expect(read(false, [line({ id: 'console' })]).frontMatter).toBe(
      'No makers · no trade costs yet · one line needs a maker',
    );
  });

  it('refuses to add across currencies', () => {
    const reading = read(false, [
      line({ id: 'a', ...hale, trade_price_cents: 100, currency: 'USD' }),
      line({ id: 'b', ...hale, trade_price_cents: 100, currency: 'EUR' }),
    ]);
    expect(reading.tradeTotal).toEqual({ mixed: ['EUR', 'USD'] });
    expect(reading.frontMatter).toMatch(/Mixed currencies/);
  });
});

describe('readByMaker — the margin gate (C-36)', () => {
  it('computes neither client price nor markup when the viewer cannot see margin', () => {
    const every = read(false).groups.flatMap((g) => [
      ...g.orders.flatMap((o) => o.lines),
      ...g.notOnOrder,
    ]);
    expect(every.every((l) => l.clientCents === null && l.markupPct === null)).toBe(true);
    // Trade cost always shows: it is what the vendor charges.
    expect(every.find((l) => l.id === 'sofa')!.tradeCents).toBe(648_000);
  });

  it('shows client price and markup over trade when the viewer can see margin', () => {
    const lines = read(true).groups.flatMap((g) => [
      ...g.orders.flatMap((o) => o.lines),
      ...g.notOnOrder,
    ]);
    const byId = new Map(lines.map((l) => [l.id, l]));
    expect(byId.get('sofa')).toMatchObject({ clientCents: 972_000, markupPct: 50 });
    // Falls back to unit × quantity only when the line total is absent.
    expect(byId.get('sconce')).toMatchObject({ clientCents: 180_000, markupPct: 43 });
    // R5: a client price under trade is a negative markup, not clamped.
    expect(byId.get('rug')).toMatchObject({ clientCents: 400_000, markupPct: -8 });
    // No trade cost, no markup.
    expect(byId.get('console')).toMatchObject({ markupPct: null });
  });

  it('prints a negative markup plainly with a real minus sign', () => {
    expect(formatMarkup(-8)).toBe('−8%');
    expect(formatMarkup(50)).toBe('50%');
  });
});

describe('purchaseOrderFoot', () => {
  it('reads label · sent · acknowledged · movement · arrival', () => {
    expect(purchaseOrderFoot(po1042)).toBe(
      'PO-1042 · sent 3 October · acknowledged · in production · arrives ~14 November',
    );
  });

  it('says awaiting acknowledgment once sent, and not yet sent before', () => {
    expect(purchaseOrderFoot(po1046)).toBe(
      'PO-1046 · sent 1 October · awaiting acknowledgment · arrives ~20 October',
    );
    expect(purchaseOrderFoot({ po_number: 'PO-7', status: 'draft' })).toBe(
      'PO-7 · not yet sent',
    );
  });

  it('closes on delivered or cancelled', () => {
    expect(
      purchaseOrderFoot({ ...po1042, status: 'delivered', delivered_date: '2026-10-26' }),
    ).toBe('PO-1042 · sent 3 October · acknowledged · delivered 26 October');
    expect(purchaseOrderFoot({ ...po1042, status: 'cancelled' })).toBe(
      'PO-1042 · cancelled',
    );
  });
});

describe('readByNextAct (C-33)', () => {
  type Row = { line: NextActLine; reasons: string[] };
  const row = (over: Partial<NextActLine> & { id: string }, reasons: string[] = []): Row => ({
    line: { ...line({ id: over.id }), status: 'approved', received_quantity: null, item_claims: null, ...over },
    reasons,
  });
  const readNext = (rows: Row[]) => readByNextAct(rows, (r) => r.line, (r) => r.reasons);
  const heads = (rows: Row[]) =>
    readNext(rows).groups.map((g) => `${g.label}: ${g.rows.map((r) => r.line.id).join(',')}`);
  const onPo = (po: BuyingPurchaseOrder) => ({ purchase_order_id: po.id, purchase_order: po });

  it('groups unordered lines by first readiness reason, then Ready to order, then ordered lines by lifecycle step', () => {
    expect(
      heads([
        row({ id: 'installed', status: 'installed', ...hale, ...onPo(po1042) }),
        row({ id: 'ready', ...visual }),
        row({ id: 'price', ...visual }, ['Needs a client price']),
        row({ id: 'maker' }, ['Needs a maker', 'Needs a client price']),
        row({ id: 'draft', ...ardent, ...onPo({ id: 'po-9', status: 'draft', sent_at: null }) }),
        row({ id: 'ack', status: 'ordered', ...ardent, ...onPo(po1046) }),
        row({
          id: 'acked',
          status: 'ordered',
          ...hale,
          ...onPo({ id: 'po-7', status: 'confirmed', sent_at: '2026-10-01', acknowledged_at: '2026-10-02' }),
        }),
        row({ id: 'making', status: 'production', ...hale, ...onPo(po1042) }),
        row({ id: 'moving', status: 'shipped', ...hale, ...onPo({ ...po1042, status: 'shipped' }) }),
        row({ id: 'arrived', status: 'delivered', ...hale, ...onPo(po1042) }),
        row({
          id: 'damaged',
          status: 'delivered',
          received_quantity: 1,
          item_claims: [{ state: 'drafted' }],
          ...hale,
          ...onPo(po1042),
        }),
        row({ id: 'inspected', status: 'delivered', received_quantity: 1, ...hale, ...onPo(po1042) }),
        row({ id: 'maker-2' }, ['Needs a maker']),
      ]),
    ).toEqual([
      'Needs a maker: maker,maker-2',
      'Needs a client price: price',
      'Ready to order: ready',
      'To send: draft',
      'Waiting on the ack: ack',
      'Ordered: acked',
      'In production: making',
      'Shipped: moving',
      'To receive: arrived',
      'Claim open: damaged',
      'To install: inspected',
      'Installed: installed',
    ]);
  });

  it('reads a line on a PO by its lifecycle, never by the "Already on" reason', () => {
    expect(
      heads([row({ id: 'ack', status: 'ordered', ...ardent, ...onPo(po1046) }, ['Already on PO-1046'])]),
    ).toEqual(['Waiting on the ack: ack']);
  });

  it('reads delivered or installed goods with no PO (a cancelled order leaves their status) by lifecycle', () => {
    expect(
      heads([
        row({ id: 'kept', status: 'delivered', received_quantity: 2 }, ['Needs a maker']),
        row({ id: 'placed', status: 'installed' }, ['Needs a maker']),
      ]),
    ).toEqual(['To install: kept', 'Installed: placed']);
  });

  it('keeps a reason that carries its mark as its own group, in readiness order', () => {
    expect(
      heads([
        row({ id: 'a4', ...visual }, ['Waiting on the deposit (A4)']),
        row({ id: 'sel', ...visual }, ['Not selected yet', 'Waiting on the authorization']),
        row({ id: 'auth', ...visual }, ['Waiting on the authorization']),
      ]),
    ).toEqual([
      'Not selected yet: sel',
      'Waiting on the authorization: auth',
      'Waiting on the deposit (A4): a4',
    ]);
  });

  it('prints no group that holds no line — absence is silence', () => {
    const reading = readNext([row({ id: 'ready', ...visual })]);
    expect(reading.groups).toHaveLength(1);
    expect(reading.groups[0]).toMatchObject({ key: 'ready', label: 'Ready to order' });
    expect(reading.lineCount).toBe(1);
    expect(readNext([]).groups).toEqual([]);
  });

  it('names the group a single line reads under', () => {
    expect(nextActOf(line({ id: 'x' }), ['Needs a maker'])).toMatchObject({
      key: 'reason:Needs a maker',
      label: 'Needs a maker',
    });
  });
});
