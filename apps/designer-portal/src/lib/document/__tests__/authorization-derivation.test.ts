import {
  buildInstrumentIndex,
  checkpointCoverage,
  currentLineCents,
  depositCents,
  deriveLineAuthorization,
  eligibility,
  furnishingsDepositPercent,
  nextInstrumentNumber,
  poGate,
  releaseSummary,
  roomTriState,
  scheduleDrift,
  scheduledContributionCents,
  signableCents,
  type InstrumentLike,
  type ScheduleLineInput,
} from '../authorization-derivation';

const line = (over: Partial<ScheduleLineInput> = {}): ScheduleLineInput => ({
  id: 'line-1',
  item_type: 'fixed',
  quantity: 1,
  unit_price_cents: 420000,
  line_total_cents: 420000,
  status: 'specified',
  blocked: false,
  ...over,
});

const instrument = (over: Partial<InstrumentLike> = {}): InstrumentLike => ({
  number: 2,
  state: 'executed',
  depositPaid: true,
  items: [{ sourceFfeItemId: 'line-1', clientLineTotalCents: 420000 }],
  ...over,
});

describe('buildInstrumentIndex', () => {
  it('maps executed instruments onto the authorized track with the signed price', () => {
    const index = buildInstrumentIndex([instrument()]);
    expect(index.get('line-1')).toEqual({
      track: 'authorized',
      number: 2,
      signedLineTotalCents: 420000,
      depositClear: true,
      deltaCents: null,
    });
  });

  it('reads sent as awaiting and draft as draft', () => {
    const index = buildInstrumentIndex([
      instrument({ number: 3, state: 'sent', items: [{ sourceFfeItemId: 'a' }] }),
      instrument({ number: 4, state: 'draft', items: [{ sourceFfeItemId: 'b' }] }),
    ]);
    expect(index.get('a')).toEqual({ track: 'awaiting', number: 3 });
    expect(index.get('b')).toEqual({ track: 'draft', number: 4 });
  });

  it('ignores declined and superseded instruments — a void releases its lines', () => {
    const index = buildInstrumentIndex([
      instrument({ number: 1, state: 'superseded' }),
      instrument({ number: 2, state: 'declined' }),
    ]);
    expect(index.size).toBe(0);
  });

  it('lets the strongest instrument hold a line that appears in two', () => {
    const index = buildInstrumentIndex([
      instrument({ number: 5, state: 'draft' }),
      instrument({ number: 2, state: 'executed' }),
    ]);
    expect(index.get('line-1')).toMatchObject({ track: 'authorized', number: 2 });
  });

  it('prefers the later number among equals', () => {
    const index = buildInstrumentIndex([
      instrument({ number: 2, state: 'sent' }),
      instrument({ number: 6, state: 'sent' }),
    ]);
    expect(index.get('line-1')).toEqual({ track: 'awaiting', number: 6 });
  });

  it('skips snapshot rows with no schedule line behind them', () => {
    const index = buildInstrumentIndex([
      instrument({ items: [{ sourceFfeItemId: null }, { sourceFfeItemId: '' }] }),
    ]);
    expect(index.size).toBe(0);
  });

  it('survives an empty or missing list', () => {
    expect(buildInstrumentIndex(undefined).size).toBe(0);
    expect(buildInstrumentIndex([]).size).toBe(0);
  });

  it('reads a missing deposit flag as not clear', () => {
    const index = buildInstrumentIndex([instrument({ depositPaid: null })]);
    expect(index.get('line-1')).toMatchObject({ depositClear: false });
  });
});

describe('deriveLineAuthorization', () => {
  it('returns the unreleased track for a line no instrument holds', () => {
    expect(deriveLineAuthorization(line(), new Map())).toEqual({ track: 'none' });
  });

  it('states the drift when the schedule has moved past the signed price', () => {
    const index = buildInstrumentIndex([instrument()]);
    expect(
      deriveLineAuthorization(line({ line_total_cents: 465000 }), index),
    ).toEqual({
      track: 'authorized',
      number: 2,
      signedLineTotalCents: 420000,
      depositClear: true,
      deltaCents: 45000,
    });
  });

  it('leaves the delta null when nothing has moved', () => {
    const index = buildInstrumentIndex([instrument()]);
    expect(deriveLineAuthorization(line(), index)).toMatchObject({
      deltaCents: null,
    });
  });

  it('carries draft and awaiting through untouched', () => {
    const index = buildInstrumentIndex([instrument({ number: 3, state: 'sent' })]);
    expect(deriveLineAuthorization(line(), index)).toEqual({
      track: 'awaiting',
      number: 3,
    });
  });
});

describe('currentLineCents / signableCents', () => {
  it('falls back to quantity × unit price when no line total is stored', () => {
    expect(
      currentLineCents(
        line({ line_total_cents: null, quantity: 3, unit_price_cents: 1000 }),
      ),
    ).toBe(3000);
  });

  it('is null when the line carries no number at all', () => {
    expect(
      currentLineCents(line({ line_total_cents: null, unit_price_cents: null })),
    ).toBeNull();
  });

  it('signs an allowance off its ceiling when the line total is empty', () => {
    expect(
      signableCents(
        line({
          item_type: 'allowance',
          line_total_cents: 0,
          unit_price_cents: 0,
          budget_max_cents: 400000,
        }),
      ),
    ).toBe(400000);
  });

  it('signs an allowance off its ceiling even when a lower, present line total disagrees — the ceiling is what the client authorizes, not spend-to-date', () => {
    expect(
      signableCents(
        line({
          item_type: 'allowance',
          line_total_cents: 200000,
          unit_price_cents: 200000,
          budget_max_cents: 400000,
        }),
      ),
    ).toBe(400000);
  });

  it('signs a fixed line off its own total — it has no ceiling concept', () => {
    expect(
      signableCents(line({ item_type: 'fixed', line_total_cents: 420000 })),
    ).toBe(420000);
  });
});

describe('scheduledContributionCents', () => {
  it('counts a fixed line at its line total', () => {
    expect(scheduledContributionCents(line())).toBe(420000);
  });

  it('counts an allowance at its ceiling, the way the checkpoint stamps it', () => {
    expect(
      scheduledContributionCents(
        line({
          item_type: 'allowance',
          line_total_cents: 200000,
          budget_max_cents: 400000,
        }),
      ),
    ).toBe(400000);
  });

  it('counts a to-be-determined line at nothing', () => {
    expect(scheduledContributionCents(line({ item_type: 'tbd' }))).toBe(0);
  });

  it('counts an unpriced line at nothing', () => {
    expect(
      scheduledContributionCents(
        line({ line_total_cents: null, unit_price_cents: null }),
      ),
    ).toBe(0);
  });
});

describe('eligibility', () => {
  it('lets a priced, unreleased line go', () => {
    expect(eligibility(line(), { track: 'none' })).toEqual({ eligible: true });
  });

  it.each(['candidate', 'alternate', 'not_selected', 'superseded'])(
    'keeps a %s design disposition out of authorization',
    (design_disposition) => {
      expect(eligibility(line({ design_disposition }), { track: 'none' })).toEqual({
        eligible: false,
        reason: 'select this design direction first',
      });
    },
  );

  it('keeps archived, blocked, and incomplete selections out of authorization', () => {
    expect(eligibility(line({ removed_at: '2026-08-10T00:00:00Z' }), { track: 'none' }))
      .toEqual({ eligible: false, reason: 'archived selection' });
    expect(eligibility(line({ blocked: true }), { track: 'none' }))
      .toEqual({ eligible: false, reason: 'release blocked' });
    expect(eligibility(line({ spec: { readiness_status: 'incomplete' } }), { track: 'none' }))
      .toEqual({ eligible: false, reason: 'specification not ready' });
  });

  it('names the instrument already holding the line', () => {
    expect(
      eligibility(line(), {
        track: 'authorized',
        number: 2,
        signedLineTotalCents: 420000,
        depositClear: true,
        deltaCents: null,
      }),
    ).toEqual({ eligible: false, reason: 'in authorization № 2' });
  });

  it('says awaiting signature for a sent instrument', () => {
    expect(eligibility(line(), { track: 'awaiting', number: 3 })).toEqual({
      eligible: false,
      reason: 'awaiting signature · № 3',
    });
  });

  it('treats a saved draft as already spoken for', () => {
    expect(eligibility(line(), { track: 'draft', number: 3 })).toEqual({
      eligible: false,
      reason: 'in authorization № 3',
    });
  });

  it('asks for a price before a blank line can be released', () => {
    expect(
      eligibility(
        line({ line_total_cents: null, unit_price_cents: null }),
        { track: 'none' },
      ),
    ).toEqual({ eligible: false, reason: 'no price — resolve to release' });
  });

  it('says the plainest thing about a to-be-determined line', () => {
    expect(
      eligibility(
        line({ item_type: 'tbd', line_total_cents: null, unit_price_cents: null }),
        { track: 'none' },
      ),
    ).toEqual({ eligible: false, reason: 'price to be determined' });
  });

  it('lets an allowance go — a ceiling can be signed', () => {
    expect(
      eligibility(
        line({
          item_type: 'allowance',
          line_total_cents: null,
          unit_price_cents: null,
          budget_max_cents: 400000,
        }),
        { track: 'none' },
      ),
    ).toEqual({ eligible: true });
  });
});

describe('poGate', () => {
  const authorized = {
    track: 'authorized' as const,
    number: 3,
    signedLineTotalCents: 420000,
    depositClear: true,
    deltaCents: null,
  };

  it('keeps the old logistics predicate off a commercial job', () => {
    expect(poGate(line(), { track: 'none' }, false)).toEqual({
      orderable: true,
      sentence: null,
    });
    expect(poGate(line({ blocked: true }), { track: 'none' }, false)).toEqual({
      orderable: false,
      sentence: null,
    });
  });

  it('refuses a purchase order on an unreleased line', () => {
    expect(poGate(line(), { track: 'none' }, true)).toEqual({
      orderable: false,
      sentence: 'Not yet authorized — no purchase order',
    });
  });

  it('waits on the deposit', () => {
    expect(
      poGate(line(), { ...authorized, depositClear: false }, true),
    ).toEqual({
      orderable: false,
      sentence:
        'Authorized — the purchase order opens when the deposit clears (A3)',
    });
  });

  it('opens the purchase order once the deposit is clear', () => {
    expect(poGate(line(), authorized, true)).toEqual({
      orderable: true,
      sentence: 'PO available — deposit clear (A3)',
    });
  });

  it('holds while a decision is open on the line', () => {
    expect(poGate(line({ blocked: true }), authorized, true)).toEqual({
      orderable: false,
      sentence: 'A decision is open on this line — no purchase order yet',
    });
  });

  it('says so when the line is already on a purchase order', () => {
    expect(poGate(line({ status: 'ordered' }), authorized, true)).toEqual({
      orderable: false,
      sentence: 'Already on a purchase order',
    });
  });
});

describe('nextInstrumentNumber', () => {
  it('starts at one', () => {
    expect(nextInstrumentNumber([])).toBe(1);
    expect(nextInstrumentNumber(null)).toBe(1);
  });

  it('never reuses a number, voided instruments included', () => {
    expect(
      nextInstrumentNumber([
        instrument({ number: 1, state: 'superseded' }),
        instrument({ number: 2, state: 'executed' }),
        instrument({ number: 4, state: 'declined' }),
      ]),
    ).toBe(5);
  });
});

describe('roomTriState', () => {
  it('reads none, some and all', () => {
    expect(roomTriState(new Set(), ['a', 'b'])).toBe('none');
    expect(roomTriState(new Set(['a']), ['a', 'b'])).toBe('some');
    expect(roomTriState(new Set(['a', 'b']), ['a', 'b'])).toBe('all');
  });

  it('reads a room with nothing tickable as none', () => {
    expect(roomTriState(new Set(['a']), [])).toBe('none');
  });
});

describe('releaseSummary', () => {
  it('counts lines, rooms and money', () => {
    expect(
      releaseSummary([
        {
          id: 'a',
          name: 'Bed',
          roomId: 'r1',
          roomName: 'Primary',
          quantity: 1,
          clientLineTotalCents: 1230000,
        },
        {
          id: 'b',
          name: 'Chair',
          roomId: 'r1',
          roomName: 'Primary',
          quantity: 1,
          clientLineTotalCents: 420000,
        },
        {
          id: 'c',
          name: 'Rug',
          roomId: null,
          roomName: 'Throughout',
          quantity: 1,
          clientLineTotalCents: 680000,
        },
      ]),
    ).toEqual({ lineCount: 3, roomCount: 2, totalCents: 2330000 });
  });
});

describe('furnishingsDepositPercent / depositCents', () => {
  it('is null until the agreement term resolves', () => {
    expect(furnishingsDepositPercent(undefined)).toBeNull();
    expect(furnishingsDepositPercent({})).toBeNull();
    expect(furnishingsDepositPercent({ furnishingsDepositPercent: null })).toBeNull();
  });

  it('clamps a term to a sane share', () => {
    expect(furnishingsDepositPercent({ furnishingsDepositPercent: 50 })).toBe(50);
    expect(furnishingsDepositPercent({ furnishingsDepositPercent: 140 })).toBe(100);
    expect(furnishingsDepositPercent({ furnishingsDepositPercent: -5 })).toBe(0);
  });

  it('takes the deposit off a total', () => {
    expect(depositCents(8620000, 50)).toBe(4310000);
    expect(depositCents(8620000, 0)).toBe(0);
  });
});

describe('checkpointCoverage', () => {
  it('covers a release whose rooms the checkpoint spoke for', () => {
    expect(
      checkpointCoverage({
        checkpointRoomIds: ['r1', 'r2'],
        releasedRoomIds: ['r1', 'r2', null],
      }),
    ).toEqual({ covered: true, uncoveredRoomIds: [] });
  });

  it('names the rooms the client has not seen a plan for', () => {
    expect(
      checkpointCoverage({
        checkpointRoomIds: ['r1'],
        releasedRoomIds: ['r1', 'r3', 'r3'],
      }),
    ).toEqual({ covered: false, uncoveredRoomIds: ['r3'] });
  });
});

describe('scheduleDrift', () => {
  it('is quiet under the threshold', () => {
    expect(
      scheduleDrift({ stampedCents: 10000000, currentCents: 10300000 }),
    ).toMatchObject({ drifted: false });
  });

  it('speaks above it', () => {
    const drift = scheduleDrift({
      stampedCents: 10000000,
      currentCents: 10800000,
    });
    expect(drift.drifted).toBe(true);
    expect(drift.deltaCents).toBe(800000);
    expect(Math.round(drift.percent)).toBe(8);
  });

  it('says nothing when the checkpoint stamped no figure', () => {
    expect(
      scheduleDrift({ stampedCents: null, currentCents: 10800000 }),
    ).toEqual({ drifted: false, deltaCents: 0, percent: 0 });
  });
});
