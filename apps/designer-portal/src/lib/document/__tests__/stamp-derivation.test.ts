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

  it('no DAMAGED stamp exists at the line grain (R7 — claims surface via unfold + need line)', () => {
    // A delivered+inspected line on a PO with an open claim still stamps its
    // own truthful state; the claim belongs to the PO, not this line.
    expect(deriveLineStamp({ ...base, status: 'delivered', received_quantity: 2 })).toEqual({
      kind: 'received',
      dueDate: null,
    });
  });

  it('unknown status degrades to specified', () => {
    expect(deriveLineStamp({ ...base, status: 'mystery' }).kind).toBe('specified');
  });
});
