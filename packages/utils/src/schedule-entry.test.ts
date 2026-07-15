/**
 * `parseScheduleEntry` grammar contract (R101/Slice 03 §2). Pins every
 * accepted duration/anchor form, the ambiguity rules (bare-number default,
 * unsigned-must-be-positive, signed-zero-allowed, fractional-week rounding,
 * year inference), and the invalid fallbacks — so a future edit to the
 * grammar fails a test here instead of silently reshaping what a designer
 * can type into the ghost-add / milestone fields.
 */

import { parseScheduleEntry, type ParsedEntry } from './schedule-entry';

const TODAY = '2026-07-15';

function duration(days: number): ParsedEntry {
  return { kind: 'duration', days };
}

function anchor(date: string): ParsedEntry {
  return { kind: 'anchor', date };
}

function expectInvalid(result: ParsedEntry): void {
  expect(result.kind).toBe('invalid');
}

// ═══════════════════════════════════════════════════════════════════════════
// Durations — unsigned
// ═══════════════════════════════════════════════════════════════════════════

describe('parseScheduleEntry — unsigned durations', () => {
  it('3w → 21 days', () => {
    expect(parseScheduleEntry('3w', TODAY)).toEqual(duration(21));
  });

  it('10d → 10 days', () => {
    expect(parseScheduleEntry('10d', TODAY)).toEqual(duration(10));
  });

  it('18 days → 18 days (spelled-out unit)', () => {
    expect(parseScheduleEntry('18 days', TODAY)).toEqual(duration(18));
  });

  it('4 weeks → 28 days (spelled-out unit)', () => {
    expect(parseScheduleEntry('4 weeks', TODAY)).toEqual(duration(28));
  });

  it('2 w → 14 days (space before a short unit)', () => {
    expect(parseScheduleEntry('2 w', TODAY)).toEqual(duration(14));
  });

  it('1 day → 1 day (singular spelled-out unit)', () => {
    expect(parseScheduleEntry('1 day', TODAY)).toEqual(duration(1));
  });

  it('1.5w → 11 days (fractional week × 7, rounded)', () => {
    expect(parseScheduleEntry('1.5w', TODAY)).toEqual(duration(11));
  });

  it('1.4w → 10 days (fractional week rounds down)', () => {
    expect(parseScheduleEntry('1.4w', TODAY)).toEqual(duration(10));
  });

  it('0d is invalid — unsigned zero is rejected', () => {
    expectInvalid(parseScheduleEntry('0d', TODAY));
  });

  it('0w is invalid — unsigned zero is rejected regardless of unit', () => {
    expectInvalid(parseScheduleEntry('0w', TODAY));
  });

  it('2.5d is invalid — day counts must be a whole number', () => {
    expectInvalid(parseScheduleEntry('2.5d', TODAY));
  });

  it('0.05w is invalid — an unsigned fractional week that rounds to zero days is rejected post-round', () => {
    expectInvalid(parseScheduleEntry('0.05w', TODAY));
  });

  it('+0.05w is valid — the signed form may round to zero (offsets allow zero)', () => {
    expect(parseScheduleEntry('+0.05w', TODAY)).toEqual(duration(0));
  });

  it('is case-insensitive and whitespace-tolerant', () => {
    expect(parseScheduleEntry('  3W  ', TODAY)).toEqual(duration(21));
    expect(parseScheduleEntry('4   WEEKS', TODAY)).toEqual(duration(28));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Durations — signed offsets (feed milestones)
// ═══════════════════════════════════════════════════════════════════════════

describe('parseScheduleEntry — signed offsets', () => {
  it('+5d → +5 days', () => {
    expect(parseScheduleEntry('+5d', TODAY)).toEqual(duration(5));
  });

  it('-3d → -3 days', () => {
    expect(parseScheduleEntry('-3d', TODAY)).toEqual(duration(-3));
  });

  it('+2w → +14 days', () => {
    expect(parseScheduleEntry('+2w', TODAY)).toEqual(duration(14));
  });

  it('+0d → 0 days (signed zero is allowed)', () => {
    expect(parseScheduleEntry('+0d', TODAY)).toEqual(duration(0));
  });

  it('-0d → 0 days (signed zero is allowed, either sign)', () => {
    expect(parseScheduleEntry('-0d', TODAY)).toEqual(duration(0));
  });

  it('-1.5w → -11 days (sign applies to the rounded week magnitude)', () => {
    expect(parseScheduleEntry('-1.5w', TODAY)).toEqual(duration(-11));
  });

  it('-2.5d is still invalid — the sign does not waive the whole-day rule', () => {
    expectInvalid(parseScheduleEntry('-2.5d', TODAY));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bare numbers — governed by opts.bareNumberUnit (default 'reject')
// ═══════════════════════════════════════════════════════════════════════════

describe('parseScheduleEntry — bare numbers', () => {
  it('a bare number is invalid with no opts (default reject)', () => {
    expectInvalid(parseScheduleEntry('10', TODAY));
  });

  it('a bare number is invalid when bareNumberUnit is explicitly "reject"', () => {
    expectInvalid(parseScheduleEntry('10', TODAY, { bareNumberUnit: 'reject' }));
  });

  it('bareNumberUnit "days" interprets a bare number as days', () => {
    expect(parseScheduleEntry('10', TODAY, { bareNumberUnit: 'days' })).toEqual(duration(10));
  });

  it('bareNumberUnit "weeks" interprets a bare number as weeks', () => {
    expect(parseScheduleEntry('10', TODAY, { bareNumberUnit: 'weeks' })).toEqual(duration(70));
  });

  it('a signed bare number is still governed by bareNumberUnit and keeps its sign', () => {
    expect(parseScheduleEntry('+5', TODAY, { bareNumberUnit: 'days' })).toEqual(duration(5));
    expect(parseScheduleEntry('-2', TODAY, { bareNumberUnit: 'weeks' })).toEqual(duration(-14));
  });

  it('an unsigned bare zero is invalid even with an opted-in unit', () => {
    expectInvalid(parseScheduleEntry('0', TODAY, { bareNumberUnit: 'days' }));
  });

  it('a signed bare zero is valid with an opted-in unit', () => {
    expect(parseScheduleEntry('+0', TODAY, { bareNumberUnit: 'days' })).toEqual(duration(0));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Anchors — the accepted forms (spec §2 exact list), no explicit year
// ═══════════════════════════════════════════════════════════════════════════

describe('parseScheduleEntry — anchor forms (year inferred, today 2026-07-15)', () => {
  it('"Sep 21" (abbreviated month + day)', () => {
    expect(parseScheduleEntry('Sep 21', TODAY)).toEqual(anchor('2026-09-21'));
  });

  it('"September 21" (full month + day)', () => {
    expect(parseScheduleEntry('September 21', TODAY)).toEqual(anchor('2026-09-21'));
  });

  it('"Sept 21" (the "Sept" alias)', () => {
    expect(parseScheduleEntry('Sept 21', TODAY)).toEqual(anchor('2026-09-21'));
  });

  it('"21 Sep" (day-first order)', () => {
    expect(parseScheduleEntry('21 Sep', TODAY)).toEqual(anchor('2026-09-21'));
  });

  it('"9/21" (US M/D, no year)', () => {
    expect(parseScheduleEntry('9/21', TODAY)).toEqual(anchor('2026-09-21'));
  });

  it('is case-insensitive and tolerant of extra whitespace', () => {
    expect(parseScheduleEntry('SEP 21', TODAY)).toEqual(anchor('2026-09-21'));
    expect(parseScheduleEntry('  sep   21  ', TODAY)).toEqual(anchor('2026-09-21'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Anchors — explicit year forms
// ═══════════════════════════════════════════════════════════════════════════

describe('parseScheduleEntry — anchor forms (explicit year)', () => {
  it('"09/21/2026" (US M/D/YYYY)', () => {
    expect(parseScheduleEntry('09/21/2026', TODAY)).toEqual(anchor('2026-09-21'));
  });

  it('"2026-09-21" (ISO)', () => {
    expect(parseScheduleEntry('2026-09-21', TODAY)).toEqual(anchor('2026-09-21'));
  });

  it('"Sep 21 2026" (abbreviated month + day + space-separated year)', () => {
    expect(parseScheduleEntry('Sep 21 2026', TODAY)).toEqual(anchor('2026-09-21'));
  });

  it('"September 21, 2026" (full month + day + comma year)', () => {
    expect(parseScheduleEntry('September 21, 2026', TODAY)).toEqual(anchor('2026-09-21'));
  });

  it('an explicit year in the past is honored as-is — no inference applied', () => {
    expect(parseScheduleEntry('2020-01-01', TODAY)).toEqual(anchor('2020-01-01'));
    expect(parseScheduleEntry('Jan 1 2020', TODAY)).toEqual(anchor('2020-01-01'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Year inference — the exact boundary case pinned by the spec
// ═══════════════════════════════════════════════════════════════════════════

describe('parseScheduleEntry — year inference boundary (today 2026-07-15)', () => {
  it('"Jul 15" (== today) stays in the current year — the boundary is inclusive', () => {
    expect(parseScheduleEntry('Jul 15', TODAY)).toEqual(anchor('2026-07-15'));
  });

  it('"Jul 14" (one day before today) rolls to next year', () => {
    expect(parseScheduleEntry('Jul 14', TODAY)).toEqual(anchor('2027-07-14'));
  });

  it('"Jul 16" (one day after today) stays in the current year', () => {
    expect(parseScheduleEntry('Jul 16', TODAY)).toEqual(anchor('2026-07-16'));
  });

  it('a month/day already past this year infers next year via the numeric M/D form too', () => {
    expect(parseScheduleEntry('1/1', TODAY)).toEqual(anchor('2027-01-01'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Invalid input
// ═══════════════════════════════════════════════════════════════════════════

describe('parseScheduleEntry — invalid input', () => {
  it('an unknown unit ("3m") is invalid', () => {
    expectInvalid(parseScheduleEntry('3m', TODAY));
  });

  it('an impossible ISO date (Feb 30) is invalid via the epochDayFromISO round-trip', () => {
    expectInvalid(parseScheduleEntry('2026-02-30', TODAY));
  });

  it('an impossible month-name date (Feb 30) is invalid at every inferred year', () => {
    expectInvalid(parseScheduleEntry('Feb 30', TODAY));
  });

  it('a day out of range (Sep 32) is invalid', () => {
    expectInvalid(parseScheduleEntry('Sep 32', TODAY));
  });

  it('a month out of range in numeric M/D (13/1) is invalid', () => {
    expectInvalid(parseScheduleEntry('13/1', TODAY));
  });

  it('an unrecognized month name is invalid', () => {
    expectInvalid(parseScheduleEntry('Foo 21', TODAY));
  });

  it('unparseable garbage is invalid', () => {
    expectInvalid(parseScheduleEntry('foobar', TODAY));
  });

  it('a month name with no day is invalid (structurally incomplete)', () => {
    expectInvalid(parseScheduleEntry('Sep', TODAY));
  });

  it('empty input is invalid', () => {
    expectInvalid(parseScheduleEntry('', TODAY));
  });

  it('whitespace-only input is invalid', () => {
    expectInvalid(parseScheduleEntry('   ', TODAY));
  });

  it('non-string input never throws — degrades to invalid', () => {
    expect(() => parseScheduleEntry(null as unknown as string, TODAY)).not.toThrow();
    expectInvalid(parseScheduleEntry(null as unknown as string, TODAY));
    expectInvalid(parseScheduleEntry(undefined as unknown as string, TODAY));
  });

  it('a malformed clock never throws — an anchor needing inference degrades to invalid', () => {
    expect(() => parseScheduleEntry('Sep 21', 'not-a-date')).not.toThrow();
    expectInvalid(parseScheduleEntry('Sep 21', 'not-a-date'));
  });

  it('a malformed clock does not block a duration (today is irrelevant to durations)', () => {
    expect(parseScheduleEntry('3w', 'not-a-date')).toEqual(duration(21));
  });

  it('a malformed clock does not block an explicit-year anchor', () => {
    expect(parseScheduleEntry('2026-09-21', 'not-a-date')).toEqual(anchor('2026-09-21'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Totality smoke — every case above never throws, even when combined oddly
// ═══════════════════════════════════════════════════════════════════════════

describe('parseScheduleEntry — total (never throws)', () => {
  const wildInputs = ['', '   ', '3m', '99/99/9999', 'sep', '21', '-', '+', 'w', 'd', '....', 'sep,,,,21', '9//21'];

  it.each(wildInputs)('never throws on %j', (input) => {
    expect(() => parseScheduleEntry(input, TODAY)).not.toThrow();
  });
});
