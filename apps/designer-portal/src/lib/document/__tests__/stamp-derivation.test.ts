import { deriveLineStamp } from '../stamp-derivation';

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
