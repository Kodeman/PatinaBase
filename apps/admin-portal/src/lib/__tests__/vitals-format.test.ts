import { formatVitalValue, formatVitalDelta, vitalTrend } from '@/lib/vitals-format';

describe('vitals-format', () => {
  describe('formatVitalValue', () => {
    it('formats ratio as "N.N : 1"', () => {
      expect(formatVitalValue('ratio', 1.8)).toBe('1.8 : 1');
      expect(formatVitalValue('ratio', 2)).toBe('2.0 : 1');
      expect(formatVitalValue('ratio', 0.55)).toBe('0.6 : 1'); // rounds
    });

    it('formats usd as whole, comma-grouped dollars', () => {
      expect(formatVitalValue('usd', 4120)).toBe('$4,120');
      expect(formatVitalValue('usd', 4120.6)).toBe('$4,121'); // rounds
      expect(formatVitalValue('usd', 0)).toBe('$0');
      expect(formatVitalValue('usd', 1234567)).toBe('$1,234,567');
    });

    it('formats pct with one decimal and a trailing %', () => {
      expect(formatVitalValue('pct', 16.24)).toBe('16.2%');
      expect(formatVitalValue('pct', 15)).toBe('15.0%');
    });

    it('renders an em dash for null, undefined, and NaN regardless of unit', () => {
      expect(formatVitalValue('ratio', null)).toBe('—');
      expect(formatVitalValue('ratio', undefined)).toBe('—');
      expect(formatVitalValue('usd', NaN)).toBe('—');
      expect(formatVitalValue('pct', null)).toBe('—');
    });

    it('handles a real zero distinctly from missing data', () => {
      expect(formatVitalValue('usd', 0)).toBe('$0');
      expect(formatVitalValue('usd', 0)).not.toBe('—');
    });
  });

  describe('formatVitalDelta', () => {
    it('formats a positive delta with a leading plus', () => {
      expect(formatVitalDelta('usd', 4120, 4000)).toBe('+$120 vs. prior 30d');
      expect(formatVitalDelta('pct', 16.2, 15.0)).toBe('+1.2 pts vs. prior 30d');
      expect(formatVitalDelta('ratio', 2.0, 1.8)).toBe('+0.2 vs. prior 30d');
    });

    it('formats a negative delta with a minus sign and the absolute magnitude', () => {
      expect(formatVitalDelta('usd', 3800, 4000)).toBe('−$200 vs. prior 30d');
      expect(formatVitalDelta('pct', 14.0, 15.0)).toBe('−1.0 pts vs. prior 30d');
      expect(formatVitalDelta('ratio', 1.5, 1.8)).toBe('−0.3 vs. prior 30d');
    });

    it('special-cases an exact-zero delta', () => {
      expect(formatVitalDelta('usd', 4000, 4000)).toBe('No change vs. prior 30d');
      expect(formatVitalDelta('ratio', 1.8, 1.8)).toBe('No change vs. prior 30d');
    });

    it('returns undefined when either side is missing — never renders a bare "vs. prior 30d"', () => {
      expect(formatVitalDelta('usd', 4120, null)).toBeUndefined();
      expect(formatVitalDelta('usd', null, 4000)).toBeUndefined();
      expect(formatVitalDelta('usd', undefined, undefined)).toBeUndefined();
      expect(formatVitalDelta('pct', NaN, 15)).toBeUndefined();
    });
  });

  describe('vitalTrend', () => {
    it('is "up" when value exceeds prev_value', () => {
      expect(vitalTrend(2.0, 1.8)).toBe('up');
    });

    it('is "down" when value is below prev_value', () => {
      expect(vitalTrend(1.5, 1.8)).toBe('down');
    });

    it('is "neutral" on an exact tie', () => {
      expect(vitalTrend(1.8, 1.8)).toBe('neutral');
      expect(vitalTrend(0, 0)).toBe('neutral');
    });

    it('is "neutral" whenever either side is missing — never guesses a direction', () => {
      expect(vitalTrend(null, 1.8)).toBe('neutral');
      expect(vitalTrend(1.8, null)).toBe('neutral');
      expect(vitalTrend(undefined, undefined)).toBe('neutral');
      expect(vitalTrend(NaN, 1.8)).toBe('neutral');
    });
  });
});
