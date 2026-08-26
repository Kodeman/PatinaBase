import { formatBudgetRange, formatTimeline } from '../brief-chips';

describe('formatBudgetRange', () => {
  it('formats the stored enum token as words', () => {
    expect(formatBudgetRange('15k_50k')).toBe('$15k – $50k');
    expect(formatBudgetRange('under_5k')).toBe('Under $5k');
    expect(formatBudgetRange('5k_15k')).toBe('$5k – $15k');
    expect(formatBudgetRange('50k_100k')).toBe('$50k – $100k');
    expect(formatBudgetRange('over_100k')).toBe('Over $100k');
  });

  it('falls back to the raw value for an unmapped token', () => {
    expect(formatBudgetRange('mystery_band')).toBe('mystery_band');
  });

  it('returns an empty string for a missing value', () => {
    expect(formatBudgetRange(null)).toBe('');
    expect(formatBudgetRange(undefined)).toBe('');
  });
});

describe('formatTimeline', () => {
  it('formats the stored enum token as words', () => {
    expect(formatTimeline('3_6_months')).toBe('3–6 Months');
    expect(formatTimeline('asap')).toBe('ASAP');
    expect(formatTimeline('1_3_months')).toBe('1–3 Months');
    expect(formatTimeline('6_12_months')).toBe('6–12 Months');
    expect(formatTimeline('flexible')).toBe('Flexible');
  });

  it('falls back to the raw value for an unmapped token', () => {
    expect(formatTimeline('mystery_window')).toBe('mystery_window');
  });

  it('returns an empty string for a missing value', () => {
    expect(formatTimeline(null)).toBe('');
    expect(formatTimeline(undefined)).toBe('');
  });
});
