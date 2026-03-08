import { Money, InvalidMoneyError, CurrencyMismatchError } from '../money.vo';

describe('Money Value Object', () => {
  describe('creation', () => {
    it('should create valid money object', () => {
      const money = Money.create(100.5, 'USD');
      expect(money.getAmount()).toBe(100.5);
      expect(money.getCurrency()).toBe('USD');
    });

    it('should round to currency decimal places', () => {
      const money = Money.create(100.999, 'USD');
      expect(money.getAmount()).toBe(101.0);
    });

    it('should create with different currencies', () => {
      const usd = Money.create(100, 'USD');
      const eur = Money.create(100, 'EUR');
      const gbp = Money.create(100, 'GBP');

      expect(usd.getCurrency()).toBe('USD');
      expect(eur.getCurrency()).toBe('EUR');
      expect(gbp.getCurrency()).toBe('GBP');
    });

    it('should create zero money', () => {
      const zero = Money.zero('USD');
      expect(zero.getAmount()).toBe(0);
      expect(zero.isZero()).toBe(true);
    });

    it('should create from cents', () => {
      const money = Money.fromCents(12345, 'USD');
      expect(money.getAmount()).toBe(123.45);
    });

    it('should create from string', () => {
      const money = Money.fromString('$123.45', 'USD');
      expect(money.getAmount()).toBe(123.45);
    });

    it('should create negative money', () => {
      const money = Money.create(-50, 'USD');
      expect(money.getAmount()).toBe(-50);
      expect(money.isNegative()).toBe(true);
    });
  });

  describe('validation errors', () => {
    it('should reject infinite amount', () => {
      expect(() => Money.create(Infinity, 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.create(Infinity, 'USD')).toThrow('Amount must be finite');
    });

    it('should reject NaN amount', () => {
      expect(() => Money.create(NaN, 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.create(NaN, 'USD')).toThrow('Amount cannot be NaN');
    });

    it('should reject invalid currency', () => {
      expect(() => Money.create(100, 'INVALID' as any)).toThrow(InvalidMoneyError);
    });

    it('should reject unparseable string', () => {
      expect(() => Money.fromString('invalid', 'USD')).toThrow(InvalidMoneyError);
    });
  });

  describe('state checking', () => {
    it('should identify zero amount', () => {
      expect(Money.create(0, 'USD').isZero()).toBe(true);
      expect(Money.create(1, 'USD').isZero()).toBe(false);
    });

    it('should identify positive amount', () => {
      expect(Money.create(100, 'USD').isPositive()).toBe(true);
      expect(Money.create(0, 'USD').isPositive()).toBe(false);
      expect(Money.create(-100, 'USD').isPositive()).toBe(false);
    });

    it('should identify negative amount', () => {
      expect(Money.create(-100, 'USD').isNegative()).toBe(true);
      expect(Money.create(0, 'USD').isNegative()).toBe(false);
      expect(Money.create(100, 'USD').isNegative()).toBe(false);
    });
  });

  describe('arithmetic operations', () => {
    it('should add money of same currency', () => {
      const a = Money.create(100, 'USD');
      const b = Money.create(50, 'USD');
      const result = a.add(b);
      expect(result.getAmount()).toBe(150);
    });

    it('should subtract money of same currency', () => {
      const a = Money.create(100, 'USD');
      const b = Money.create(30, 'USD');
      const result = a.subtract(b);
      expect(result.getAmount()).toBe(70);
    });

    it('should multiply by factor', () => {
      const money = Money.create(100, 'USD');
      const result = money.multiply(1.5);
      expect(result.getAmount()).toBe(150);
    });

    it('should divide by divisor', () => {
      const money = Money.create(100, 'USD');
      const result = money.divide(4);
      expect(result.getAmount()).toBe(25);
    });

    it('should get absolute value', () => {
      const money = Money.create(-100, 'USD');
      const result = money.abs();
      expect(result.getAmount()).toBe(100);
    });

    it('should negate amount', () => {
      const money = Money.create(100, 'USD');
      const result = money.negate();
      expect(result.getAmount()).toBe(-100);
    });

    it('should reject adding different currencies', () => {
      const usd = Money.create(100, 'USD');
      const eur = Money.create(50, 'EUR');
      expect(() => usd.add(eur)).toThrow(CurrencyMismatchError);
    });

    it('should reject subtracting different currencies', () => {
      const usd = Money.create(100, 'USD');
      const eur = Money.create(50, 'EUR');
      expect(() => usd.subtract(eur)).toThrow(CurrencyMismatchError);
    });

    it('should reject division by zero', () => {
      const money = Money.create(100, 'USD');
      expect(() => money.divide(0)).toThrow(InvalidMoneyError);
      expect(() => money.divide(0)).toThrow('Cannot divide by zero');
    });

    it('should reject multiplication by invalid factor', () => {
      const money = Money.create(100, 'USD');
      expect(() => money.multiply(NaN)).toThrow(InvalidMoneyError);
      expect(() => money.multiply(Infinity)).toThrow(InvalidMoneyError);
    });
  });

  describe('comparison operations', () => {
    it('should compare money values', () => {
      const a = Money.create(100, 'USD');
      const b = Money.create(50, 'USD');
      const c = Money.create(100, 'USD');

      expect(a.compare(b)).toBe(1);
      expect(b.compare(a)).toBe(-1);
      expect(a.compare(c)).toBe(0);
    });

    it('should check equality', () => {
      const a = Money.create(100, 'USD');
      const b = Money.create(100, 'USD');
      const c = Money.create(50, 'USD');

      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });

    it('should check greater than', () => {
      const a = Money.create(100, 'USD');
      const b = Money.create(50, 'USD');

      expect(a.greaterThan(b)).toBe(true);
      expect(b.greaterThan(a)).toBe(false);
    });

    it('should check greater than or equal', () => {
      const a = Money.create(100, 'USD');
      const b = Money.create(50, 'USD');
      const c = Money.create(100, 'USD');

      expect(a.greaterThanOrEqual(b)).toBe(true);
      expect(a.greaterThanOrEqual(c)).toBe(true);
      expect(b.greaterThanOrEqual(a)).toBe(false);
    });

    it('should check less than', () => {
      const a = Money.create(50, 'USD');
      const b = Money.create(100, 'USD');

      expect(a.lessThan(b)).toBe(true);
      expect(b.lessThan(a)).toBe(false);
    });

    it('should check less than or equal', () => {
      const a = Money.create(50, 'USD');
      const b = Money.create(100, 'USD');
      const c = Money.create(50, 'USD');

      expect(a.lessThanOrEqual(b)).toBe(true);
      expect(a.lessThanOrEqual(c)).toBe(true);
      expect(b.lessThanOrEqual(a)).toBe(false);
    });

    it('should reject comparing different currencies', () => {
      const usd = Money.create(100, 'USD');
      const eur = Money.create(50, 'EUR');

      expect(() => usd.compare(eur)).toThrow(CurrencyMismatchError);
      expect(() => usd.greaterThan(eur)).toThrow(CurrencyMismatchError);
    });
  });

  describe('allocation', () => {
    it('should allocate money by ratios', () => {
      const money = Money.create(100, 'USD');
      const parts = money.allocate([1, 1, 1]);

      expect(parts).toHaveLength(3);
      expect(parts[0].getAmount()).toBeCloseTo(33.33, 2);
      expect(parts[1].getAmount()).toBeCloseTo(33.33, 2);
      expect(parts[2].getAmount()).toBeCloseTo(33.34, 2);

      // Sum should equal original
      const sum = parts.reduce((s, p) => s.add(p), Money.zero('USD'));
      expect(sum.equals(money)).toBe(true);
    });

    it('should allocate by different ratios', () => {
      const money = Money.create(100, 'USD');
      const parts = money.allocate([7, 3]);

      expect(parts).toHaveLength(2);
      expect(parts[0].getAmount()).toBe(70);
      expect(parts[1].getAmount()).toBe(30);
    });

    it('should reject allocation with empty ratios', () => {
      const money = Money.create(100, 'USD');
      expect(() => money.allocate([])).toThrow(InvalidMoneyError);
    });

    it('should reject allocation with negative ratios', () => {
      const money = Money.create(100, 'USD');
      expect(() => money.allocate([1, -1])).toThrow(InvalidMoneyError);
    });

    it('should reject allocation with zero total ratio', () => {
      const money = Money.create(100, 'USD');
      expect(() => money.allocate([0, 0])).toThrow(InvalidMoneyError);
    });
  });

  describe('static methods', () => {
    it('should sum array of money values', () => {
      const values = [Money.create(100, 'USD'), Money.create(50, 'USD'), Money.create(25, 'USD')];
      const sum = Money.sum(values);
      expect(sum.getAmount()).toBe(175);
    });

    it('should find minimum value', () => {
      const min = Money.min(Money.create(100, 'USD'), Money.create(50, 'USD'), Money.create(75, 'USD'));
      expect(min.getAmount()).toBe(50);
    });

    it('should find maximum value', () => {
      const max = Money.max(Money.create(100, 'USD'), Money.create(50, 'USD'), Money.create(75, 'USD'));
      expect(max.getAmount()).toBe(100);
    });

    it('should reject sum of empty array', () => {
      expect(() => Money.sum([])).toThrow(InvalidMoneyError);
    });

    it('should reject min of empty array', () => {
      expect(() => Money.min()).toThrow(InvalidMoneyError);
    });

    it('should reject max of empty array', () => {
      expect(() => Money.max()).toThrow(InvalidMoneyError);
    });
  });

  describe('formatting', () => {
    it('should format with default options', () => {
      const money = Money.create(123.45, 'USD');
      expect(money.format()).toBe('$123.45');
    });

    it('should format without symbol', () => {
      const money = Money.create(123.45, 'USD');
      expect(money.format({ showSymbol: false })).toBe('123.45');
    });

    it('should format with custom decimals', () => {
      const money = Money.create(123.456, 'USD');
      expect(money.format({ decimals: 3 })).toBe('$123.456');
    });

    it('should format different currencies', () => {
      const usd = Money.create(100, 'USD');
      const eur = Money.create(100, 'EUR');
      const gbp = Money.create(100, 'GBP');

      expect(usd.format()).toBe('$100.00');
      expect(eur.format()).toBe('€100.00');
      expect(gbp.format()).toBe('£100.00');
    });

    it('should format negative amounts', () => {
      const money = Money.create(-50, 'USD');
      expect(money.format()).toBe('$-50.00');
    });

    it('should convert to string', () => {
      const money = Money.create(123.45, 'USD');
      expect(money.toString()).toBe('$123.45');
    });

    it('should convert to JSON', () => {
      const money = Money.create(123.45, 'USD');
      const json = money.toJSON();
      expect(json).toEqual({ amount: 123.45, currency: 'USD' });
    });
  });

  describe('currency symbols', () => {
    it('should get correct currency symbol', () => {
      expect(Money.create(100, 'USD').getCurrencySymbol()).toBe('$');
      expect(Money.create(100, 'EUR').getCurrencySymbol()).toBe('€');
      expect(Money.create(100, 'GBP').getCurrencySymbol()).toBe('£');
      expect(Money.create(100, 'CAD').getCurrencySymbol()).toBe('CA$');
      expect(Money.create(100, 'AUD').getCurrencySymbol()).toBe('A$');
    });
  });

  describe('immutability', () => {
    it('should not modify original after operations', () => {
      const original = Money.create(100, 'USD');
      const doubled = original.multiply(2);

      expect(original.getAmount()).toBe(100);
      expect(doubled.getAmount()).toBe(200);
    });

    it('should create new instance on add', () => {
      const a = Money.create(100, 'USD');
      const b = Money.create(50, 'USD');
      const result = a.add(b);

      expect(result).not.toBe(a);
      expect(result).not.toBe(b);
      expect(a.getAmount()).toBe(100);
      expect(b.getAmount()).toBe(50);
    });
  });
});
