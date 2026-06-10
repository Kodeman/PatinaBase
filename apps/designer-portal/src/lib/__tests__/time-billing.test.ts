import {
  formatHoursLabel,
  minutesToHours,
  buildTimeLineDraft,
  groupEntriesByWeek,
  studioPeriodStartISO,
} from '../time-billing';

describe('formatHoursLabel', () => {
  it('formats mixed, whole-hour, sub-hour, and zero durations', () => {
    expect(formatHoursLabel(270)).toBe('4h 30m');
    expect(formatHoursLabel(120)).toBe('2h');
    expect(formatHoursLabel(45)).toBe('45m');
    expect(formatHoursLabel(0)).toBe('0m');
  });

  it('clamps negatives and tolerates NaN-ish input', () => {
    expect(formatHoursLabel(-10)).toBe('0m');
    expect(formatHoursLabel(Number.NaN)).toBe('0m');
  });
});

describe('minutesToHours', () => {
  it('rounds to 0.1h', () => {
    expect(minutesToHours(90)).toBe(1.5);
    expect(minutesToHours(125)).toBe(2.1);
    expect(minutesToHours(0)).toBe(0);
  });
});

describe('buildTimeLineDraft', () => {
  it('returns null for an empty selection', () => {
    expect(buildTimeLineDraft([])).toBeNull();
  });

  it('sums view-resolved amounts exactly — no weighted-rate re-rounding', () => {
    // Two entries whose per-entry rounding would drift under an averaged rate.
    const draft = buildTimeLineDraft([
      { id: 'a', duration_minutes: 50, amount_cents: 12_083 }, // 50m @ $145/h
      { id: 'b', duration_minutes: 70, amount_cents: 23_333 }, // 70m @ $200/h
    ]);
    expect(draft).not.toBeNull();
    expect(draft!.amountCents).toBe(35_416); // exact sum of the inputs
    expect(draft!.totalMinutes).toBe(120);
    expect(draft!.entryIds).toEqual(['a', 'b']);
    expect(draft!.description).toBe('Design services — 2h (2 entries)');
  });

  it('uses singular phrasing for one entry', () => {
    const draft = buildTimeLineDraft([{ id: 'a', duration_minutes: 90, amount_cents: 30_000 }]);
    expect(draft!.description).toBe('Design services — 1h 30m (1 entry)');
  });
});

describe('groupEntriesByWeek', () => {
  it('groups by local Monday-start week, newest week first, with subtotals', () => {
    // Wed Jun 3 2026 and Tue Jun 2 2026 share the Mon Jun 1 week;
    // Fri May 29 2026 falls in the Mon May 25 week.
    const groups = groupEntriesByWeek([
      { started_at: '2026-06-03T12:00:00', duration_minutes: 60, amount_cents: 100 },
      { started_at: '2026-06-02T12:00:00', duration_minutes: 30, amount_cents: 50 },
      { started_at: '2026-05-29T12:00:00', duration_minutes: 45, amount_cents: null },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].weekStart).toBe('2026-06-01');
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].totalMinutes).toBe(90);
    expect(groups[0].amountCents).toBe(150);
    expect(groups[1].weekStart).toBe('2026-05-25');
    expect(groups[1].totalMinutes).toBe(45);
    expect(groups[1].amountCents).toBe(0);
  });

  it('treats Sunday as the trailing day of the week', () => {
    const groups = groupEntriesByWeek([
      { started_at: '2026-06-07T12:00:00', duration_minutes: 10 }, // Sun
      { started_at: '2026-06-01T12:00:00', duration_minutes: 10 }, // Mon
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].weekStart).toBe('2026-06-01');
  });
});

describe('studioPeriodStartISO', () => {
  it('mirrors the earnings page rolling windows', () => {
    const now = new Date('2026-06-09T12:00:00Z');
    expect(studioPeriodStartISO('week', now)).toBe('2026-06-02T12:00:00.000Z');
    expect(studioPeriodStartISO('month', now)).toBe('2026-05-09T12:00:00.000Z');
    expect(studioPeriodStartISO('quarter', now)).toBe('2026-03-09T12:00:00.000Z');
    expect(studioPeriodStartISO('year', now)).toBe('2025-06-09T12:00:00.000Z');
  });
});
