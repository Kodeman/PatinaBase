/**
 * Contract tests for the invoice composer's line assembly (R74b) — the four
 * typed line kinds (00178/00187), their ordering, the single rolled-up time
 * line, the FF&E coverage partition, and milestone billability gating.
 */

import {
  buildComposerLines,
  dollarsToCents,
  partitionFfeBillable,
  unbilledMilestones,
  type ComposerFfeItem,
  type ComposerMilestone,
} from '../invoice-composer';

const MILESTONE: ComposerMilestone = {
  id: 'm1',
  label: 'Design retainer',
  amount_cents: 250_000,
  status: 'pending',
};

const FFE_SOFA: ComposerFfeItem = {
  id: 'f1',
  name: 'Bespoke sofa',
  quantity: 2,
  unit_price_cents: 120_000,
  room: { name: 'Living room' },
};

const FFE_NO_ROOM: ComposerFfeItem = {
  id: 'f2',
  name: 'Brass sconce',
  quantity: null,
  unit_price_cents: 40_000,
  room: null,
};

describe('buildComposerLines', () => {
  it('assembles all four kinds in milestone → ffe → time → adhoc order', () => {
    const lines = buildComposerLines({
      milestones: [MILESTONE],
      ffeItems: [FFE_SOFA],
      timeEntries: [
        { id: 't1', duration_minutes: 90, amount_cents: 18_750 },
        { id: 't2', duration_minutes: 30, amount_cents: 6_250 },
      ],
      adhoc: [{ description: 'Site visit', quantity: '2', unitDollars: '150' }],
    });

    expect(lines.map((l) => l.kind)).toEqual(['milestone', 'ffe', 'time', 'adhoc']);
    expect(lines.map((l) => l.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it('milestone lines: qty 1, unit = milestone amount, milestoneId carried', () => {
    const [line] = buildComposerLines({
      milestones: [MILESTONE],
      ffeItems: [],
      timeEntries: [],
      adhoc: [],
    });
    expect(line).toMatchObject({
      kind: 'milestone',
      milestoneId: 'm1',
      description: 'Design retainer',
      quantity: 1,
      unitAmountCents: 250_000,
    });
  });

  it('ffe lines: ffeItemId carried (00187), room suffixed, qty × unit intact', () => {
    const lines = buildComposerLines({
      milestones: [],
      ffeItems: [FFE_SOFA, FFE_NO_ROOM],
      timeEntries: [],
      adhoc: [],
    });
    expect(lines[0]).toMatchObject({
      kind: 'ffe',
      ffeItemId: 'f1',
      description: 'Bespoke sofa — Living room',
      quantity: 2,
      unitAmountCents: 120_000,
    });
    // No room → plain name; null quantity defaults to 1.
    expect(lines[1]).toMatchObject({
      kind: 'ffe',
      ffeItemId: 'f2',
      description: 'Brass sconce',
      quantity: 1,
      unitAmountCents: 40_000,
    });
  });

  it('time entries roll into ONE line: qty 1, unit = Σ amounts, provenance in metadata', () => {
    const lines = buildComposerLines({
      milestones: [],
      ffeItems: [],
      timeEntries: [
        { id: 't1', duration_minutes: 90, amount_cents: 18_750 },
        { id: 't2', duration_minutes: 30, amount_cents: 6_250 },
      ],
      adhoc: [],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: 'time',
      quantity: 1,
      unitAmountCents: 25_000,
      metadata: { time_entry_ids: ['t1', 't2'], total_minutes: 120 },
    });
    expect(lines[0].description).toContain('2h');
    expect(lines[0].description).toContain('2 entries');
  });

  it('no time entries → no time line at all', () => {
    const lines = buildComposerLines({
      milestones: [MILESTONE],
      ffeItems: [],
      timeEntries: [],
      adhoc: [],
    });
    expect(lines.some((l) => l.kind === 'time')).toBe(false);
  });

  it('adhoc rows: blank descriptions and zero amounts are dropped; bad qty → 1', () => {
    const lines = buildComposerLines({
      milestones: [],
      ffeItems: [],
      timeEntries: [],
      adhoc: [
        { description: '  ', quantity: '1', unitDollars: '100' }, // blank → dropped
        { description: 'Freight', quantity: '1', unitDollars: '0' }, // zero → dropped
        { description: 'Consultation', quantity: '-2', unitDollars: '150.50' },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: 'adhoc',
      description: 'Consultation',
      quantity: 1, // non-positive qty falls back to 1
      unitAmountCents: 15_050,
    });
  });
});

describe('partitionFfeBillable', () => {
  it('splits billable / covered / unpriced by 00187 coverage', () => {
    const unpriced: ComposerFfeItem = { ...FFE_NO_ROOM, id: 'f3', unit_price_cents: null };
    const { billable, covered, unpriced: noPrice } = partitionFfeBillable(
      [FFE_SOFA, FFE_NO_ROOM, unpriced],
      {
        f2: { coverage: 'invoiced' },
        // f1 missing from the map = not covered → treated uninvoiced
      },
    );
    expect(billable.map((i) => i.id)).toEqual(['f1']);
    expect(covered.map((i) => i.id)).toEqual(['f2']);
    expect(noPrice.map((i) => i.id)).toEqual(['f3']);
  });

  it('paid coverage also counts as covered', () => {
    const { covered } = partitionFfeBillable([FFE_SOFA], { f1: { coverage: 'paid' } });
    expect(covered.map((i) => i.id)).toEqual(['f1']);
  });
});

describe('unbilledMilestones', () => {
  const paid: ComposerMilestone = { ...MILESTONE, id: 'm2', status: 'paid' };
  const outstanding: ComposerMilestone = { ...MILESTONE, id: 'm3', status: 'outstanding' };

  it('offers pending/outstanding milestones not on a live invoice', () => {
    const result = unbilledMilestones([MILESTONE, paid, outstanding], [
      { status: 'sent', line_items: [{ milestone_id: 'm3' }] },
    ]);
    expect(result.map((m) => m.id)).toEqual(['m1']);
  });

  it('a VOID invoice releases its milestone slot', () => {
    const result = unbilledMilestones([outstanding], [
      { status: 'void', line_items: [{ milestone_id: 'm3' }] },
    ]);
    expect(result.map((m) => m.id)).toEqual(['m3']);
  });
});

describe('dollarsToCents', () => {
  it('parses currency-ish strings and rounds to whole cents', () => {
    expect(dollarsToCents('1,234.56')).toBe(123_456);
    expect(dollarsToCents('$150')).toBe(15_000);
    expect(dollarsToCents('')).toBe(0);
    expect(dollarsToCents('abc')).toBe(0);
  });
});
