import {
  folioClickDay,
  folioCommittable,
  folioDraftFromValue,
  folioReadout,
  folioReadoutLabel,
  folioShadeRange,
  type FolioDraft,
} from '../folio-calendar-derivation';

const LABELS = { day: 'DUE', span: 'WORKING WINDOW' };

describe('folioDraftFromValue', () => {
  it('opens empty in the fallback mode', () => {
    expect(folioDraftFromValue(null, 'day')).toEqual({ mode: 'day', date: null });
    expect(folioDraftFromValue(null, 'span')).toEqual({ mode: 'span', anchor: null, end: null });
  });

  it('round-trips a committed day and a committed span', () => {
    const day = { kind: 'day', date: '2026-08-20' } as const;
    expect(folioDraftFromValue(day, 'span')).toEqual({ mode: 'day', date: '2026-08-20' });
    expect(folioCommittable(folioDraftFromValue(day, 'span'))).toEqual(day);

    const span = { kind: 'span', start: '2026-08-25', end: '2026-08-28' } as const;
    expect(folioDraftFromValue(span, 'day')).toEqual({
      mode: 'span',
      anchor: '2026-08-25',
      end: '2026-08-28',
    });
    expect(folioCommittable(folioDraftFromValue(span, 'day'))).toEqual(span);
  });

  it('coerces a day value onto a span-only surface as an open anchor', () => {
    expect(folioDraftFromValue({ kind: 'day', date: '2026-08-20' }, 'span', ['span'])).toEqual({
      mode: 'span',
      anchor: '2026-08-20',
      end: null,
    });
    // …and coercion alone is never committable: the user still presses SET.
    expect(
      folioCommittable(folioDraftFromValue({ kind: 'day', date: '2026-08-20' }, 'span', ['span'])),
    ).toBeNull();
  });

  it('coerces a span value onto a day-only surface as its start', () => {
    expect(
      folioDraftFromValue({ kind: 'span', start: '2026-08-25', end: '2026-08-28' }, 'day', ['day']),
    ).toEqual({ mode: 'day', date: '2026-08-25' });
  });

  it('leaves a value alone when the surface offers its shape', () => {
    expect(
      folioDraftFromValue({ kind: 'day', date: '2026-08-20' }, 'span', ['span', 'day']),
    ).toEqual({ mode: 'day', date: '2026-08-20' });
  });
});

describe('folioReadoutLabel', () => {
  it('is the one place the mode picks its label', () => {
    expect(folioReadoutLabel({ mode: 'day', date: null }, LABELS)).toBe('DUE');
    expect(folioReadoutLabel({ mode: 'span', anchor: null, end: null }, LABELS)).toBe(
      'WORKING WINDOW',
    );
    // folioReadout prefixes with exactly that label — they cannot drift.
    const draft: FolioDraft = { mode: 'day', date: '2026-08-20' };
    expect(folioReadout(draft, null, LABELS).startsWith(folioReadoutLabel(draft, LABELS))).toBe(
      true,
    );
  });
});

describe('folioClickDay — day mode', () => {
  it('sets the day, and a second click resets it to the new day', () => {
    const first = folioClickDay({ mode: 'day', date: null }, '2026-08-20');
    expect(first).toEqual({ mode: 'day', date: '2026-08-20' });
    expect(folioClickDay(first, '2026-08-11')).toEqual({ mode: 'day', date: '2026-08-11' });
  });

  it('ignores a day that is not a real calendar date', () => {
    const draft: FolioDraft = { mode: 'day', date: '2026-08-20' };
    expect(folioClickDay(draft, '2026-02-30')).toBe(draft);
  });
});

describe('folioClickDay — span mode', () => {
  it('anchors, then closes the span forwards', () => {
    const anchored = folioClickDay({ mode: 'span', anchor: null, end: null }, '2026-08-25');
    expect(anchored).toEqual({ mode: 'span', anchor: '2026-08-25', end: null });
    expect(folioClickDay(anchored, '2026-08-28')).toEqual({
      mode: 'span',
      anchor: '2026-08-25',
      end: '2026-08-28',
    });
  });

  it('normalizes low→high when the second click lands before the anchor', () => {
    const anchored: FolioDraft = { mode: 'span', anchor: '2026-08-28', end: null };
    expect(folioClickDay(anchored, '2026-08-25')).toEqual({
      mode: 'span',
      anchor: '2026-08-25',
      end: '2026-08-28',
    });
  });

  it('restarts from the third click', () => {
    const closed: FolioDraft = { mode: 'span', anchor: '2026-08-25', end: '2026-08-28' };
    expect(folioClickDay(closed, '2026-09-02')).toEqual({
      mode: 'span',
      anchor: '2026-09-02',
      end: null,
    });
  });
});

describe('folioShadeRange', () => {
  it('never shades in day mode', () => {
    expect(folioShadeRange({ mode: 'day', date: '2026-08-20' }, '2026-08-25')).toBeNull();
  });

  it('shades a closed span and needs no hover to do it', () => {
    expect(
      folioShadeRange({ mode: 'span', anchor: '2026-08-25', end: '2026-08-28' }, null),
    ).toEqual({ start: '2026-08-25', end: '2026-08-28' });
  });

  it('previews the hover range from an open anchor, in both directions', () => {
    const open: FolioDraft = { mode: 'span', anchor: '2026-08-25', end: null };
    expect(folioShadeRange(open, '2026-08-28')).toEqual({
      start: '2026-08-25',
      end: '2026-08-28',
    });
    expect(folioShadeRange(open, '2026-08-21')).toEqual({
      start: '2026-08-21',
      end: '2026-08-25',
    });
  });

  it('shades nothing without an anchor, or with an anchor and no cursor', () => {
    expect(folioShadeRange({ mode: 'span', anchor: null, end: null }, '2026-08-25')).toBeNull();
    expect(folioShadeRange({ mode: 'span', anchor: '2026-08-25', end: null }, null)).toBeNull();
  });
});

describe('folioCommittable', () => {
  it('is null until the draft is whole', () => {
    expect(folioCommittable({ mode: 'day', date: null })).toBeNull();
    expect(folioCommittable({ mode: 'span', anchor: null, end: null })).toBeNull();
    expect(folioCommittable({ mode: 'span', anchor: '2026-08-25', end: null })).toBeNull();
  });

  it('commits a whole draft', () => {
    expect(folioCommittable({ mode: 'day', date: '2026-08-20' })).toEqual({
      kind: 'day',
      date: '2026-08-20',
    });
    expect(folioCommittable({ mode: 'span', anchor: '2026-08-25', end: '2026-08-28' })).toEqual({
      kind: 'span',
      start: '2026-08-25',
      end: '2026-08-28',
    });
  });
});

describe('folioReadout', () => {
  it('reads a day back with its weekday', () => {
    expect(folioReadout({ mode: 'day', date: '2026-08-20' }, null, LABELS)).toBe('DUE Thu, Aug 20');
  });

  it('counts a span inclusively', () => {
    expect(
      folioReadout({ mode: 'span', anchor: '2026-08-25', end: '2026-08-28' }, null, LABELS),
    ).toBe('WORKING WINDOW Aug 25 — Aug 28 · 4 days');
  });

  it('says "1 day" for a single-day span', () => {
    expect(
      folioReadout({ mode: 'span', anchor: '2026-08-25', end: '2026-08-25' }, null, LABELS),
    ).toBe('WORKING WINDOW Aug 25 — Aug 25 · 1 day');
  });

  it('crosses a month boundary without losing the count', () => {
    expect(
      folioReadout({ mode: 'span', anchor: '2026-08-30', end: '2026-09-02' }, null, LABELS),
    ).toBe('WORKING WINDOW Aug 30 — Sep 2 · 4 days');
  });

  it('reads the live hover preview before the span is closed', () => {
    expect(
      folioReadout({ mode: 'span', anchor: '2026-08-25', end: null }, '2026-08-21', LABELS),
    ).toBe('WORKING WINDOW Aug 21 — Aug 25 · 5 days');
  });

  it('places an em dash while the draft is incomplete', () => {
    expect(folioReadout({ mode: 'day', date: null }, null, LABELS)).toBe('DUE —');
    expect(folioReadout({ mode: 'span', anchor: null, end: null }, null, LABELS)).toBe(
      'WORKING WINDOW —',
    );
    expect(folioReadout({ mode: 'span', anchor: '2026-08-25', end: null }, null, LABELS)).toBe(
      'WORKING WINDOW —',
    );
  });

  it('honors surface-supplied labels', () => {
    expect(
      folioReadout({ mode: 'day', date: '2026-08-20' }, null, { day: 'SHIPS', span: 'ON SITE' }),
    ).toBe('SHIPS Thu, Aug 20');
  });
});
