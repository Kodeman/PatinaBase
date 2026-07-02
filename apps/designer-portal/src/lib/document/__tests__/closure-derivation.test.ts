/**
 * Closure derivation contract (Track 7 · R80) — the pure logic behind the
 * Care band's "Close the book": checklist vocabulary + gate, money parsing,
 * duration reading, snapshot seeding.
 */

import {
  CLOSURE_ITEM_DEFS,
  allClosureComplete,
  centsToDollarString,
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
