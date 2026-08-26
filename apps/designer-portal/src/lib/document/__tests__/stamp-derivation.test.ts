import {
  deriveLineStamp,
  lineStampLabel,
  type LineStampInput,
  type LineStampKind,
} from '../stamp-derivation';

const base = {
  status: 'specified',
  blocked: false,
  received_quantity: null as number | null,
  blocking_decision: null,
};

describe('deriveLineStamp (R2)', () => {
  it.each(['specified', 'quoted', 'approved', 'ordered', 'production', 'shipped', 'installed'])(
    'renders the machine 1:1 for %s',
    (status) => {
      expect(deriveLineStamp({ ...base, status })).toEqual({ kind: status, dueDate: null });
    },
  );

  it('DECISION DUE when blocked by a pending decision, carrying the CURRENT due date', () => {
    expect(
      deriveLineStamp({
        ...base,
        status: 'specified',
        blocked: true,
        blocking_decision: { status: 'pending', due_date: '2026-06-14' },
      }),
    ).toEqual({ kind: 'decision_due', dueDate: '2026-06-14' });
  });

  it('DECISION DUE without a date when the pending decision has none', () => {
    expect(
      deriveLineStamp({
        ...base,
        blocked: true,
        blocking_decision: { status: 'pending', due_date: null },
      }),
    ).toEqual({ kind: 'decision_due', dueDate: null });
  });

  it('falls through to the machine when blocked but the decision is no longer pending', () => {
    expect(
      deriveLineStamp({
        ...base,
        status: 'approved',
        blocked: true,
        blocking_decision: { status: 'responded', due_date: '2026-06-01' },
      }),
    ).toEqual({ kind: 'approved', dueDate: null });
  });

  it('DELIVERED (awaiting inspection) when delivered with no inspection logged', () => {
    expect(deriveLineStamp({ ...base, status: 'delivered' })).toEqual({
      kind: 'delivered',
      dueDate: null,
    });
  });

  it('RECEIVED when delivered and an inspection has been logged (received_quantity set)', () => {
    expect(deriveLineStamp({ ...base, status: 'delivered', received_quantity: 2 })).toEqual({
      kind: 'received',
      dueDate: null,
    });
  });

  it('DAMAGED when an OPEN claim is attributed to THIS item (00196)', () => {
    expect(
      deriveLineStamp({
        ...base,
        status: 'delivered',
        received_quantity: 2,
        item_claims: [{ state: 'drafted' }],
      }),
    ).toEqual({ kind: 'damaged', dueDate: null });
  });

  it('resolved item claims fall through to the truthful machine state', () => {
    expect(
      deriveLineStamp({
        ...base,
        status: 'delivered',
        received_quantity: 2,
        item_claims: [{ state: 'resolved' }],
      }),
    ).toEqual({ kind: 'received', dueDate: null });
  });

  it('PO-grain claims (no item attribution) never stamp a line — R7 holds', () => {
    expect(
      deriveLineStamp({ ...base, status: 'shipped', item_claims: [] }),
    ).toEqual({ kind: 'shipped', dueDate: null });
  });

  it('DECISION DUE outranks DAMAGED', () => {
    expect(
      deriveLineStamp({
        ...base,
        blocked: true,
        blocking_decision: { status: 'pending', due_date: null },
        item_claims: [{ state: 'vendor_notified' }],
      }).kind,
    ).toBe('decision_due');
  });

  it('unknown status degrades to specified', () => {
    expect(deriveLineStamp({ ...base, status: 'mystery' }).kind).toBe('specified');
  });
});

describe('PARTIAL (R18 — surfaced from W5-T2 per-item counts)', () => {
  it('delivered + inspected short of ordered → partial', () => {
    expect(
      deriveLineStamp({ status: 'delivered', blocked: false, received_quantity: 1, quantity: 3 }).kind,
    ).toBe('partial');
  });

  it('delivered + inspected at full count → received', () => {
    expect(
      deriveLineStamp({ status: 'delivered', blocked: false, received_quantity: 3, quantity: 3 }).kind,
    ).toBe('received');
  });

  it('quantity unknown → falls back to received, never invents partial', () => {
    expect(
      deriveLineStamp({ status: 'delivered', blocked: false, received_quantity: 2 }).kind,
    ).toBe('received');
  });

  it('an attributed open claim still outranks partial', () => {
    expect(
      deriveLineStamp({
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
  row: LineStampInput;
  kind: LineStampKind;
  word: string;
}[] = [
  {
    state: 'unspecified',
    row: { status: 'specified', blocked: false, received_quantity: null },
    kind: 'specified',
    word: 'Specified',
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
    row: {
      status: 'delivered',
      blocked: false,
      received_quantity: 2,
      quantity: 2,
    },
    kind: 'received',
    word: 'Received',
  },
  {
    state: 'inspected short',
    row: {
      status: 'delivered',
      blocked: false,
      received_quantity: 1,
      quantity: 3,
    },
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
    expect(deriveLineStamp(row).kind).toBe(kind);
    expect(lineStampLabel(deriveLineStamp(row).kind)).toBe(word);
  });

  it('arrived and inspected-in-full are two states with two words', () => {
    expect(lineStampLabel('delivered')).not.toBe(lineStampLabel('received'));
  });

  it('a trade line whose scope progress is unresolved stays wordless', () => {
    expect(
      lineStampLabel(
        deriveLineStamp(
          {
            status: 'approved',
            blocked: false,
            received_quantity: null,
            trade_scope_document_id: 'pcd-1',
          },
          null,
        ).kind,
      ),
    ).toBe('');
  });
});
