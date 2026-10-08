import {
  deriveLineStage,
  deriveLineStamp,
  isLaborLine,
  laborPiece,
  lineStageInputFromRow,
  lineStampLabel,
  priceWord,
  type LineStageInput,
  type LineStageRow,
  type LineStampKind,
  type LineStampRow,
  type TradeLineProgress,
} from '../stamp-derivation';

/** The path every consumer takes: the row, its stage built from the row. */
const stampOf = (
  row: LineStampRow,
  parent?: LineStageRow | null,
  tradeProgress?: TradeLineProgress | null,
) => deriveLineStamp({ ...row, stage: lineStageInputFromRow(row, parent) }, tradeProgress);

const base = {
  status: 'specified',
  blocked: false,
  received_quantity: null as number | null,
  blocking_decision: null,
};

describe('deriveLineStamp (R2)', () => {
  it.each(['quoted', 'approved', 'ordered', 'production', 'shipped', 'installed'])(
    'renders the machine 1:1 for %s',
    (status) => {
      expect(stampOf({ ...base, status })).toEqual({ kind: status, dueDate: null });
    },
  );

  it('DECISION DUE when blocked by a pending decision, carrying the CURRENT due date', () => {
    expect(
      stampOf({
        ...base,
        status: 'specified',
        blocked: true,
        blocking_decision: { status: 'pending', due_date: '2026-06-14' },
      }),
    ).toEqual({ kind: 'decision_due', dueDate: '2026-06-14' });
  });

  it('DECISION DUE without a date when the pending decision has none', () => {
    expect(
      stampOf({
        ...base,
        blocked: true,
        blocking_decision: { status: 'pending', due_date: null },
      }),
    ).toEqual({ kind: 'decision_due', dueDate: null });
  });

  it('falls through to the machine when blocked but the decision is no longer pending', () => {
    expect(
      stampOf({
        ...base,
        status: 'approved',
        blocked: true,
        blocking_decision: { status: 'responded', due_date: '2026-06-01' },
      }),
    ).toEqual({ kind: 'approved', dueDate: null });
  });

  it('DELIVERED (awaiting inspection) when delivered with no inspection logged', () => {
    expect(stampOf({ ...base, status: 'delivered' })).toEqual({
      kind: 'delivered',
      dueDate: null,
    });
  });

  it('RECEIVED when delivered and an inspection has been logged (received_quantity set)', () => {
    expect(stampOf({ ...base, status: 'delivered', received_quantity: 2 })).toEqual({
      kind: 'received',
      dueDate: null,
    });
  });

  it('DAMAGED when an OPEN claim is attributed to THIS item (00196)', () => {
    expect(
      stampOf({
        ...base,
        status: 'delivered',
        received_quantity: 2,
        item_claims: [{ state: 'drafted' }],
      }),
    ).toEqual({ kind: 'damaged', dueDate: null });
  });

  it('resolved item claims fall through to the truthful machine state', () => {
    expect(
      stampOf({
        ...base,
        status: 'delivered',
        received_quantity: 2,
        item_claims: [{ state: 'resolved' }],
      }),
    ).toEqual({ kind: 'received', dueDate: null });
  });

  it('PO-grain claims (no item attribution) never stamp a line — R7 holds', () => {
    expect(stampOf({ ...base, status: 'shipped', item_claims: [] })).toEqual({
      kind: 'shipped',
      dueDate: null,
    });
  });

  it('DECISION DUE outranks DAMAGED', () => {
    expect(
      stampOf({
        ...base,
        blocked: true,
        blocking_decision: { status: 'pending', due_date: null },
        item_claims: [{ state: 'vendor_notified' }],
      }).kind,
    ).toBe('decision_due');
  });

  it('an unknown status reads the D1 stage, never SPECIFIED', () => {
    expect(stampOf({ ...base, status: 'mystery' }).kind).toBe('placeholder');
    expect(stampOf({ ...base, status: 'mystery', vendor_name: 'Hollis Millwork' }).kind).toBe(
      'specced',
    );
  });
});

describe('PARTIAL (R18 — surfaced from W5-T2 per-item counts)', () => {
  it('delivered + inspected short of ordered → partial', () => {
    expect(
      stampOf({ status: 'delivered', blocked: false, received_quantity: 1, quantity: 3 }).kind,
    ).toBe('partial');
  });

  it('delivered + inspected at full count → received', () => {
    expect(
      stampOf({ status: 'delivered', blocked: false, received_quantity: 3, quantity: 3 }).kind,
    ).toBe('received');
  });

  it('quantity unknown → falls back to received, never invents partial', () => {
    expect(stampOf({ status: 'delivered', blocked: false, received_quantity: 2 }).kind).toBe(
      'received',
    );
  });

  it('an attributed open claim still outranks partial', () => {
    expect(
      stampOf({
        status: 'delivered',
        blocked: false,
        received_quantity: 1,
        quantity: 3,
        item_claims: [{ state: 'drafted' }],
      }).kind,
    ).toBe('damaged');
  });
});

/**
 * F58 — one derivation, one word per state. This table is the contract every
 * surface that names a line's lifecycle is held to; the consumers' own suites
 * assert they print exactly what it says.
 */
const STAMP_WORD_FIXTURES: {
  state: string;
  row: LineStampRow;
  kind: LineStampKind;
  word: string;
}[] = [
  {
    state: 'a name with no product and no maker',
    row: { status: 'specified', blocked: false, received_quantity: null },
    kind: 'placeholder',
    word: 'Placeholder',
  },
  {
    state: 'a product with no price',
    row: { status: 'specified', blocked: false, received_quantity: null, product_id: 'p-1' },
    kind: 'specced',
    word: 'Specced',
  },
  {
    state: 'a product, a quantity and a client price',
    row: {
      status: 'specified',
      blocked: false,
      received_quantity: null,
      product_id: 'p-1',
      quantity: 1,
      item_type: 'fixed',
      unit_price_cents: 3_800,
    },
    kind: 'ready',
    word: 'Ready',
  },
  {
    state: 'on a sent authorization',
    row: {
      status: 'specified',
      blocked: false,
      received_quantity: null,
      ffe_line_authorization: 'sent',
    },
    kind: 'released',
    word: 'Released',
  },
  {
    state: 'quoted',
    row: { status: 'quoted', blocked: false, received_quantity: null },
    kind: 'quoted',
    word: 'Quoted',
  },
  {
    state: 'approved',
    row: { status: 'approved', blocked: false, received_quantity: null },
    kind: 'approved',
    word: 'Approved',
  },
  {
    state: 'ordered',
    row: { status: 'ordered', blocked: false, received_quantity: null },
    kind: 'ordered',
    word: 'Released to maker',
  },
  {
    state: 'in production',
    row: { status: 'production', blocked: false, received_quantity: null },
    kind: 'production',
    word: 'In production',
  },
  {
    state: 'in transit',
    row: { status: 'shipped', blocked: false, received_quantity: null },
    kind: 'shipped',
    word: 'In transit',
  },
  {
    state: 'arrived, awaiting inspection',
    row: { status: 'delivered', blocked: false, received_quantity: null },
    kind: 'delivered',
    word: 'Delivered',
  },
  {
    state: 'inspected in full',
    row: { status: 'delivered', blocked: false, received_quantity: 2, quantity: 2 },
    kind: 'received',
    word: 'Received',
  },
  {
    state: 'inspected short',
    row: { status: 'delivered', blocked: false, received_quantity: 1, quantity: 3 },
    kind: 'partial',
    word: 'Partial',
  },
  {
    state: 'open claim',
    row: {
      status: 'delivered',
      blocked: false,
      received_quantity: 2,
      quantity: 2,
      item_claims: [{ state: 'drafted' }],
    },
    kind: 'damaged',
    word: 'Damaged',
  },
  {
    state: 'blocked on a pending decision',
    row: {
      status: 'specified',
      blocked: true,
      received_quantity: null,
      blocking_decision: { status: 'pending', due_date: null },
    },
    kind: 'decision_due',
    word: 'Decision due',
  },
  {
    state: 'installed',
    row: { status: 'installed', blocked: false, received_quantity: null },
    kind: 'installed',
    word: 'Installed',
  },
];

describe('lineStampLabel — F58, one word per state', () => {
  it.each(STAMP_WORD_FIXTURES)('$state reads $word', ({ row, kind, word }) => {
    expect(stampOf(row).kind).toBe(kind);
    expect(lineStampLabel(stampOf(row).kind)).toBe(word);
  });

  it('SPECIFIED never prints, whatever the row', () => {
    for (const { row } of STAMP_WORD_FIXTURES) {
      expect(lineStampLabel(stampOf(row).kind)).not.toBe('Specified');
    }
  });

  it('arrived and inspected-in-full are two states with two words', () => {
    expect(lineStampLabel('delivered')).not.toBe(lineStampLabel('received'));
  });

  it('a trade line whose scope progress is unresolved stays wordless', () => {
    expect(
      lineStampLabel(
        stampOf(
          {
            status: 'approved',
            blocked: false,
            received_quantity: null,
            trade_scope_document_id: 'pcd-1',
          },
          null,
          null,
        ).kind,
      ),
    ).toBe('');
  });

  it('prints Q3’s four words, and no ROUGHED', () => {
    expect(['placeholder', 'specced', 'ready', 'released'].map((k) => lineStampLabel(k as LineStampKind))).toEqual([
      'Placeholder',
      'Specced',
      'Ready',
      'Released',
    ]);
    for (const kind of ['placeholder', 'specced', 'ready', 'released'] as LineStampKind[]) {
      expect(lineStampLabel(kind)).not.toMatch(/rough/i);
    }
  });
});

/**
 * US-21 D1 — CONTRACT §3.3, every row R1–L3. The R6a–L3 rows are the fixtures
 * `supabase/tests/ffe/pieces_line_stage_test.sql` inserts, column for column,
 * so `stamp-label-parity.test.ts` can hold the TS and SQL words equal.
 */
const PRODUCT = 'p-21';
const MAKER = 'v-11';
const INSTALLER = 'v-12';

const row = (over: Partial<LineStampRow> & { rough_cents?: number }): LineStampRow => ({
  status: 'specified',
  blocked: false,
  received_quantity: null,
  item_type: 'fixed',
  product_id: null,
  vendor_id: null,
  vendor_name: null,
  quantity: 1,
  unit_price_cents: 0,
  budget_max_cents: null,
  ffe_line_authorization: null,
  line_kind: 'goods',
  ...over,
});

const PIECE_READY = row({
  status: 'specified',
  product_id: PRODUCT,
  vendor_id: MAKER,
  quantity: 9,
  unit_price_cents: 21_000,
});
const PIECE_SPECCED = row({ ...PIECE_READY, unit_price_cents: 0 });
const PIECE_RELEASED = row({ ...PIECE_READY, ffe_line_authorization: 'sent' });
const labor = (over: Partial<LineStampRow>) =>
  row({
    status: 'specified',
    vendor_id: INSTALLER,
    quantity: 9,
    unit_price_cents: 8_500,
    line_kind: 'labor',
    ...over,
  });

describe('D1 — the stage before an order (CONTRACT §3.3)', () => {
  it('R1: a pending blocking decision prints decision_due, at any stage', () => {
    expect(
      stampOf({
        ...PIECE_READY,
        blocked: true,
        blocking_decision: { status: 'pending', due_date: '2026-10-20' },
      }),
    ).toEqual({ kind: 'decision_due', dueDate: '2026-10-20' });
  });

  it('R2: an open damage claim on an ordered line prints damaged', () => {
    expect(
      stampOf({ ...PIECE_READY, status: 'ordered', item_claims: [{ state: 'drafted' }] }).kind,
    ).toBe('damaged');
  });

  it('R3: a Trade Scope presence line prints the trade word, never a pre-order word', () => {
    const presence = row({ status: 'specified', trade_scope_document_id: 'pcd-1' });
    expect(stampOf(presence).kind).toBe('trade_engaged');
    expect(stampOf(presence, null, 'in_progress').kind).toBe('trade_in_progress');
    expect(stampOf(presence, null, null).kind).toBe('trade_pending');
  });

  it('R4: delivered, 500 of 913 received, prints partial', () => {
    expect(
      stampOf({ ...PIECE_READY, status: 'delivered', quantity: 913, received_quantity: 500 }).kind,
    ).toBe('partial');
  });

  it.each(['ordered', 'production', 'shipped', 'installed'])(
    'R5: status %s prints the goods word, even on an authorization',
    (status) => {
      expect(stampOf({ ...PIECE_RELEASED, status }).kind).toBe(status);
    },
  );

  const CASES: { name: string; line: LineStampRow; parent?: LineStampRow; stage: string }[] = [
    { name: 'R6a sent authorization', line: row({ status: 'specified', product_id: PRODUCT, unit_price_cents: 3_800, ffe_line_authorization: 'sent' }), stage: 'released' },
    { name: 'R6b signed allowance, no product', line: row({ status: 'specified', item_type: 'allowance', budget_max_cents: 300_000, ffe_line_authorization: 'client_signed' }), stage: 'released' },
    { name: 'R7a product, qty 2, fixed 3800', line: row({ status: 'specified', product_id: PRODUCT, quantity: 2, unit_price_cents: 3_800 }), stage: 'ready' },
    { name: 'R7b product, allowance, ceiling 120000', line: row({ status: 'specified', product_id: PRODUCT, item_type: 'allowance', budget_max_cents: 120_000 }), stage: 'ready' },
    { name: 'R7c product, fixed 0, rough 480000', line: row({ status: 'specified', product_id: PRODUCT, rough_cents: 480_000 }), stage: 'specced' },
    { name: 'R8a product, no price', line: row({ status: 'specified', product_id: PRODUCT }), stage: 'specced' },
    { name: 'R8b no product, vendor_name Hollis Millwork', line: row({ status: 'specified', vendor_name: 'Hollis Millwork' }), stage: 'specced' },
    { name: 'R9a no product, no maker, rough 480000', line: row({ status: 'specified', rough_cents: 480_000 }), stage: 'placeholder' },
    { name: 'R9b no product, no maker, fixed 5000', line: row({ status: 'specified', unit_price_cents: 5_000 }), stage: 'placeholder' },
    { name: 'L1 labor 9 × 8500, piece ready', line: labor({}), parent: PIECE_READY, stage: 'ready' },
    { name: 'L2 labor, own price, piece specced', line: labor({}), parent: PIECE_SPECCED, stage: 'specced' },
    { name: 'L3 labor, piece released, on its authorization', line: labor({ ffe_line_authorization: 'sent' }), parent: PIECE_RELEASED, stage: 'released' },
  ];

  it.each(CASES)('$name → $stage', ({ line, parent, stage }) => {
    expect(deriveLineStage(lineStageInputFromRow(line, parent))).toBe(stage);
    expect(stampOf(line, parent)).toEqual({ kind: stage, dueDate: null });
  });

  it('R6b keeps item_type allowance, which prints ALLOWANCE beside RELEASED', () => {
    const r6b = CASES[1].line;
    expect(lineStageInputFromRow(r6b).itemType).toBe('allowance');
  });

  it('L1–L3: a labor line prints LABOR beside its word, never instead of it', () => {
    expect(isLaborLine(labor({}))).toBe(true);
    expect(isLaborLine(PIECE_READY)).toBe(false);
    expect(isLaborLine({})).toBe(false);
    expect(lineStampLabel(stampOf(labor({}), PIECE_READY).kind)).toBe('Ready');
  });

  it('released comes only from the line’s own authorization, never its piece’s', () => {
    expect(deriveLineStage(lineStageInputFromRow(labor({}), PIECE_RELEASED))).toBe('ready');
  });

  it('a labor line with no piece in hand is never ready', () => {
    expect(deriveLineStage(lineStageInputFromRow(labor({})))).toBe('specced');
  });

  it('a labor line whose piece is ordered reads as SQL does: no piece stage, not ready', () => {
    expect(
      lineStageInputFromRow(labor({}), { ...PIECE_READY, status: 'ordered' }).parentStage,
    ).toBeNull();
  });

  it('a rough figure never moves the word (R7c, R9a)', () => {
    const input: LineStageInput = lineStageInputFromRow(row({ status: 'specified' }));
    expect(input).not.toHaveProperty('roughCents');
  });

  it('tbd is never ready; a zero quantity is never ready', () => {
    expect(deriveLineStage(lineStageInputFromRow(row({ product_id: PRODUCT, item_type: 'tbd', unit_price_cents: 3_800 })))).toBe('specced');
    expect(deriveLineStage(lineStageInputFromRow(row({ product_id: PRODUCT, quantity: 0, unit_price_cents: 3_800 })))).toBe('specced');
  });
});

describe('lineStageInputFromRow — the one mapping from a snake_case row', () => {
  it('maps every D1 column to its camelCase input', () => {
    expect(
      lineStageInputFromRow({
        product_id: 'p-1',
        vendor_id: 'v-1',
        vendor_name: 'Nord Hardwood Co.',
        quantity: 913,
        item_type: 'fixed',
        unit_price_cents: 1_150,
        budget_max_cents: null,
        ffe_line_authorization: 'executed',
        line_kind: 'goods',
      }),
    ).toEqual({
      productId: 'p-1',
      vendorId: 'v-1',
      vendorName: 'Nord Hardwood Co.',
      quantity: 913,
      itemType: 'fixed',
      unitPriceCents: 1_150,
      budgetMaxCents: null,
      authorizationState: 'executed',
      lineKind: 'goods',
      parentStage: null,
    });
  });

  it('reads a blank vendor name as no maker, as btrim does in 00736', () => {
    expect(deriveLineStage(lineStageInputFromRow({ vendor_name: '   ' }))).toBe('placeholder');
  });

  it('defaults what a row leaves out: no maker, quantity 0, tbd, goods, no authorization', () => {
    expect(lineStageInputFromRow({})).toEqual({
      productId: null,
      vendorId: null,
      vendorName: null,
      quantity: 0,
      itemType: 'tbd',
      unitPriceCents: null,
      budgetMaxCents: null,
      authorizationState: null,
      lineKind: 'goods',
      parentStage: null,
    });
  });

  it('ignores a parent on a line that is not labor (a COM child)', () => {
    expect(lineStageInputFromRow(PIECE_READY, PIECE_RELEASED).parentStage).toBeNull();
  });
});

describe('laborPiece', () => {
  const rows = [
    { id: 'piece', line_kind: 'goods' },
    { id: 'install', line_kind: 'labor', parent_ffe_item_id: 'piece' },
    { id: 'com', line_kind: 'goods', parent_ffe_item_id: 'piece' },
  ];

  it('finds a labor line’s piece among the rows in hand', () => {
    expect(laborPiece(rows[1], rows)).toBe(rows[0]);
  });

  it('returns null for any other line, or a piece not in hand', () => {
    expect(laborPiece(rows[2], rows)).toBeNull();
    expect(laborPiece(rows[0], rows)).toBeNull();
    expect(laborPiece(rows[1], [])).toBeNull();
    expect(laborPiece(rows[1], undefined)).toBeNull();
  });
});

describe('priceWord — fix-now #5, print half', () => {
  it('reads Not priced for $0 with no product on a fixed or tbd line', () => {
    expect(priceWord({ unit_price_cents: 0, product_id: null, item_type: 'fixed' })).toBe(
      'Not priced',
    );
    expect(priceWord({ unit_price_cents: 0, product_id: null, item_type: 'tbd' })).toBe(
      'Not priced',
    );
    expect(priceWord({ unit_price_cents: 0, product_id: null })).toBe('Not priced');
  });

  it('leaves an allowance its figure', () => {
    expect(
      priceWord({ unit_price_cents: 0, product_id: null, item_type: 'allowance' }),
    ).toBeNull();
  });

  it('leaves a line with a product its stated price, even at 0', () => {
    expect(
      priceWord({ unit_price_cents: 0, product_id: 'p-1', item_type: 'fixed' }),
    ).toBeNull();
  });

  it('leaves a priced or unread price alone', () => {
    expect(
      priceWord({ unit_price_cents: 5_000, product_id: null, item_type: 'fixed' }),
    ).toBeNull();
    expect(
      priceWord({ unit_price_cents: null, product_id: null, item_type: 'fixed' }),
    ).toBeNull();
  });
});
