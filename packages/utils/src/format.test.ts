import { formatCurrency, formatNumber, formatPercentage, truncate } from './format';

describe('Format Utilities', () => {
  describe('formatCurrency', () => {
    it('should format USD currency by default', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
    });

    it('should format zero correctly', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should format negative amounts', () => {
      expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
    });

    it('should format EUR currency', () => {
      expect(formatCurrency(1234.56, 'EUR')).toMatch(/€1,234.56|1,234.56\s*€/);
    });

    it('should format GBP currency', () => {
      expect(formatCurrency(1234.56, 'GBP')).toMatch(/£1,234.56/);
    });

    it('should format CAD currency', () => {
      expect(formatCurrency(1234.56, 'CAD')).toMatch(/CA\$1,234.56/);
    });

    it('should handle large amounts', () => {
      expect(formatCurrency(1234567.89)).toBe('$1,234,567.89');
    });

    it('should handle very small amounts', () => {
      expect(formatCurrency(0.01)).toBe('$0.01');
    });

    it('should round to 2 decimal places', () => {
      expect(formatCurrency(1234.567)).toBe('$1,234.57');
    });
  });

  describe('formatNumber', () => {
    it('should format integer numbers', () => {
      expect(formatNumber(1234)).toBe('1,234');
    });

    it('should format zero', () => {
      expect(formatNumber(0)).toBe('0');
    });

    it('should format negative numbers', () => {
      expect(formatNumber(-1234)).toBe('-1,234');
    });

    it('should format large numbers', () => {
      expect(formatNumber(1234567890)).toBe('1,234,567,890');
    });

    it('should format decimal numbers', () => {
      expect(formatNumber(1234.56)).toBe('1,234.56');
    });

    it('should handle single digit numbers', () => {
      expect(formatNumber(5)).toBe('5');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentage with default decimals', () => {
      expect(formatPercentage(75)).toBe('75%');
    });

    it('should format percentage with 0 decimals when specified', () => {
      expect(formatPercentage(75.5, 0)).toBe('76%');
    });

    it('should format percentage with 1 decimal', () => {
      expect(formatPercentage(75.5, 1)).toBe('75.5%');
    });

    it('should format percentage with 2 decimals', () => {
      expect(formatPercentage(75.567, 2)).toBe('75.57%');
    });

    it('should format zero percentage', () => {
      expect(formatPercentage(0)).toBe('0%');
    });

    it('should format 100 percentage', () => {
      expect(formatPercentage(100)).toBe('100%');
    });

    it('should format negative percentage', () => {
      expect(formatPercentage(-10.5, 1)).toBe('-10.5%');
    });

    it('should handle very small percentages', () => {
      expect(formatPercentage(0.001, 3)).toBe('0.001%');
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      const str = 'This is a very long string that needs truncation';
      expect(truncate(str, 20)).toBe('This is a very lo...');
    });

    it('should not truncate short strings', () => {
      const str = 'Short';
      expect(truncate(str, 20)).toBe('Short');
    });

    it('should handle exact length strings', () => {
      const str = 'Exactly twenty chars';
      expect(truncate(str, 20)).toBe('Exactly twenty chars');
    });

    it('should use custom suffix', () => {
      const str = 'This is a very long string';
      expect(truncate(str, 15, '---')).toBe('This is a ve---');
    });

    it('should handle empty suffix', () => {
      const str = 'This is a very long string';
      expect(truncate(str, 15, '')).toBe('This is a very ');
    });

    it('should handle single character strings', () => {
      expect(truncate('A', 10)).toBe('A');
    });

    it('should handle empty strings', () => {
      expect(truncate('', 10)).toBe('');
    });

    it('should truncate to minimum length with long suffix', () => {
      const str = 'Hello World';
      expect(truncate(str, 8, '....')).toBe('Hell....');
    });

    it('should account for suffix length', () => {
      const str = 'Hello World Test';
      const result = truncate(str, 10, '...');
      expect(result.length).toBe(10);
      expect(result).toBe('Hello W...');
    });
  });
});
