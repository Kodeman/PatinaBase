/**
 * Closure derivation contract (Track 7 · R80) — the pure logic behind the
 * Care band's "Close the book": checklist vocabulary + gate, money parsing,
 * duration reading, snapshot seeding.
 */

import {
  CLOSURE_ITEM_DEFS,
  allClosureComplete,
  closureReady,
  centsToDollarString,
  deriveCloseoutReadiness,
  defaultClosureItems,
  dollarsToCents,
  durationLabel,
  seedSnapshot,
  toggleClosureItem,
} from '../closure-derivation';

describe('closure checklist', () => {
  it('ships the legacy vocabulary with stable keys, all unchecked', () => {
    const items = defaultClosureItems();
    expect(items.map((i) => i.key)).toEqual([
      'walkthrough',
      'punch_list',
      'payment',
      'photography',
      'photos',
      'case_study',
      'review',
    ]);
    expect(items.every((i) => i.completed === false)).toBe(true);
    // The defs are the source of truth; defaults mirror them 1:1.
    expect(items).toHaveLength(CLOSURE_ITEM_DEFS.length);
  });

  it('toggles one item immutably', () => {
    const items = defaultClosureItems();
    const next = toggleClosureItem(items, 'payment');
    expect(next.find((i) => i.key === 'payment')?.completed).toBe(true);
    expect(items.find((i) => i.key === 'payment')?.completed).toBe(false);
    // toggling back un-checks
    expect(toggleClosureItem(next, 'payment').find((i) => i.key === 'payment')?.completed).toBe(
      false,
    );
  });

  it('gates Close the book on every line ticked', () => {
    let items = defaultClosureItems();
    expect(allClosureComplete(items)).toBe(false);
    for (const def of CLOSURE_ITEM_DEFS) items = toggleClosureItem(items, def.key);
    expect(allClosureComplete(items)).toBe(true);
    // an empty checklist never claims completeness
    expect(allClosureComplete([])).toBe(false);
  });

  it('cannot claim completion while operational FF&E or billing truth is unsettled', () => {
    const checklist = defaultClosureItems().map((item) => ({
      ...item,
      completed: true,
    }));
    const operational = deriveCloseoutReadiness({
      ffeItems: [{ id: 'chair-1', status: 'specified' }],
      ffeCoverage: {
        'chair-1': { coverage: 'uninvoiced' },
      },
      paymentMilestones: [],
      invoices: [],
    });

    expect(operational.ready).toBe(false);
    expect(operational.blockers.map((blocker) => blocker.code)).toEqual([
      'ffe_not_installed',
      'ffe_not_paid',
    ]);
    expect(closureReady(checklist, operational)).toBe(false);
  });

  it('allows a zero-item project to close when no payable balance remains', () => {
    const operational = deriveCloseoutReadiness({
      ffeItems: [],
      ffeCoverage: {},
      paymentMilestones: [],
      invoices: [],
    });

    expect(operational).toEqual({ ready: true, blockers: [] });
  });

  it('fails closed until every operational read has settled successfully', () => {
    const operational = deriveCloseoutReadiness({
      dataReady: false,
      ffeItems: [],
      ffeCoverage: {},
      paymentMilestones: [],
      invoices: [],
    });

    expect(operational.ready).toBe(false);
    expect(operational.blockers[0]?.code).toBe(
      'operational_data_unavailable',
    );
  });

  it('does not treat an empty invoice set as settled when the project has a contract value', () => {
    const operational = deriveCloseoutReadiness({
      projectTotalCents: 320_000,
      ffeItems: [],
      ffeCoverage: {},
      paymentMilestones: [],
      invoices: [],
    });

    expect(operational.ready).toBe(false);
    expect(operational.blockers.map((blocker) => blocker.code)).toEqual([
      'project_balance_due',
    ]);
  });

  it('requires collected truth, not merely an issued invoice', () => {
    const operational = deriveCloseoutReadiness({
      ffeItems: [{ id: 'chair-1', status: 'installed' }],
      ffeCoverage: {
        'chair-1': { coverage: 'invoiced' },
      },
      paymentMilestones: [
        { id: 'milestone-1', status: 'outstanding', amount_cents: 320_000 },
      ],
      invoices: [
        {
          id: 'invoice-1',
          status: 'partially_paid',
          total_cents: 320_000,
          amount_paid_cents: 100_000,
        },
      ],
    });

    expect(operational.ready).toBe(false);
    expect(operational.blockers.map((blocker) => blocker.code)).toEqual([
      'ffe_not_paid',
      'milestone_unpaid',
      'invoice_balance_due',
    ]);
  });

  it('accepts installed, fully paid operational work', () => {
    const operational = deriveCloseoutReadiness({
      projectTotalCents: 320_000,
      ffeItems: [{ id: 'chair-1', status: 'installed' }],
      ffeCoverage: {
        'chair-1': { coverage: 'paid' },
      },
      paymentMilestones: [
        { id: 'milestone-1', status: 'paid', amount_cents: 320_000 },
      ],
      invoices: [
        {
          id: 'invoice-1',
          status: 'paid',
          total_cents: 320_000,
          amount_paid_cents: 320_000,
        },
      ],
    });

    expect(operational).toEqual({ ready: true, blockers: [] });
  });
});

describe('money parsing (shared by the open sheet, vitals, snapshot)', () => {
  it('parses dollars to cents, tolerating formatting', () => {
    expect(dollarsToCents('1500')).toBe(150000);
    expect(dollarsToCents('$1,500.50')).toBe(150050);
    expect(dollarsToCents('  42 ')).toBe(4200);
  });

  it('returns null for empty or junk input', () => {
    expect(dollarsToCents('')).toBeNull();
    expect(dollarsToCents('   ')).toBeNull();
    expect(dollarsToCents('abc')).toBeNull();
  });

  it('round-trips through centsToDollarString', () => {
    expect(centsToDollarString(150000)).toBe('1500');
    expect(centsToDollarString(150050)).toBe('1500.50');
    expect(centsToDollarString(null)).toBe('');
    expect(dollarsToCents(centsToDollarString(987654))).toBe(987654);
  });
});

describe('durationLabel', () => {
  it('reads weeks under two months, months after', () => {
    expect(durationLabel('2026-01-01', '2026-01-15')).toBe('2 weeks');
    expect(durationLabel('2026-01-01', '2026-01-08')).toBe('1 week');
    expect(durationLabel('2026-01-01', '2026-06-01')).toBe('5 months');
  });

  it('never claims what the dates cannot', () => {
    expect(durationLabel(null)).toBe('');
    expect(durationLabel('not-a-date', '2026-06-01')).toBe('');
    expect(durationLabel('2026-06-01', '2026-01-01')).toBe(''); // reversed
  });
});

describe('seedSnapshot', () => {
  it('seeds value from the contract total, falling back per post-00139 convention', () => {
    expect(seedSnapshot({ total_amount_cents: 4200000, budget_cents: 100 }).value_cents).toBe(
      4200000,
    );
    expect(seedSnapshot({ total_amount_cents: null, budget_cents: 990000 }).value_cents).toBe(
      990000,
    );
    expect(seedSnapshot({}).value_cents).toBeNull();
  });

  it('seeds duration from the real dates and leaves the words to the designer', () => {
    const snap = seedSnapshot({
      start_date: '2026-01-01',
      completed_at: '2026-06-01T12:00:00Z',
      total_amount_cents: 1,
    });
    expect(snap.duration).toBe('5 months');
    expect(snap.headline).toBe('');
    expect(snap.description).toBe('');
    expect(snap.rooms).toBe('');
  });
});
