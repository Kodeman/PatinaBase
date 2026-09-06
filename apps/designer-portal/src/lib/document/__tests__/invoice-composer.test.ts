/**
 * Contract tests for the invoice composer's line assembly (R74b) — the four
 * typed line kinds (00178/00187), their ordering, the single rolled-up time
 * line, the FF&E coverage partition, and milestone billability gating.
 */

import {
  STUDIO_TARGET,
  activeDesignStudios,
  buildComposerLines,
  canDraftStudioInvoice,
  dollarsToCents,
  partitionFfeBillable,
  unbilledMilestones,
  type ComposerFfeItem,
  type ComposerMilestone,
  type ComposerStudio,
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

// ── The studio invoice — an invoice with no house (R136) ────────────────────

describe('canDraftStudioInvoice', () => {
  const LINE = {
    kind: 'adhoc' as const,
    description: 'Design consultation, on site (2 h)',
    quantity: 1,
    unitAmountCents: 45_000,
    sortOrder: 0,
  };
  const ready = {
    clientId: 'client-1',
    title: 'Design consultation · 12 Sept 2026',
    studioId: 'studio-1',
    lines: [LINE],
  };

  it('draws when a household, a regarding line, a studio and a line are all present', () => {
    expect(canDraftStudioInvoice(ready)).toBe(true);
  });

  it('refuses without a household (S4)', () => {
    expect(canDraftStudioInvoice({ ...ready, clientId: null })).toBe(false);
  });

  it('refuses a blank or whitespace-only regarding line (S12)', () => {
    expect(canDraftStudioInvoice({ ...ready, title: '' })).toBe(false);
    expect(canDraftStudioInvoice({ ...ready, title: '   ' })).toBe(false);
  });

  it('refuses without a studio to number off (S8)', () => {
    expect(canDraftStudioInvoice({ ...ready, studioId: null })).toBe(false);
    expect(canDraftStudioInvoice({ ...ready, studioId: '' })).toBe(false);
  });

  it('refuses with no line that carries money', () => {
    expect(canDraftStudioInvoice({ ...ready, lines: [] })).toBe(false);
  });
});

describe('studio mode line assembly (S6)', () => {
  it('carries ad-hoc lines only — the composer passes no house-bound selection', () => {
    const lines = buildComposerLines({
      milestones: [],
      ffeItems: [],
      timeEntries: [],
      adhoc: [
        { description: 'Design consultation, on site (2 h)', quantity: '1', unitDollars: '450' },
        { description: '', quantity: '1', unitDollars: '' },
      ],
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: 'adhoc',
      description: 'Design consultation, on site (2 h)',
      quantity: 1,
      unitAmountCents: 45_000,
      sortOrder: 0,
    });
  });
});

describe('activeDesignStudios', () => {
  const studio = (over: Partial<ComposerStudio>): ComposerStudio => ({
    id: 'studio-1',
    name: 'Middle West Studio',
    type: 'design_studio',
    status: 'active',
    ...over,
  });

  it('keeps only active design studios — a manufacturer is not a studio', () => {
    const result = activeDesignStudios([
      studio({}),
      studio({ id: 'org-2', type: 'manufacturer', name: 'Hedges & Co.' }),
      studio({ id: 'org-3', status: 'deactivated', name: 'A closed studio' }),
    ]);
    expect(result.map((s) => s.id)).toEqual(['studio-1']);
  });

  // 00571 draws only against an ACTIVE, NON-GUEST membership of the named
  // studio. A guest membership offered here is an option whose only answer is
  // `insufficient_privilege`, raised verbatim into the composer's error band.
  it('drops a guest membership, whose draw 00571 refuses', () => {
    const result = activeDesignStudios([
      studio({}),
      studio({
        id: 'studio-guest',
        name: 'Arden & Co.',
        membership: { role: 'guest', status: 'active' },
      }),
    ]);
    expect(result.map((s) => s.id)).toEqual(['studio-1']);
  });

  it('drops a membership that is not active', () => {
    const result = activeDesignStudios([
      studio({}),
      studio({
        id: 'studio-invited',
        name: 'Arden & Co.',
        membership: { role: 'member', status: 'invited' },
      }),
    ]);
    expect(result.map((s) => s.id)).toEqual(['studio-1']);
  });

  it('keeps an active non-guest membership', () => {
    const result = activeDesignStudios([
      studio({ membership: { role: 'owner', status: 'active' } }),
      studio({
        id: 'studio-2',
        name: 'Verona Interiors',
        membership: { role: 'member', status: 'active' },
      }),
    ]);
    expect(result.map((s) => s.id)).toEqual(['studio-1', 'studio-2']);
  });

  it('reports the two-studio case the studio line is gated on (S8)', () => {
    const result = activeDesignStudios([
      studio({}),
      studio({ id: 'studio-2', name: 'Verona Interiors' }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('orders by name, so the silent default never rides on row order', () => {
    const verona = studio({ id: 'studio-2', name: 'Verona Interiors' });
    const middleWest = studio({});
    const arden = studio({ id: 'studio-3', name: 'Arden & Co.' });

    const oneWay = activeDesignStudios([verona, middleWest, arden]);
    const other = activeDesignStudios([middleWest, arden, verona]);

    expect(oneWay.map((s) => s.name)).toEqual([
      'Arden & Co.',
      'Middle West Studio',
      'Verona Interiors',
    ]);
    expect(other.map((s) => s.id)).toEqual(oneWay.map((s) => s.id));
  });

  it('breaks a same-name tie on id, so the first row is still fixed', () => {
    const result = activeDesignStudios([
      studio({ id: 'studio-b' }),
      studio({ id: 'studio-a' }),
    ]);
    expect(result.map((s) => s.id)).toEqual(['studio-a', 'studio-b']);
  });

  it('leaves the caller\u2019s array untouched', () => {
    const input = [
      studio({ id: 'studio-2', name: 'Verona Interiors' }),
      studio({}),
    ];
    activeDesignStudios(input);
    expect(input.map((s) => s.id)).toEqual(['studio-2', 'studio-1']);
  });
});

describe('STUDIO_TARGET', () => {
  it('is not a shape a project id could take', () => {
    expect(STUDIO_TARGET).toBe('__studio__');
  });
});
