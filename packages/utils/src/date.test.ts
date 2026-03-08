import { formatDate, isDateInPast, isDateInFuture, addDays, subtractDays } from './date';

describe('Date Utilities', () => {
  describe('formatDate', () => {
    const testDate = new Date('2024-03-15T12:00:00Z');

    it('should format date in short format by default', () => {
      const result = formatDate(testDate);
      expect(result).toMatch(/03\/15\/2024/);
    });

    it('should format date in short format when specified', () => {
      const result = formatDate(testDate, 'short');
      expect(result).toMatch(/03\/15\/2024/);
    });

    it('should format date in long format', () => {
      const result = formatDate(testDate, 'long');
      expect(result).toBe('March 15, 2024');
    });

    it('should format date in ISO format', () => {
      const result = formatDate(testDate, 'iso');
      expect(result).toBe('2024-03-15T12:00:00.000Z');
    });

    it('should handle leap year dates', () => {
      const leapDate = new Date('2024-02-29T00:00:00Z');
      const result = formatDate(leapDate, 'long');
      expect(result).toBe('February 29, 2024');
    });
  });

  describe('isDateInPast', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-03-15T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return true for dates in the past', () => {
      const pastDate = new Date('2024-03-14T12:00:00Z');
      expect(isDateInPast(pastDate)).toBe(true);
    });

    it('should return false for dates in the future', () => {
      const futureDate = new Date('2024-03-16T12:00:00Z');
      expect(isDateInPast(futureDate)).toBe(false);
    });

    it('should return false for current date', () => {
      const currentDate = new Date('2024-03-15T12:00:00Z');
      expect(isDateInPast(currentDate)).toBe(false);
    });

    it('should return true for dates years in the past', () => {
      const oldDate = new Date('2020-01-01T00:00:00Z');
      expect(isDateInPast(oldDate)).toBe(true);
    });
  });

  describe('isDateInFuture', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-03-15T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return true for dates in the future', () => {
      const futureDate = new Date('2024-03-16T12:00:00Z');
      expect(isDateInFuture(futureDate)).toBe(true);
    });

    it('should return false for dates in the past', () => {
      const pastDate = new Date('2024-03-14T12:00:00Z');
      expect(isDateInFuture(pastDate)).toBe(false);
    });

    it('should return false for current date', () => {
      const currentDate = new Date('2024-03-15T12:00:00Z');
      expect(isDateInFuture(currentDate)).toBe(false);
    });

    it('should return true for dates years in the future', () => {
      const futureDate = new Date('2030-12-31T23:59:59Z');
      expect(isDateInFuture(futureDate)).toBe(true);
    });
  });

  describe('addDays', () => {
    it('should add days to a date', () => {
      const date = new Date('2024-03-15T00:00:00Z');
      const result = addDays(date, 5);
      expect(result.getDate()).toBe(20);
    });

    it('should handle adding 0 days', () => {
      const date = new Date('2024-03-15T00:00:00Z');
      const result = addDays(date, 0);
      expect(result.getDate()).toBe(15);
    });

    it('should handle month overflow', () => {
      const date = new Date('2024-03-25T00:00:00Z');
      const result = addDays(date, 10);
      expect(result.getMonth()).toBe(3); // April (0-indexed)
      expect(result.getDate()).toBe(4);
    });

    it('should handle year overflow', () => {
      const date = new Date('2024-12-30T00:00:00Z');
      const result = addDays(date, 5);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(4);
    });

    it('should handle leap year correctly', () => {
      const date = new Date('2024-02-28T00:00:00Z');
      const result = addDays(date, 1);
      expect(result.getDate()).toBe(29); // Feb 29 in leap year
    });

    it('should not mutate the original date', () => {
      const date = new Date('2024-03-15T00:00:00Z');
      const originalDate = date.getDate();
      addDays(date, 5);
      expect(date.getDate()).toBe(originalDate);
    });
  });

  describe('subtractDays', () => {
    it('should subtract days from a date', () => {
      const date = new Date('2024-03-15T00:00:00Z');
      const result = subtractDays(date, 5);
      expect(result.getDate()).toBe(10);
    });

    it('should handle subtracting 0 days', () => {
      const date = new Date('2024-03-15T00:00:00Z');
      const result = subtractDays(date, 0);
      expect(result.getDate()).toBe(15);
    });

    it('should handle month underflow', () => {
      const date = new Date('2024-03-05T00:00:00Z');
      const result = subtractDays(date, 10);
      expect(result.getMonth()).toBe(1); // February (0-indexed)
      expect(result.getDate()).toBe(24);
    });

    it('should handle year underflow', () => {
      const date = new Date('2024-01-05T00:00:00Z');
      const result = subtractDays(date, 10);
      expect(result.getFullYear()).toBe(2023);
      expect(result.getMonth()).toBe(11); // December
      expect(result.getDate()).toBe(26);
    });

    it('should not mutate the original date', () => {
      const date = new Date('2024-03-15T00:00:00Z');
      const originalDate = date.getDate();
      subtractDays(date, 5);
      expect(date.getDate()).toBe(originalDate);
    });
  });
});
