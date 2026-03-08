import {
  formatPrice,
  parsePrice,
  isValidPrice,
  roundPrice,
  calculatePercentage,
  applyDiscount,
  applyDiscountAmount,
  calculateTax,
  calculateOrderTotal,
  isValidCurrencyCode,
  isSupportedCurrency,
  centsToDollars,
  dollarsToCents,
  formatPriceRange,
  classifyBudgetBand,
  getBudgetBandRange,
  SUPPORTED_CURRENCIES,
} from './currency';

describe('Currency Utilities', () => {
  describe('formatPrice', () => {
    it('should format USD prices by default', () => {
      expect(formatPrice(1234.56)).toMatch(/\$1,234\.56/);
    });

    it('should format zero price', () => {
      expect(formatPrice(0)).toMatch(/\$0\.00/);
    });

    it('should format EUR prices', () => {
      const result = formatPrice(1234.56, 'EUR');
      expect(result).toMatch(/1,234\.56/);
      expect(result).toMatch(/€/);
    });

    it('should format GBP prices', () => {
      const result = formatPrice(1234.56, 'GBP');
      expect(result).toMatch(/£1,234\.56/);
    });

    it('should handle invalid currency with fallback', () => {
      const result = formatPrice(1234.56, 'XXX');
      // Invalid currencies show generic currency symbol (¤) with comma separator
      expect(result).toMatch(/1,234\.56/);
    });

    it('should always show 2 decimal places', () => {
      expect(formatPrice(100)).toMatch(/100\.00/);
    });

    it('should handle negative prices', () => {
      const result = formatPrice(-50);
      expect(result).toMatch(/-\$50\.00|\$-50\.00/);
    });

    it('should use custom locale', () => {
      const result = formatPrice(1234.56, 'USD', 'de-DE');
      expect(result).toMatch(/1\.234,56|1,234\.56/);
    });
  });

  describe('parsePrice', () => {
    it('should parse currency strings to numbers', () => {
      expect(parsePrice('$1,234.56')).toBe(1234.56);
      expect(parsePrice('1234.56')).toBe(1234.56);
      expect(parsePrice('€1,234.56')).toBe(1234.56);
    });

    it('should handle negative prices', () => {
      expect(parsePrice('-$50.00')).toBe(-50.00);
      expect(parsePrice('$-50.00')).toBe(-50.00);
    });

    it('should return null for invalid strings', () => {
      expect(parsePrice('invalid')).toBeNull();
      expect(parsePrice('abc')).toBeNull();
      expect(parsePrice('')).toBeNull();
    });

    it('should handle prices without currency symbols', () => {
      expect(parsePrice('100')).toBe(100);
      expect(parsePrice('100.50')).toBe(100.5);
    });

    it('should handle prices with spaces', () => {
      expect(parsePrice('$ 1,234.56')).toBe(1234.56);
      expect(parsePrice('1 234.56')).toBe(1234.56);
    });
  });

  describe('isValidPrice', () => {
    it('should validate non-negative numbers', () => {
      expect(isValidPrice(0)).toBe(true);
      expect(isValidPrice(100)).toBe(true);
      expect(isValidPrice(0.01)).toBe(true);
    });

    it('should reject negative numbers', () => {
      expect(isValidPrice(-1)).toBe(false);
      expect(isValidPrice(-0.01)).toBe(false);
    });

    it('should reject NaN', () => {
      expect(isValidPrice(NaN)).toBe(false);
    });

    it('should reject Infinity', () => {
      expect(isValidPrice(Infinity)).toBe(false);
      expect(isValidPrice(-Infinity)).toBe(false);
    });

    it('should reject non-numbers', () => {
      expect(isValidPrice('100' as unknown as number)).toBe(false);
      expect(isValidPrice(null as unknown as number)).toBe(false);
      expect(isValidPrice(undefined as unknown as number)).toBe(false);
    });
  });

  describe('roundPrice', () => {
    it('should round to 2 decimal places', () => {
      expect(roundPrice(1.234)).toBe(1.23);
      expect(roundPrice(1.235)).toBe(1.24);
      expect(roundPrice(1.236)).toBe(1.24);
    });

    it('should handle whole numbers', () => {
      expect(roundPrice(100)).toBe(100);
      expect(roundPrice(100.00)).toBe(100);
    });

    it('should handle already rounded numbers', () => {
      expect(roundPrice(1.23)).toBe(1.23);
    });

    it('should handle very small numbers', () => {
      expect(roundPrice(0.001)).toBe(0);
      expect(roundPrice(0.005)).toBe(0.01);
    });
  });

  describe('calculatePercentage', () => {
    it('should calculate percentage correctly', () => {
      expect(calculatePercentage(25, 100)).toBe(25);
      expect(calculatePercentage(50, 200)).toBe(25);
      expect(calculatePercentage(1, 3)).toBeCloseTo(33.33, 2);
    });

    it('should return 0 for zero total', () => {
      expect(calculatePercentage(100, 0)).toBe(0);
    });

    it('should handle zero part', () => {
      expect(calculatePercentage(0, 100)).toBe(0);
    });

    it('should handle decimal results', () => {
      expect(calculatePercentage(1, 6)).toBeCloseTo(16.67, 2);
    });
  });

  describe('applyDiscount', () => {
    it('should apply discount percentage correctly', () => {
      expect(applyDiscount(100, 10)).toBe(90);
      expect(applyDiscount(100, 50)).toBe(50);
      expect(applyDiscount(100, 100)).toBe(0);
    });

    it('should round result to 2 decimals', () => {
      expect(applyDiscount(99.99, 10)).toBe(89.99);
    });

    it('should handle 0 discount', () => {
      expect(applyDiscount(100, 0)).toBe(100);
    });

    it('should throw error for negative discount', () => {
      expect(() => applyDiscount(100, -10)).toThrow('Discount percentage must be between 0 and 100');
    });

    it('should throw error for discount over 100', () => {
      expect(() => applyDiscount(100, 101)).toThrow('Discount percentage must be between 0 and 100');
    });

    it('should handle fractional percentages', () => {
      expect(applyDiscount(100, 12.5)).toBe(87.5);
    });
  });

  describe('applyDiscountAmount', () => {
    it('should apply discount amount correctly', () => {
      expect(applyDiscountAmount(100, 10)).toBe(90);
      expect(applyDiscountAmount(100, 50)).toBe(50);
    });

    it('should not go below zero', () => {
      expect(applyDiscountAmount(100, 150)).toBe(0);
    });

    it('should handle zero discount', () => {
      expect(applyDiscountAmount(100, 0)).toBe(100);
    });

    it('should round result to 2 decimals', () => {
      expect(applyDiscountAmount(99.99, 10.5)).toBe(89.49);
    });
  });

  describe('calculateTax', () => {
    it('should calculate tax correctly', () => {
      expect(calculateTax(100, 0.1)).toBe(10);
      expect(calculateTax(100, 0.15)).toBe(15);
      expect(calculateTax(100, 0.075)).toBe(7.5);
    });

    it('should handle zero tax rate', () => {
      expect(calculateTax(100, 0)).toBe(0);
    });

    it('should round result to 2 decimals', () => {
      expect(calculateTax(99.99, 0.13)).toBe(13);
    });

    it('should throw error for negative tax rate', () => {
      expect(() => calculateTax(100, -0.1)).toThrow('Tax rate cannot be negative');
    });

    it('should handle high tax rates', () => {
      expect(calculateTax(100, 0.5)).toBe(50);
    });
  });

  describe('calculateOrderTotal', () => {
    it('should calculate order total correctly', () => {
      expect(calculateOrderTotal(100, 10, 5, 0)).toBe(115);
      expect(calculateOrderTotal(100, 10, 5, 10)).toBe(105);
    });

    it('should handle default values', () => {
      expect(calculateOrderTotal(100, 10)).toBe(110);
    });

    it('should handle all parameters as zero except subtotal', () => {
      expect(calculateOrderTotal(100, 0, 0, 0)).toBe(100);
    });

    it('should round result to 2 decimals', () => {
      expect(calculateOrderTotal(99.99, 13.5, 5.25, 10)).toBe(108.74);
    });

    it('should handle large discounts', () => {
      expect(calculateOrderTotal(100, 10, 5, 120)).toBe(-5);
    });
  });

  describe('isValidCurrencyCode', () => {
    it('should validate 3-letter uppercase codes', () => {
      expect(isValidCurrencyCode('USD')).toBe(true);
      expect(isValidCurrencyCode('EUR')).toBe(true);
      expect(isValidCurrencyCode('GBP')).toBe(true);
    });

    it('should reject invalid codes', () => {
      expect(isValidCurrencyCode('US')).toBe(false);
      expect(isValidCurrencyCode('USDA')).toBe(false);
      expect(isValidCurrencyCode('usd')).toBe(false);
      expect(isValidCurrencyCode('123')).toBe(false);
      expect(isValidCurrencyCode('')).toBe(false);
    });
  });

  describe('isSupportedCurrency', () => {
    it('should validate supported currencies', () => {
      expect(isSupportedCurrency('USD')).toBe(true);
      expect(isSupportedCurrency('CAD')).toBe(true);
      expect(isSupportedCurrency('EUR')).toBe(true);
      expect(isSupportedCurrency('GBP')).toBe(true);
      expect(isSupportedCurrency('AUD')).toBe(true);
    });

    it('should reject unsupported currencies', () => {
      expect(isSupportedCurrency('JPY')).toBe(false);
      expect(isSupportedCurrency('CHF')).toBe(false);
      expect(isSupportedCurrency('XXX')).toBe(false);
    });

    it('should check all supported currencies', () => {
      SUPPORTED_CURRENCIES.forEach(currency => {
        expect(isSupportedCurrency(currency)).toBe(true);
      });
    });
  });

  describe('centsToDollars', () => {
    it('should convert cents to dollars', () => {
      expect(centsToDollars(100)).toBe(1);
      expect(centsToDollars(1000)).toBe(10);
      expect(centsToDollars(1050)).toBe(10.5);
    });

    it('should handle zero', () => {
      expect(centsToDollars(0)).toBe(0);
    });

    it('should round to 2 decimals', () => {
      expect(centsToDollars(123)).toBe(1.23);
    });

    it('should handle single cent', () => {
      expect(centsToDollars(1)).toBe(0.01);
    });
  });

  describe('dollarsToCents', () => {
    it('should convert dollars to cents', () => {
      expect(dollarsToCents(1)).toBe(100);
      expect(dollarsToCents(10)).toBe(1000);
      expect(dollarsToCents(10.5)).toBe(1050);
    });

    it('should handle zero', () => {
      expect(dollarsToCents(0)).toBe(0);
    });

    it('should round to whole cents', () => {
      expect(dollarsToCents(1.234)).toBe(123);
      expect(dollarsToCents(1.235)).toBe(124);
    });

    it('should handle fractional cents', () => {
      expect(dollarsToCents(0.01)).toBe(1);
      expect(dollarsToCents(0.001)).toBe(0);
    });
  });

  describe('formatPriceRange', () => {
    it('should format price range', () => {
      const result = formatPriceRange(100, 200);
      expect(result).toMatch(/\$100\.00.*\$200\.00/);
    });

    it('should format single price when min equals max', () => {
      const result = formatPriceRange(100, 100);
      expect(result).toMatch(/\$100\.00/);
      expect(result).not.toMatch(/-/);
    });

    it('should handle different currencies', () => {
      const result = formatPriceRange(100, 200, 'EUR');
      expect(result).toMatch(/100\.00.*200\.00/);
      expect(result).toMatch(/€/);
    });

    it('should handle custom locale', () => {
      const result = formatPriceRange(100, 200, 'USD', 'de-DE');
      expect(result).toMatch(/100.*200/);
    });
  });

  describe('classifyBudgetBand', () => {
    it('should classify starter budget', () => {
      expect(classifyBudgetBand(0)).toBe('starter');
      expect(classifyBudgetBand(500)).toBe('starter');
      expect(classifyBudgetBand(999)).toBe('starter');
    });

    it('should classify moderate budget', () => {
      expect(classifyBudgetBand(1000)).toBe('moderate');
      expect(classifyBudgetBand(3000)).toBe('moderate');
      expect(classifyBudgetBand(4999)).toBe('moderate');
    });

    it('should classify comfort budget', () => {
      expect(classifyBudgetBand(5000)).toBe('comfort');
      expect(classifyBudgetBand(10000)).toBe('comfort');
      expect(classifyBudgetBand(14999)).toBe('comfort');
    });

    it('should classify premium budget', () => {
      expect(classifyBudgetBand(15000)).toBe('premium');
      expect(classifyBudgetBand(30000)).toBe('premium');
      expect(classifyBudgetBand(49999)).toBe('premium');
    });

    it('should classify luxury budget', () => {
      expect(classifyBudgetBand(50000)).toBe('luxury');
      expect(classifyBudgetBand(100000)).toBe('luxury');
      expect(classifyBudgetBand(1000000)).toBe('luxury');
    });
  });

  describe('getBudgetBandRange', () => {
    it('should return starter range', () => {
      const range = getBudgetBandRange('starter');
      expect(range).toEqual({ min: 0, max: 999 });
    });

    it('should return moderate range', () => {
      const range = getBudgetBandRange('moderate');
      expect(range).toEqual({ min: 1000, max: 4999 });
    });

    it('should return comfort range', () => {
      const range = getBudgetBandRange('comfort');
      expect(range).toEqual({ min: 5000, max: 14999 });
    });

    it('should return premium range', () => {
      const range = getBudgetBandRange('premium');
      expect(range).toEqual({ min: 15000, max: 49999 });
    });

    it('should return luxury range with no max', () => {
      const range = getBudgetBandRange('luxury');
      expect(range).toEqual({ min: 50000, max: null });
    });

    it('should have consistent ranges with classifyBudgetBand', () => {
      const bands = ['starter', 'moderate', 'comfort', 'premium', 'luxury'] as const;

      bands.forEach(band => {
        const range = getBudgetBandRange(band);
        expect(classifyBudgetBand(range.min)).toBe(band);
        if (range.max !== null) {
          expect(classifyBudgetBand(range.max)).toBe(band);
        }
      });
    });
  });
});
