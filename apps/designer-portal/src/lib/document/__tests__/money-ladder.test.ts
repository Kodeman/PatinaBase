/**
 * The money ladder — six rungs, each null until its own source answers, and
 * `Moved` as a figure that is genuinely not `Authorized`.
 *
 * The specimen throughout is the Vandersteen residence, whose printed ladder
 * the direction states in full:
 *
 *   Budget      $184,500 approved
 *   Plan        $171,240 specified
 *   Authorized  $141,600 ordered
 *   Moved       $62,700 in motion — ordered $141,600 less $78,900 paid out
 *   Owed        $17,500 out · Invoice 2026-114, 22 days · $96,400 billed to date
 *   Not drawn   $12,300 deposit · PO-2026-0418, 50% at release
 */
import type { Invoice, POPayment, PurchaseOrder } from '@patina/supabase';

import {
  deriveMoneyLadder,
  formatLadderRung,
  type MoneyLadder,
  type MoneyLadderInput,
} from '../money-ladder';

const ANSWERED = { settled: true, failed: false };
const PENDING = { settled: false, failed: false };
const FAILED = { settled: false, failed: true };

function payment(overrides: Partial<POPayment>): POPayment {
  return {
    id: 'payment-1',
    purchase_order_id: 'po-1',
    kind: 'deposit',
    amount_cents: 0,
    due_date: null,
    paid_date: null,
    state: 'pending',
    label: null,
    notes: null,
    sort_order: 0,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function purchaseOrder(
  overrides: Partial<PurchaseOrder> & { payments?: POPayment[] },
): PurchaseOrder {
  return { id: 'po-1', po_number: null, ...overrides } as unknown as PurchaseOrder;
}

function invoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 'invoice-1',
    invoice_number: null,
    status: 'sent',
    due_date: null,
    total_cents: 0,
    amount_paid_cents: 0,
    ...overrides,
  } as unknown as Invoice;
}

/** The Vandersteen's own orders: $78,900 paid out, $12,300 still undrawn. */
const VANDERSTEEN_POS = [
  purchaseOrder({
    po_number: 'PO-2026-0418',
    payments: [
      payment({ id: 'a', state: 'paid', amount_cents: 7_890_000 }),
      payment({
        id: 'b',
        state: 'due',
        kind: 'deposit',
        amount_cents: 1_230_000,
        due_date: '2026-09-15',
        label: '50% at release',
      }),
    ],
  }),
];

/** $17,500 open on Invoice 2026-114; $96,400 billed across both invoices. */
const VANDERSTEEN_INVOICES = [
  invoice({
    id: 'invoice-open',
    invoice_number: '2026-114',
    status: 'sent',
    due_date: '2026-08-03',
    total_cents: 1_750_000,
  }),
  invoice({
    id: 'invoice-paid',
    invoice_number: '2026-101',
    status: 'paid',
    total_cents: 7_890_000,
    amount_paid_cents: 7_890_000,
  }),
];

function input(overrides: Partial<MoneyLadderInput> = {}): MoneyLadderInput {
  return {
    budget: { ...ANSWERED, authorizedCents: 18_450_000 },
    plan: { ...ANSWERED, versionNumber: 2, lineCount: 4, targetCents: 17_124_000 },
    authorized: { ...ANSWERED, executedCount: 3, committedCents: 14_160_000 },
    purchaseOrders: { ...ANSWERED, rows: VANDERSTEEN_POS },
    invoices: { ...ANSWERED, rows: VANDERSTEEN_INVOICES },
    ...overrides,
  };
}

/** `invoiceDaysOverdue` is UTC-pinned bare-DATE math against today. */
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-08-25T12:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

const RUNG_ORDER: (keyof MoneyLadder)[] = [
  'budget',
  'plan',
  'authorized',
  'moved',
  'owed',
  'notDrawn',
];

describe('deriveMoneyLadder', () => {
  it('prints the whole specimen — six rungs, in order, with their figures', () => {
    const ladder = deriveMoneyLadder(input());

    expect(Object.keys(ladder)).toEqual(RUNG_ORDER);
    expect(ladder.budget).toMatchObject({ cents: 18_450_000, note: 'approved' });
    expect(ladder.plan).toMatchObject({ cents: 17_124_000, note: 'specified' });
    expect(ladder.authorized).toMatchObject({ cents: 14_160_000, note: 'ordered' });
    expect(ladder.moved).toMatchObject({
      cents: 6_270_000,
      note: 'in motion — ordered $141,600 less $78,900 paid out',
    });
    expect(ladder.owed).toMatchObject({
      cents: 1_750_000,
      note: 'out · Invoice 2026-114, 22 days · $96,400 billed to date',
    });
    expect(ladder.notDrawn).toMatchObject({
      cents: 1_230_000,
      note: 'deposit · PO-2026-0418, 50% at release',
    });
  });

  it('states no figure at all on any rung whose source has not answered', () => {
    const ladder = deriveMoneyLadder({
      budget: { ...PENDING, authorizedCents: 18_450_000 },
      plan: { ...PENDING, versionNumber: 2, lineCount: 4, targetCents: 17_124_000 },
      authorized: { ...PENDING, executedCount: 3, committedCents: 14_160_000 },
      purchaseOrders: { ...PENDING, rows: VANDERSTEEN_POS },
      invoices: { ...PENDING, rows: VANDERSTEEN_INVOICES },
    });

    for (const key of RUNG_ORDER) {
      expect(ladder[key].cents).toBeNull();
      expect(ladder[key].note).toBe('');
    }
  });

  it('says a failed read could not be read rather than impersonating a pending one', () => {
    const ladder = deriveMoneyLadder({
      budget: { ...FAILED, authorizedCents: null },
      plan: { ...FAILED, versionNumber: null, lineCount: 0, targetCents: 0 },
      authorized: { ...FAILED, executedCount: 0, committedCents: 0 },
      purchaseOrders: { ...FAILED, rows: [] },
      invoices: { ...FAILED, rows: [] },
    });

    for (const key of RUNG_ORDER) {
      expect(ladder[key]).toMatchObject({ cents: null, note: 'could not be read' });
    }
  });

  it('degrades every rung to an honest line when nothing is recorded', () => {
    const ladder = deriveMoneyLadder({
      budget: { ...ANSWERED, authorizedCents: null },
      plan: { ...ANSWERED, versionNumber: null, lineCount: 0, targetCents: 0 },
      authorized: { ...ANSWERED, executedCount: 0, committedCents: 0 },
      purchaseOrders: { ...ANSWERED, rows: [] },
      invoices: { ...ANSWERED, rows: [] },
    });

    expect(ladder.budget).toMatchObject({ cents: null, note: 'nothing approved yet' });
    expect(ladder.plan).toMatchObject({ cents: null, note: 'no working budget yet' });
    expect(ladder.authorized).toMatchObject({ cents: null, note: 'nothing executed yet' });
    expect(ladder.moved).toMatchObject({ cents: null, note: 'nothing in motion yet' });
    expect(ladder.owed).toMatchObject({ cents: null, note: 'nothing owed yet' });
    expect(ladder.notDrawn).toMatchObject({
      cents: null,
      note: 'nothing standing undrawn',
    });
  });

  it('names a line-less working budget rather than summing it into $0', () => {
    const ladder = deriveMoneyLadder(
      input({ plan: { ...ANSWERED, versionNumber: 1, lineCount: 0, targetCents: 0 } }),
    );

    expect(ladder.plan).toMatchObject({
      cents: null,
      note: 'working budget v1 · no rooms yet',
    });
  });

  describe('Moved', () => {
    it('is a different number from Authorized as soon as one payment is paid', () => {
      const ladder = deriveMoneyLadder(input());

      expect(ladder.moved.cents).not.toBe(ladder.authorized.cents);
      expect(ladder.moved.cents).toBe(14_160_000 - 7_890_000);
    });

    it('equals Authorized only while nothing has been paid out', () => {
      const ladder = deriveMoneyLadder(
        input({
          purchaseOrders: {
            ...ANSWERED,
            rows: [
              purchaseOrder({
                payments: [payment({ state: 'due', amount_cents: 1_230_000 })],
              }),
            ],
          },
        }),
      );

      expect(ladder.moved.cents).toBe(ladder.authorized.cents);
      expect(ladder.moved.note).toBe('in motion — ordered $141,600 less $0 paid out');
    });

    it('never runs backwards when a PO was paid beyond what was ordered', () => {
      const ladder = deriveMoneyLadder(
        input({
          authorized: { ...ANSWERED, executedCount: 1, committedCents: 100_000 },
          purchaseOrders: {
            ...ANSWERED,
            rows: [
              purchaseOrder({
                payments: [payment({ state: 'paid', amount_cents: 900_000 })],
              }),
            ],
          },
        }),
      );

      expect(ladder.moved.cents).toBe(0);
    });

    it('waits on both of its sources — the ordered figure and the payouts', () => {
      expect(
        deriveMoneyLadder(input({ purchaseOrders: { ...PENDING, rows: [] } })).moved,
      ).toMatchObject({ cents: null, note: '' });
      expect(
        deriveMoneyLadder(
          input({ authorized: { ...PENDING, executedCount: 0, committedCents: 0 } }),
        ).moved,
      ).toMatchObject({ cents: null, note: '' });
    });

    it('still states a payout made against an instrument that never executed', () => {
      const ladder = deriveMoneyLadder(
        input({ authorized: { ...ANSWERED, executedCount: 0, committedCents: 0 } }),
      );

      expect(ladder.moved.cents).toBe(0);
      expect(ladder.moved.note).toBe('in motion — ordered $0 less $78,900 paid out');
    });
  });

  describe('Owed', () => {
    it('prints the days the lead invoice is overdue', () => {
      jest.setSystemTime(new Date('2026-09-01T12:00:00Z'));

      expect(deriveMoneyLadder(input()).owed.note).toBe(
        'out · Invoice 2026-114, 29 days · $96,400 billed to date',
      );
    });

    it('drops the days clause on an invoice that is not yet due', () => {
      jest.setSystemTime(new Date('2026-07-01T12:00:00Z'));

      expect(deriveMoneyLadder(input()).owed.note).toBe(
        'out · Invoice 2026-114 · $96,400 billed to date',
      );
    });

    it('carries the balance still open, not the invoice total', () => {
      const ladder = deriveMoneyLadder(
        input({
          invoices: {
            ...ANSWERED,
            rows: [
              invoice({
                invoice_number: '2026-114',
                status: 'partially_paid',
                due_date: '2026-08-03',
                total_cents: 1_750_000,
                amount_paid_cents: 750_000,
              }),
            ],
          },
        }),
      );

      expect(ladder.owed.cents).toBe(1_000_000);
    });

    it('leaves drafts and voids out of the billed-to-date figure', () => {
      const ladder = deriveMoneyLadder(
        input({
          invoices: {
            ...ANSWERED,
            rows: [
              ...VANDERSTEEN_INVOICES,
              invoice({ id: 'd', status: 'draft', total_cents: 5_000_000 }),
              invoice({ id: 'v', status: 'void', total_cents: 5_000_000 }),
            ],
          },
        }),
      );

      expect(ladder.owed.note).toContain('$96,400 billed to date');
    });

    it('names an unnumbered invoice by its days alone', () => {
      const ladder = deriveMoneyLadder(
        input({
          invoices: {
            ...ANSWERED,
            rows: [
              invoice({ status: 'sent', due_date: '2026-08-03', total_cents: 1_750_000 }),
            ],
          },
        }),
      );

      expect(ladder.owed.note).toBe('out · 22 days · $17,500 billed to date');
    });
  });

  describe('Not drawn', () => {
    it('names the tranche without a PO number when none was assigned', () => {
      const ladder = deriveMoneyLadder(
        input({
          purchaseOrders: {
            ...ANSWERED,
            rows: [
              purchaseOrder({
                payments: [
                  payment({
                    state: 'due',
                    kind: 'balance',
                    amount_cents: 400_000,
                    label: 'balance on ship',
                  }),
                ],
              }),
            ],
          },
        }),
      );

      expect(ladder.notDrawn).toMatchObject({
        cents: 400_000,
        note: 'balance · balance on ship',
      });
    });
  });
});

describe('formatLadderRung', () => {
  it('prints the one-line form the running index carries', () => {
    const ladder = deriveMoneyLadder(input());

    expect(formatLadderRung(ladder.owed)).toBe('$17,500 owed');
    expect(formatLadderRung(ladder.moved)).toBe('$62,700 moved');
    expect(formatLadderRung(ladder.notDrawn)).toBe('$12,300 not drawn');
  });

  it('states nothing at all for a rung with no figure', () => {
    const ladder = deriveMoneyLadder(
      input({ invoices: { ...ANSWERED, rows: [] } }),
    );

    expect(formatLadderRung(ladder.owed)).toBeNull();
  });
});
