import { Weight, InvalidWeightError } from '../weight.vo';

describe('Weight Value Object', () => {
  describe('creation', () => {
    it('should create valid weight in pounds', () => {
      const weight = Weight.create(100, 'lb');
      expect(weight.getValue()).toBe(100);
      expect(weight.getUnit()).toBe('lb');
    });

    it('should create weight in different units', () => {
      const lb = Weight.create(100, 'lb');
      const oz = Weight.create(100, 'oz');
      const kg = Weight.create(100, 'kg');
      const g = Weight.create(100, 'g');
      const mg = Weight.create(100, 'mg');
      const ton = Weight.create(1, 'ton');

      expect(lb.getUnit()).toBe('lb');
      expect(oz.getUnit()).toBe('oz');
      expect(kg.getUnit()).toBe('kg');
      expect(g.getUnit()).toBe('g');
      expect(mg.getUnit()).toBe('mg');
      expect(ton.getUnit()).toBe('ton');
    });

    it('should default to pounds', () => {
      const weight = Weight.create(100);
      expect(weight.getUnit()).toBe('lb');
    });

    it('should create zero weight', () => {
      const zero = Weight.zero('kg');
      expect(zero.getValue()).toBe(0);
      expect(zero.isZero()).toBe(true);
    });

    it('should create from object', () => {
      const weight = Weight.fromObject({ value: 50, unit: 'kg' });
      expect(weight.getValue()).toBe(50);
      expect(weight.getUnit()).toBe('kg');
    });
  });

  describe('validation errors', () => {
    it('should reject negative weight', () => {
      expect(() => Weight.create(-10, 'lb')).toThrow(InvalidWeightError);
      expect(() => Weight.create(-10, 'lb')).toThrow('Weight must be non-negative');
    });

    it('should reject infinite weight', () => {
      expect(() => Weight.create(Infinity, 'lb')).toThrow(InvalidWeightError);
      expect(() => Weight.create(Infinity, 'lb')).toThrow('Weight must be finite');
    });

    it('should reject NaN weight', () => {
      expect(() => Weight.create(NaN, 'lb')).toThrow(InvalidWeightError);
      expect(() => Weight.create(NaN, 'lb')).toThrow('Weight must be a valid number');
    });

    it('should reject invalid unit', () => {
      expect(() => Weight.create(100, 'invalid' as any)).toThrow(InvalidWeightError);
    });

    it('should reject weight exceeding maximum', () => {
      expect(() => Weight.create(10000000, 'ton')).toThrow(InvalidWeightError);
      expect(() => Weight.create(10000000, 'ton')).toThrow('Weight exceeds maximum allowed value');
    });
  });

  describe('state checking', () => {
    it('should identify zero weight', () => {
      expect(Weight.create(0, 'lb').isZero()).toBe(true);
      expect(Weight.create(1, 'lb').isZero()).toBe(false);
    });
  });

  describe('unit conversion', () => {
    it('should convert pounds to kilograms', () => {
      const weight = Weight.create(100, 'lb');
      const kg = weight.convertTo('kg');

      expect(kg.getUnit()).toBe('kg');
      expect(kg.getValue()).toBeCloseTo(45.36, 1);
    });

    it('should convert kilograms to pounds', () => {
      const weight = Weight.create(45.36, 'kg');
      const lb = weight.convertTo('lb');

      expect(lb.getUnit()).toBe('lb');
      expect(lb.getValue()).toBeCloseTo(100, 0);
    });

    it('should convert ounces to grams', () => {
      const weight = Weight.create(16, 'oz');
      const g = weight.convertTo('g');

      expect(g.getUnit()).toBe('g');
      expect(g.getValue()).toBeCloseTo(453.6, 0);
    });

    it('should return same instance when converting to same unit', () => {
      const weight = Weight.create(100, 'lb');
      const same = weight.convertTo('lb');

      expect(same).toBe(weight);
    });

    it('should get conversion factor', () => {
      const lbToKg = Weight.getConversionFactor('lb', 'kg');
      expect(lbToKg).toBeCloseTo(0.453592, 5);

      const kgToLb = Weight.getConversionFactor('kg', 'lb');
      expect(kgToLb).toBeCloseTo(2.20462, 3);
    });
  });

  describe('arithmetic operations', () => {
    it('should add weights of same unit', () => {
      const a = Weight.create(100, 'lb');
      const b = Weight.create(50, 'lb');
      const result = a.add(b);

      expect(result.getValue()).toBe(150);
      expect(result.getUnit()).toBe('lb');
    });

    it('should add weights of different units', () => {
      const lb = Weight.create(100, 'lb');
      const kg = Weight.create(45.36, 'kg');
      const result = lb.add(kg);

      expect(result.getUnit()).toBe('lb');
      expect(result.getValue()).toBeCloseTo(200, 0);
    });

    it('should subtract weights', () => {
      const a = Weight.create(100, 'lb');
      const b = Weight.create(30, 'lb');
      const result = a.subtract(b);

      expect(result.getValue()).toBe(70);
    });

    it('should reject subtraction resulting in negative', () => {
      const a = Weight.create(50, 'lb');
      const b = Weight.create(100, 'lb');

      expect(() => a.subtract(b)).toThrow(InvalidWeightError);
      expect(() => a.subtract(b)).toThrow('Cannot subtract to negative weight');
    });

    it('should multiply by factor', () => {
      const weight = Weight.create(100, 'lb');
      const result = weight.multiply(2);

      expect(result.getValue()).toBe(200);
    });

    it('should divide by divisor', () => {
      const weight = Weight.create(100, 'lb');
      const result = weight.divide(4);

      expect(result.getValue()).toBe(25);
    });

    it('should reject negative multiplication factor', () => {
      const weight = Weight.create(100, 'lb');
      expect(() => weight.multiply(-1)).toThrow(InvalidWeightError);
    });

    it('should reject division by zero', () => {
      const weight = Weight.create(100, 'lb');
      expect(() => weight.divide(0)).toThrow(InvalidWeightError);
      expect(() => weight.divide(0)).toThrow('Cannot divide by zero');
    });

    it('should reject negative divisor', () => {
      const weight = Weight.create(100, 'lb');
      expect(() => weight.divide(-2)).toThrow(InvalidWeightError);
    });
  });

  describe('comparison operations', () => {
    it('should compare weight values', () => {
      const a = Weight.create(100, 'lb');
      const b = Weight.create(50, 'lb');
      const c = Weight.create(100, 'lb');

      expect(a.compare(b)).toBe(1);
      expect(b.compare(a)).toBe(-1);
      expect(a.compare(c)).toBe(0);
    });

    it('should check equality', () => {
      const a = Weight.create(100, 'lb');
      const b = Weight.create(100, 'lb');
      const c = Weight.create(50, 'lb');

      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });

    it('should check equality across units', () => {
      const lb = Weight.create(100, 'lb');
      const kg = Weight.create(45.359, 'kg');

      expect(lb.equals(kg)).toBe(true);
    });

    it('should check greater than', () => {
      const a = Weight.create(100, 'lb');
      const b = Weight.create(50, 'lb');

      expect(a.greaterThan(b)).toBe(true);
      expect(b.greaterThan(a)).toBe(false);
    });

    it('should check greater than or equal', () => {
      const a = Weight.create(100, 'lb');
      const b = Weight.create(50, 'lb');
      const c = Weight.create(100, 'lb');

      expect(a.greaterThanOrEqual(b)).toBe(true);
      expect(a.greaterThanOrEqual(c)).toBe(true);
      expect(b.greaterThanOrEqual(a)).toBe(false);
    });

    it('should check less than', () => {
      const a = Weight.create(50, 'lb');
      const b = Weight.create(100, 'lb');

      expect(a.lessThan(b)).toBe(true);
      expect(b.lessThan(a)).toBe(false);
    });

    it('should check less than or equal', () => {
      const a = Weight.create(50, 'lb');
      const b = Weight.create(100, 'lb');
      const c = Weight.create(50, 'lb');

      expect(a.lessThanOrEqual(b)).toBe(true);
      expect(a.lessThanOrEqual(c)).toBe(true);
      expect(b.lessThanOrEqual(a)).toBe(false);
    });
  });

  describe('static methods', () => {
    it('should sum array of weights', () => {
      const values = [Weight.create(100, 'lb'), Weight.create(50, 'lb'), Weight.create(25, 'lb')];
      const sum = Weight.sum(values);

      expect(sum.getValue()).toBe(175);
      expect(sum.getUnit()).toBe('lb');
    });

    it('should find minimum weight', () => {
      const min = Weight.min(Weight.create(100, 'lb'), Weight.create(50, 'lb'), Weight.create(75, 'lb'));

      expect(min.getValue()).toBe(50);
    });

    it('should find maximum weight', () => {
      const max = Weight.max(Weight.create(100, 'lb'), Weight.create(50, 'lb'), Weight.create(75, 'lb'));

      expect(max.getValue()).toBe(100);
    });

    it('should reject sum of empty array', () => {
      expect(() => Weight.sum([])).toThrow(InvalidWeightError);
    });

    it('should reject min of empty array', () => {
      expect(() => Weight.min()).toThrow(InvalidWeightError);
    });

    it('should reject max of empty array', () => {
      expect(() => Weight.max()).toThrow(InvalidWeightError);
    });
  });

  describe('formatting', () => {
    it('should format with default options', () => {
      const weight = Weight.create(123.45, 'lb');
      expect(weight.format()).toBe('123.45 lb');
    });

    it('should format without unit', () => {
      const weight = Weight.create(123.45, 'lb');
      expect(weight.format({ includeUnit: false })).toBe('123.45');
    });

    it('should format with custom precision', () => {
      const weight = Weight.create(123.456, 'kg');
      expect(weight.format({ precision: 1 })).toBe('123.5 kg');
    });

    it('should convert to string', () => {
      const weight = Weight.create(100, 'lb');
      expect(weight.toString()).toBe('100.00 lb');
    });

    it('should convert to JSON', () => {
      const weight = Weight.create(100, 'kg');
      const json = weight.toJSON();

      expect(json).toEqual({ value: 100, unit: 'kg' });
    });
  });

  describe('factory methods', () => {
    it('should create weight with create method', () => {
      const weight = Weight.create(100, 'lb');
      expect(weight).toBeInstanceOf(Weight);
    });

    it('should return null for invalid weight with createOrNull', () => {
      const weight = Weight.createOrNull(-10, 'lb');
      expect(weight).toBeNull();
    });

    it('should validate weight with isValid', () => {
      expect(Weight.isValid(100, 'lb')).toBe(true);
      expect(Weight.isValid(-10, 'lb')).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should not modify original after operations', () => {
      const original = Weight.create(100, 'lb');
      const doubled = original.multiply(2);

      expect(original.getValue()).toBe(100);
      expect(doubled.getValue()).toBe(200);
    });

    it('should not modify original after conversion', () => {
      const original = Weight.create(100, 'lb');
      const kg = original.convertTo('kg');

      expect(original.getUnit()).toBe('lb');
      expect(kg.getUnit()).toBe('kg');
    });
  });
});
