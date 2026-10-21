/**
 * The one invoice projection (CPUX-02) — pure functions, no hooks or mocks.
 * Fixtures are synthetic; `today` is frozen and only the evidence under test
 * varies. Acceptance rows A01–A06 of the homeowner-usability spec (§10).
 */

import type { Invoice, InvoicePayment } from '@patina/supabase';

import { adoptedHouseId, standsUnfiled } from '../adopted-house';
import {
  houseInvoices,
  invoiceProjection,
  invoiceReadState,
  retireSettledHolds,
  visibleInvoices,
  type InvoiceReadSource,
  type InvoiceReadState,
  type InvoiceServerHold,
} from '../invoice-rollup';

const TODAY = new Date(2026, 9, 20, 9, 0);

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    project_id: 'proj-1',
    studio_id: 'studio-1',
    designer_id: 'designer-1',
    client_id: 'client-1',
    invoice_number: 'INV-0001',
    title: null,
    status: 'sent',
    issue_date: '2026-10-01',
    due_date: '2026-11-01',
    payment_terms_days: 15,
    currency: 'USD',
    subtotal_cents: 100000,
    tax_rate: 0,
    tax_cents: 0,
    total_cents: 100000,
    amount_paid_cents: 0,
    memo: null,
    internal_notes: null,
    stripe_checkout_session_id: null,
    sent_at: '2026-10-01T15:00:00Z',
    paid_at: null,
    voided_at: null,
    void_reason: null,
    reminder_count: 0,
    last_reminder_at: null,
    ar_flagged_at: null,
    ar_last_chased_at: null,
    created_at: '2026-10-01T14:00:00Z',
    updated_at: '2026-10-01T14:00:00Z',
    payments: [],
    ...overrides,
  };
}

function payment(overrides: Partial<InvoicePayment> = {}): InvoicePayment {
  return {
    id: 'pay-1',
    invoice_id: 'inv-1',
    checkout_attempt_id: 'attempt-1',
    amount_cents: 1000,
    method: 'stripe',
    status: 'pending',
    stripe_checkout_session_id: 'cs_test_1',
    stripe_payment_intent_id: null,
    stripe_event_id: null,
    reference: null,
    note: null,
    recorded_by: null,
    received_at: null,
    created_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-19T10:00:00Z',
    ...overrides,
  };
}

const project = (overrides: Partial<InvoiceReadSource> = {}): InvoiceReadSource => ({
  data: [],
  isPending: false,
  isError: false,
  ...overrides,
});

const complete = (invoices: Invoice[]) =>
  invoiceProjection(invoices, { today: TODAY, read: 'complete' });

const ids = (rows: { invoice: Invoice }[]) => rows.map((row) => row.invoice.id);

describe('visibleInvoices', () => {
  it('excludes draft and void invoices, keeps everything else', () => {
    const invoices = [
      makeInvoice({ id: 'a', status: 'draft' }),
      makeInvoice({ id: 'b', status: 'sent' }),
      makeInvoice({ id: 'c', status: 'partially_paid' }),
      makeInvoice({ id: 'd', status: 'paid' }),
      makeInvoice({ id: 'e', status: 'void' }),
    ];

    expect(visibleInvoices(invoices).map((i) => i.id)).toEqual(['b', 'c', 'd']);
  });
});

// ── A01 — six outstanding, plus history ─────────────────────────────────────

describe('invoiceProjection — A01 every outstanding invoice, in a stable order', () => {
  // 60000 + 10000 + 30000 + 25000 + 5000 + 7500 = 137500
  const outstanding = [
    makeInvoice({ id: 'inv-undated', due_date: null, total_cents: 7500 }),
    makeInvoice({ id: 'inv-future-a', due_date: '2026-11-15', issue_date: '2026-10-05', total_cents: 25000 }),
    makeInvoice({ id: 'inv-today', due_date: '2026-10-20', total_cents: 10000 }),
    makeInvoice({
      id: 'inv-partial',
      status: 'partially_paid',
      due_date: '2026-11-02',
      total_cents: 50000,
      amount_paid_cents: 20000,
    }),
    makeInvoice({ id: 'inv-future-b', due_date: '2026-11-15', issue_date: '2026-10-01', total_cents: 5000 }),
    makeInvoice({ id: 'inv-past', due_date: '2026-10-01', total_cents: 60000 }),
  ];
  const history = [
    makeInvoice({
      id: 'inv-paid-old',
      status: 'paid',
      total_cents: 40000,
      amount_paid_cents: 40000,
      paid_at: '2026-08-01T12:00:00Z',
    }),
    makeInvoice({
      id: 'inv-paid-new',
      status: 'paid',
      total_cents: 40000,
      amount_paid_cents: 40000,
      paid_at: '2026-09-01T12:00:00Z',
    }),
  ];

  const projection = complete([...history, ...outstanding]);

  it('puts all six positive balances under payable, due date first, ties by issue date, undated last', () => {
    expect(ids(projection.payable)).toEqual([
      'inv-past',
      'inv-today',
      'inv-partial',
      'inv-future-b',
      'inv-future-a',
      'inv-undated',
    ]);
    expect(projection.outstanding).toEqual(projection.payable);
  });

  it('counts and totals exactly those six, in their currency', () => {
    expect(projection.counts).toEqual({ review: 0, processing: 0, payable: 6, history: 2 });
    expect(projection.outstandingTotals).toEqual([
      { currency: 'USD', cents: 137500, invoiceCount: 6 },
    ]);
    expect(projection.withheld).toBeNull();
    expect(projection.nothingToPay).toBe(false);
    expect(projection.allClear).toBe(false);
  });

  it('reads the partially paid balance canonically', () => {
    const partial = projection.payable.find((row) => row.invoice.id === 'inv-partial');
    expect(partial?.balanceCents).toBe(30000);
  });

  it('reads due dates by calendar day: due today is not past due', () => {
    const due = Object.fromEntries(projection.payable.map((row) => [row.invoice.id, row.dueState]));
    expect(due).toEqual({
      'inv-past': 'past_due',
      'inv-today': 'due_today',
      'inv-partial': 'upcoming',
      'inv-future-b': 'upcoming',
      'inv-future-a': 'upcoming',
      'inv-undated': null,
    });
    const lateEvening = invoiceProjection([outstanding[2]], {
      today: new Date(2026, 9, 20, 23, 59),
      read: 'complete',
    });
    expect(lateEvening.payable[0].dueState).toBe('due_today');
    const nextMorning = invoiceProjection([outstanding[2]], {
      today: new Date(2026, 9, 21, 0, 1),
      read: 'complete',
    });
    expect(nextMorning.payable[0].dueState).toBe('past_due');
  });

  it('keeps history newest paid first, marked paid on paid evidence only', () => {
    expect(ids(projection.history)).toEqual(['inv-paid-new', 'inv-paid-old']);
    expect(projection.history.map((row) => row.settled)).toEqual(['paid', 'paid']);
    expect(projection.history.every((row) => row.dueState === null)).toBe(true);
  });

  it('breaks a full tie on invoice id, and an unreadable due date sorts with the undated', () => {
    const tie = complete([
      makeInvoice({ id: 'inv-b', due_date: '2026-11-01', issue_date: null, sent_at: null, created_at: '2026-10-01T00:00:00Z' }),
      makeInvoice({ id: 'inv-a', due_date: '2026-11-01', issue_date: null, sent_at: null, created_at: '2026-10-01T00:00:00Z' }),
      makeInvoice({ id: 'inv-garbled', due_date: 'not a date' }),
    ]);
    expect(ids(tie.payable)).toEqual(['inv-a', 'inv-b', 'inv-garbled']);
    expect(tie.payable[2].dueDate).toBeNull();
  });

  it('falls back from issue date to sent, then created, for the due-date tie', () => {
    const tie = complete([
      makeInvoice({ id: 'inv-created', issue_date: null, sent_at: null, created_at: '2026-09-02T00:00:00Z' }),
      makeInvoice({ id: 'inv-sent', issue_date: null, sent_at: '2026-09-03T00:00:00Z' }),
      makeInvoice({ id: 'inv-issued', issue_date: '2026-09-01' }),
    ]);
    expect(ids(tie.payable)).toEqual(['inv-issued', 'inv-created', 'inv-sent']);
  });
});

// ── A02 — invisible and zero-balance rows ───────────────────────────────────

describe('invoiceProjection — A02 drafts, voids and a zero balance', () => {
  const projection = complete([
    makeInvoice({ id: 'inv-draft', status: 'draft', total_cents: 900000 }),
    makeInvoice({ id: 'inv-void', status: 'void', total_cents: 900000 }),
    makeInvoice({ id: 'inv-zero', status: 'sent', total_cents: 0 }),
    makeInvoice({ id: 'inv-open', total_cents: 12000 }),
  ]);

  it('never shows a draft or a void', () => {
    const every = [...projection.review, ...projection.processing, ...projection.payable, ...projection.history];
    expect(ids(every)).not.toContain('inv-draft');
    expect(ids(every)).not.toContain('inv-void');
  });

  it('keeps a zero-balance sent row findable in history as no balance due, never paid, never payable', () => {
    expect(ids(projection.payable)).toEqual(['inv-open']);
    expect(projection.counts?.payable).toBe(1);
    expect(ids(projection.history)).toEqual(['inv-zero']);
    expect(projection.history[0].settled).toBe('no_balance_due');
    expect(projection.outstandingTotals).toEqual([{ currency: 'USD', cents: 12000, invoiceCount: 1 }]);
  });
});

// ── A03 — duplicates and adopted ownership ──────────────────────────────────

describe('A03 — each invoice once, studio invoices only in the adopted house', () => {
  const own = makeInvoice({ id: 'inv-own', project_id: 'proj-b', total_cents: 10000 });
  const studio = makeInvoice({ id: 'inv-studio', project_id: null, total_cents: 4000 });
  const otherHouse = makeInvoice({ id: 'inv-other', project_id: 'proj-a', total_cents: 9000 });
  const studioDraft = makeInvoice({ id: 'inv-studio-draft', project_id: null, status: 'draft' });

  it('counts and totals a duplicated id once', () => {
    const projection = complete([own, own, { ...own }]);
    expect(projection.counts?.payable).toBe(1);
    expect(projection.outstandingTotals).toEqual([{ currency: 'USD', cents: 10000, invoiceCount: 1 }]);
  });

  it('adopts by lowest project id, not by which house was active most recently', () => {
    // proj-b is the most recently active; proj-a still adopts.
    expect(adoptedHouseId(['proj-b', 'proj-a'])).toBe('proj-a');
    expect(standsUnfiled('proj-b', ['proj-a'])).toBe(false);
    expect(standsUnfiled('proj-a', ['proj-b'])).toBe(true);
  });

  it('a house that does not adopt holds only its own invoices, and ignores the client read', () => {
    const house = houseInvoices({
      projectId: 'proj-b',
      adopted: false,
      project: project({ data: [own, otherHouse] }),
      client: project({ data: undefined, isError: true }),
    });
    expect(house.invoices.map((invoice) => invoice.id)).toEqual(['inv-own']);
    expect(house.read).toBe('complete');
  });

  it('the adopted house adds visible studio invoices once, after its own', () => {
    const house = houseInvoices({
      projectId: 'proj-a',
      adopted: true,
      project: project({ data: [otherHouse] }),
      client: project({ data: [studio, studio, studioDraft, own, otherHouse] }),
    });
    expect(house.invoices.map((invoice) => invoice.id)).toEqual(['inv-other', 'inv-studio']);
    expect(house.read).toBe('complete');
  });

  it('the studio-only door holds the visible studio invoices', () => {
    const house = houseInvoices({
      projectId: null,
      client: project({ data: [own, studio, studioDraft] }),
    });
    expect(house.invoices.map((invoice) => invoice.id)).toEqual(['inv-studio']);
  });

  it('a required read that was never handed in is still loading', () => {
    expect(houseInvoices({ projectId: 'proj-a', adopted: true, project: project() }).read).toBe(
      'loading',
    );
    expect(houseInvoices({ projectId: null }).read).toBe('loading');
  });
});

// ── A04 — currencies ────────────────────────────────────────────────────────

describe('invoiceProjection — A04 currencies stay apart', () => {
  it('totals each currency separately, never a mixed sum', () => {
    const projection = complete([
      makeInvoice({ id: 'inv-usd', currency: 'USD', total_cents: 10000 }),
      makeInvoice({ id: 'inv-eur', currency: 'eur', total_cents: 20000 }),
      makeInvoice({ id: 'inv-eur-2', currency: 'EUR', total_cents: 5000 }),
    ]);
    expect(projection.outstandingTotals).toEqual([
      { currency: 'EUR', cents: 25000, invoiceCount: 2 },
      { currency: 'USD', cents: 10000, invoiceCount: 1 },
    ]);
    expect(Object.fromEntries(projection.payable.map((row) => [row.invoice.id, row.currency]))).toEqual({
      'inv-usd': 'USD',
      'inv-eur': 'EUR',
      'inv-eur-2': 'EUR',
    });
  });

  it('reads a missing currency the way the server does (USD)', () => {
    const projection = complete([makeInvoice({ id: 'inv-x', currency: '' })]);
    expect(projection.payable[0].currency).toBe('USD');
  });
});

// ── A05 — payment evidence and precedence ───────────────────────────────────

describe('invoiceProjection — A05 one group per invoice, by evidence', () => {
  const pendingClaim = payment({ id: 'pay-claim', status: 'pending', stripe_payment_intent_id: null });
  const pendingIntent = payment({ id: 'pay-intent', status: 'pending', stripe_payment_intent_id: 'pi_test_1' });
  const refund = payment({ id: 'pay-refund', status: 'requires_refund', stripe_payment_intent_id: 'pi_test_2' });

  const rows = {
    claimOnly: makeInvoice({ id: 'inv-claim', total_cents: 10000, payments: [pendingClaim] }),
    inFlight: makeInvoice({ id: 'inv-flight', total_cents: 20000, payments: [pendingIntent] }),
    held: makeInvoice({ id: 'inv-held', total_cents: 30000, payments: [refund] }),
    heldAndFlying: makeInvoice({ id: 'inv-both', total_cents: 40000, payments: [pendingIntent, refund] }),
    heldZero: makeInvoice({
      id: 'inv-held-zero',
      status: 'paid',
      total_cents: 5000,
      amount_paid_cents: 5000,
      payments: [refund],
    }),
    paidFlying: makeInvoice({
      id: 'inv-paid-flying',
      status: 'paid',
      total_cents: 5000,
      amount_paid_cents: 5000,
      payments: [pendingIntent],
    }),
  };
  const projection = complete(Object.values(rows));

  it('a pending payment without a PaymentIntent is payable, not processing', () => {
    expect(ids(projection.payable)).toEqual(['inv-claim']);
    expect(projection.payable[0].paymentInFlight).toBe(false);
  });

  it('a pending payment with a PaymentIntent is processing, and offers no payment', () => {
    expect(ids(projection.processing)).toEqual(['inv-flight', 'inv-paid-flying']);
    expect(projection.processing.every((row) => row.paymentInFlight)).toBe(true);
  });

  it('requires_refund is review, and outranks a simultaneous PaymentIntent and a zero balance', () => {
    expect(ids(projection.review)).toEqual(['inv-both', 'inv-held', 'inv-held-zero']);
    const both = projection.review.find((row) => row.invoice.id === 'inv-both');
    expect(both?.reviewReasons).toEqual(['requires_refund']);
    expect(both?.paymentInFlight).toBe(true);
    expect(projection.review.every((row) => row.settled === null)).toBe(true);
  });

  it('places every id in exactly one group and counts it once', () => {
    const every = [...projection.review, ...projection.processing, ...projection.payable, ...projection.history];
    expect(ids(every).sort()).toEqual(Object.values(rows).map((row) => row.id).sort());
    expect(projection.counts).toEqual({ review: 3, processing: 2, payable: 1, history: 0 });
  });

  it('totals the outstanding balances of payable, processing and held rows once each', () => {
    expect(projection.outstandingTotals).toEqual([
      { currency: 'USD', cents: 10000 + 20000 + 30000 + 40000, invoiceCount: 4 },
    ]);
  });

  it('takes a hold the checkout boundary returned, by invoice id', () => {
    const held = invoiceProjection([rows.claimOnly, makeInvoice({ id: 'inv-busy', total_cents: 100 })], {
      today: TODAY,
      read: 'complete',
      serverHolds: {
        'inv-claim': 'payment_reconciliation_required',
        'inv-busy': 'payment_processing',
      },
    });
    expect(ids(held.review)).toEqual(['inv-claim']);
    expect(held.review[0].reviewReasons).toEqual(['reconciliation_hold']);
    expect(ids(held.processing)).toEqual(['inv-busy']);
    expect(held.payable).toEqual([]);
  });

  describe('R8 — a processing hold yields to proven settlement, never to an inconclusive read', () => {
    const hold = { 'inv-settled': 'payment_processing' } as const;
    const settledRow = (overrides: Partial<Invoice> = {}) =>
      makeInvoice({
        id: 'inv-settled',
        status: 'paid',
        total_cents: 20000,
        amount_paid_cents: 20000,
        paid_at: '2026-10-20T08:00:00Z',
        payments: [payment({ id: 'pay-done', status: 'succeeded', stripe_payment_intent_id: 'pi_done' })],
        ...overrides,
      });
    const projectWith = (invoice: Invoice, read: InvoiceReadState) =>
      invoiceProjection([invoice], { today: TODAY, read, serverHolds: hold });

    it('a hold plus a complete paid read is history with a receipt, not processing', () => {
      const settled = projectWith(settledRow(), 'complete');
      expect(settled.processing).toEqual([]);
      expect(ids(settled.history)).toEqual(['inv-settled']);
      expect(settled.history[0].settled).toBe('paid');
      expect(settled.history[0].paymentInFlight).toBe(false);
      expect(settled.allClear).toBe(true);
    });

    it('yields to no balance and no pending payment, even before the status says paid', () => {
      const settled = projectWith(settledRow({ status: 'sent' }), 'complete');
      expect(ids(settled.history)).toEqual(['inv-settled']);
      expect(settled.history[0].settled).toBe('no_balance_due');
    });

    it('stands while the read is inconclusive, a balance remains, or a payment is still pending', () => {
      for (const read of ['stale', 'partial', 'failed', 'loading'] as const) {
        expect(ids(projectWith(settledRow(), read).processing)).toEqual(['inv-settled']);
      }
      expect(ids(projectWith(settledRow({ amount_paid_cents: 5000 }), 'complete').review)).toEqual(['inv-settled']);
      expect(ids(projectWith(settledRow({ status: 'sent', amount_paid_cents: 5000 }), 'complete').processing)).toEqual([
        'inv-settled',
      ]);
      expect(ids(projectWith(settledRow({ status: 'sent', payments: [payment()] }), 'complete').processing)).toEqual([
        'inv-settled',
      ]);
      expect(ids(projectWith(settledRow({ status: 'sent', payments: undefined }), 'complete').processing)).toEqual([
        'inv-settled',
      ]);
    });

    it('never releases a reconciliation hold on settlement', () => {
      const held = invoiceProjection([settledRow()], {
        today: TODAY,
        read: 'complete',
        serverHolds: { 'inv-settled': 'payment_reconciliation_required' },
      });
      expect(ids(held.review)).toEqual(['inv-settled']);
      expect(held.review[0].reviewReasons).toEqual(['reconciliation_hold']);
      const kept = { 'inv-settled': 'payment_reconciliation_required' } as const;
      expect(retireSettledHolds(kept, held)).toBe(kept);
    });

    it('R8a — hold, then paid, then a full refund in the same visit: the reopened invoice is payable', () => {
      let holds: Record<string, InvoiceServerHold> = { ...hold };
      const read = (invoice: Invoice, state: InvoiceReadState = 'complete') => {
        const projection = invoiceProjection([invoice], { today: TODAY, read: state, serverHolds: holds });
        holds = retireSettledHolds(holds, projection);
        return projection;
      };
      const open = settledRow({ status: 'sent', amount_paid_cents: 0, paid_at: null, payments: [] });
      const refunded = settledRow({
        status: 'sent',
        amount_paid_cents: 0,
        paid_at: null,
        payments: [payment({ id: 'pay-done', status: 'refunded', stripe_payment_intent_id: 'pi_done' })],
      });

      // 1. Checkout answered payment_processing; the open read and every inconclusive one keep the hold.
      expect(ids(read(open).processing)).toEqual(['inv-settled']);
      for (const state of ['stale', 'partial', 'failed', 'loading'] as const) {
        expect(ids(read(settledRow(), state).processing)).toEqual(['inv-settled']);
      }
      expect(holds).toEqual(hold);

      // 2. A complete paid read proves it settled: receipt shown, hold retired.
      const paid = read(settledRow());
      expect(ids(paid.history)).toEqual(['inv-settled']);
      expect(paid.history[0].settled).toBe('paid');
      expect(holds).toEqual({});

      // 3–4. A full refund reopens it: judged on its own read, it is payable again.
      const reopened = read(refunded);
      expect(reopened.processing).toEqual([]);
      expect(ids(reopened.payable)).toEqual(['inv-settled']);
      expect(reopened.payable[0].paymentInFlight).toBe(false);
      expect(reopened.counts).toEqual({ review: 0, processing: 0, payable: 1, history: 0 });

      // The retained hold is what had kept it unpayable.
      const unretired = invoiceProjection([refunded], { today: TODAY, read: 'complete', serverHolds: hold });
      expect(unretired.payable).toEqual([]);
    });

    it('a pending PaymentIntent still outranks a retired hold on the reopened read', () => {
      const paid = invoiceProjection([settledRow()], { today: TODAY, read: 'complete', serverHolds: hold });
      const holds = retireSettledHolds({ ...hold }, paid);
      expect(holds).toEqual({});
      const inFlight = invoiceProjection(
        [
          settledRow({
            status: 'sent',
            amount_paid_cents: 0,
            payments: [payment({ id: 'pay-next', stripe_payment_intent_id: 'pi_next' })],
          }),
        ],
        { today: TODAY, read: 'complete', serverHolds: holds },
      );
      expect(ids(inFlight.processing)).toEqual(['inv-settled']);
      expect(inFlight.payable).toEqual([]);
    });
  });

  it('holds contradictory evidence for review and withholds the total, keeping the counts', () => {
    const contradictory = complete([
      makeInvoice({ id: 'inv-paid-owing', status: 'paid', total_cents: 9000, amount_paid_cents: 1000 }),
      makeInvoice({ id: 'inv-odd', status: 'disputed' as Invoice['status'], total_cents: 9000 }),
      makeInvoice({ id: 'inv-fine', total_cents: 9000 }),
    ]);
    expect(ids(contradictory.review)).toEqual(['inv-odd', 'inv-paid-owing']);
    expect(contradictory.review.map((row) => row.reviewReasons)).toEqual([
      ['unknown_status'],
      ['paid_with_balance'],
    ]);
    expect(contradictory.review.every((row) => row.contradictory)).toBe(true);
    expect(contradictory.withheld).toBe('contradictory');
    expect(contradictory.outstandingTotals).toBeNull();
    expect(contradictory.counts).toEqual({ review: 2, processing: 0, payable: 1, history: 0 });
  });

  it('a row read without its payments is unverified, not "nothing in flight": no counts, balance still owed', () => {
    const unread = complete([makeInvoice({ id: 'inv-bare', payments: undefined })]);
    expect(unread.payable[0].paymentsRead).toBe(false);
    expect(unread.withheld).toBe('unverified');
    expect(unread.counts).toBeNull();
    expect(unread.nothingToPay).toBe(false);
    expect(unread.allClear).toBe(false);
    // Payable or in progress, the balance is outstanding either way.
    expect(unread.outstandingTotals).toEqual([{ currency: 'USD', cents: 100000, invoiceCount: 1 }]);
  });

  it('an unread history row still withholds the all-clear', () => {
    const unread = complete([
      makeInvoice({ id: 'inv-paid', status: 'paid', amount_paid_cents: 100000, payments: undefined }),
    ]);
    expect(unread.history.map((row) => row.invoice.id)).toEqual(['inv-paid']);
    expect(unread.allClear).toBe(false);
  });
});

// ── A06 — read states ───────────────────────────────────────────────────────

describe('invoiceReadState — A06', () => {
  const ok = project({ data: [] });
  const pending = project({ data: undefined, isPending: true });
  const failed = project({ data: undefined, isError: true });
  const staleRefresh = project({ data: [makeInvoice()], isError: true });

  it('names each read condition', () => {
    expect(invoiceReadState([pending, ok])).toBe('loading');
    expect(invoiceReadState([failed, pending])).toBe('loading');
    expect(invoiceReadState([failed])).toBe('failed');
    expect(invoiceReadState([failed, failed])).toBe('failed');
    expect(invoiceReadState([failed, ok])).toBe('partial');
    expect(invoiceReadState([failed, staleRefresh])).toBe('partial');
    expect(invoiceReadState([staleRefresh, ok])).toBe('stale');
    expect(invoiceReadState([ok, ok])).toBe('complete');
  });

  it('treats a read with no data and no error as not yet returned', () => {
    expect(invoiceReadState([project({ data: undefined })])).toBe('loading');
  });
});

describe('invoiceProjection — A06 no false all-clear', () => {
  const open = makeInvoice({ id: 'inv-open', total_cents: 5000 });

  it('says nothing to pay and all clear only after a complete, empty read', () => {
    const empty = complete([]);
    expect(empty.counts).toEqual({ review: 0, processing: 0, payable: 0, history: 0 });
    expect(empty.outstandingTotals).toEqual([]);
    expect(empty.nothingToPay).toBe(true);
    expect(empty.allClear).toBe(true);
  });

  it('while loading, withholds every figure and every all-clear', () => {
    const loading = invoiceProjection([], { today: TODAY, read: 'loading' });
    expect(loading.withheld).toBe('loading');
    expect(loading.counts).toBeNull();
    expect(loading.outstandingTotals).toBeNull();
    expect(loading.nothingToPay).toBe(false);
    expect(loading.allClear).toBe(false);
  });

  it.each(['failed', 'partial', 'stale'] as const)(
    'a %s read keeps the rows it has and withholds counts, totals and all-clear',
    (read) => {
      const projection = invoiceProjection([open], { today: TODAY, read });
      expect(projection.read).toBe(read);
      expect(ids(projection.payable)).toEqual(['inv-open']);
      expect(projection.withheld).toBe('incomplete');
      expect(projection.counts).toBeNull();
      expect(projection.outstandingTotals).toBeNull();
      expect(projection.nothingToPay).toBe(false);
      expect(projection.allClear).toBe(false);
    },
  );

  it('with only a payment in progress: nothing to pay, but not all clear', () => {
    const projection = complete([
      makeInvoice({
        id: 'inv-flight',
        payments: [payment({ status: 'pending', stripe_payment_intent_id: 'pi_test_3' })],
      }),
    ]);
    expect(projection.nothingToPay).toBe(true);
    expect(projection.allClear).toBe(false);
  });

  it('a house whose adopted studio read failed keeps its own rows, labelled partial', () => {
    const house = houseInvoices({
      projectId: 'proj-a',
      adopted: true,
      project: project({ data: [makeInvoice({ id: 'inv-own', project_id: 'proj-a' })] }),
      client: project({ data: undefined, isError: true }),
    });
    expect(house.read).toBe('partial');
    const projection = invoiceProjection(house.invoices, { today: TODAY, read: house.read });
    expect(ids(projection.payable)).toEqual(['inv-own']);
    expect(projection.counts).toBeNull();
    expect(projection.allClear).toBe(false);
  });
});
