import { Dimensions, InvalidDimensionsError } from '../dimensions.vo';

describe('Dimensions Value Object', () => {
  describe('creation', () => {
    it('should create valid dimensions in inches', () => {
      const dims = Dimensions.create(10, 20, 30, 'in');
      expect(dims.getLength()).toBe(10);
      expect(dims.getWidth()).toBe(20);
      expect(dims.getHeight()).toBe(30);
      expect(dims.getUnit()).toBe('in');
    });

    it('should create dimensions in different units', () => {
      const inch = Dimensions.create(10, 20, 30, 'in');
      const cm = Dimensions.create(10, 20, 30, 'cm');
      const mm = Dimensions.create(10, 20, 30, 'mm');
      const ft = Dimensions.create(10, 20, 30, 'ft');
      const m = Dimensions.create(10, 20, 30, 'm');

      expect(inch.getUnit()).toBe('in');
      expect(cm.getUnit()).toBe('cm');
      expect(mm.getUnit()).toBe('mm');
      expect(ft.getUnit()).toBe('ft');
      expect(m.getUnit()).toBe('m');
    });

    it('should default to inches', () => {
      const dims = Dimensions.create(10, 20, 30);
      expect(dims.getUnit()).toBe('in');
    });

    it('should create from object', () => {
      const dims = Dimensions.fromObject({ length: 10, width: 20, height: 30, unit: 'cm' });
      expect(dims.getLength()).toBe(10);
      expect(dims.getWidth()).toBe(20);
      expect(dims.getHeight()).toBe(30);
      expect(dims.getUnit()).toBe('cm');
    });
  });

  describe('validation errors', () => {
    it('should reject zero length', () => {
      expect(() => Dimensions.create(0, 20, 30, 'in')).toThrow(InvalidDimensionsError);
      expect(() => Dimensions.create(0, 20, 30, 'in')).toThrow('All dimensions must be positive');
    });

    it('should reject zero width', () => {
      expect(() => Dimensions.create(10, 0, 30, 'in')).toThrow(InvalidDimensionsError);
    });

    it('should reject zero height', () => {
      expect(() => Dimensions.create(10, 20, 0, 'in')).toThrow(InvalidDimensionsError);
    });

    it('should reject negative dimensions', () => {
      expect(() => Dimensions.create(-10, 20, 30, 'in')).toThrow(InvalidDimensionsError);
      expect(() => Dimensions.create(10, -20, 30, 'in')).toThrow(InvalidDimensionsError);
      expect(() => Dimensions.create(10, 20, -30, 'in')).toThrow(InvalidDimensionsError);
    });

    it('should reject infinite dimensions', () => {
      expect(() => Dimensions.create(Infinity, 20, 30, 'in')).toThrow(InvalidDimensionsError);
      expect(() => Dimensions.create(Infinity, 20, 30, 'in')).toThrow('All dimensions must be finite');
    });

    it('should reject NaN dimensions', () => {
      expect(() => Dimensions.create(NaN, 20, 30, 'in')).toThrow(InvalidDimensionsError);
      expect(() => Dimensions.create(NaN, 20, 30, 'in')).toThrow('All dimensions must be valid numbers');
    });

    it('should reject invalid unit', () => {
      expect(() => Dimensions.create(10, 20, 30, 'invalid' as any)).toThrow(InvalidDimensionsError);
    });

    it('should reject dimensions exceeding maximum', () => {
      expect(() => Dimensions.create(1000000, 20, 30, 'm')).toThrow(InvalidDimensionsError);
      expect(() => Dimensions.create(1000000, 20, 30, 'm')).toThrow('Dimensions exceed maximum allowed value');
    });
  });

  describe('calculations', () => {
    it('should calculate volume', () => {
      const dims = Dimensions.create(10, 20, 30, 'in');
      expect(dims.getVolume()).toBe(6000);
    });

    it('should calculate volume in cubic cm', () => {
      const dims = Dimensions.create(10, 10, 10, 'cm');
      expect(dims.getVolumeCubicCm()).toBe(1000);
    });

    it('should calculate volume in cubic inches', () => {
      const dims = Dimensions.create(10, 10, 10, 'in');
      const volumeCubicInches = dims.getVolumeCubicInches();
      expect(volumeCubicInches).toBeCloseTo(1000, 0);
    });

    it('should get longest side', () => {
      const dims = Dimensions.create(10, 30, 20, 'in');
      expect(dims.getLongestSide()).toBe(30);
    });

    it('should get shortest side', () => {
      const dims = Dimensions.create(10, 30, 20, 'in');
      expect(dims.getShortestSide()).toBe(10);
    });
  });

  describe('unit conversion', () => {
    it('should convert inches to centimeters', () => {
      const dims = Dimensions.create(10, 20, 30, 'in');
      const cm = dims.convertTo('cm');

      expect(cm.getUnit()).toBe('cm');
      expect(cm.getLength()).toBeCloseTo(25.4, 1);
      expect(cm.getWidth()).toBeCloseTo(50.8, 1);
      expect(cm.getHeight()).toBeCloseTo(76.2, 1);
    });

    it('should convert centimeters to inches', () => {
      const dims = Dimensions.create(25.4, 50.8, 76.2, 'cm');
      const inches = dims.convertTo('in');

      expect(inches.getUnit()).toBe('in');
      expect(inches.getLength()).toBeCloseTo(10, 1);
      expect(inches.getWidth()).toBeCloseTo(20, 1);
      expect(inches.getHeight()).toBeCloseTo(30, 1);
    });

    it('should convert feet to meters', () => {
      const dims = Dimensions.create(3.28084, 6.56168, 9.84252, 'ft');
      const meters = dims.convertTo('m');

      expect(meters.getUnit()).toBe('m');
      expect(meters.getLength()).toBeCloseTo(1, 1);
      expect(meters.getWidth()).toBeCloseTo(2, 1);
      expect(meters.getHeight()).toBeCloseTo(3, 1);
    });

    it('should return same instance when converting to same unit', () => {
      const dims = Dimensions.create(10, 20, 30, 'in');
      const same = dims.convertTo('in');

      expect(same).toBe(dims);
    });

    it('should get conversion factor', () => {
      const inchToCm = Dimensions.getConversionFactor('in', 'cm');
      expect(inchToCm).toBeCloseTo(2.54, 2);

      const cmToInch = Dimensions.getConversionFactor('cm', 'in');
      expect(cmToInch).toBeCloseTo(1 / 2.54, 2);
    });
  });

  describe('fitting check', () => {
    it('should check if dimensions fit within container', () => {
      const small = Dimensions.create(10, 20, 30, 'in');
      const large = Dimensions.create(40, 50, 60, 'in');

      expect(small.fitsWithin(large)).toBe(true);
      expect(large.fitsWithin(small)).toBe(false);
    });

    it('should check fit across different units', () => {
      const small = Dimensions.create(10, 20, 30, 'cm');
      const large = Dimensions.create(12, 12, 12, 'in'); // ~30cm each

      expect(small.fitsWithin(large)).toBe(true);
    });

    it('should consider rotation when checking fit', () => {
      const item = Dimensions.create(30, 20, 10, 'in');
      const container = Dimensions.create(10, 20, 30, 'in');

      expect(item.fitsWithin(container)).toBe(true);
    });
  });

  describe('scaling', () => {
    it('should scale dimensions by factor', () => {
      const dims = Dimensions.create(10, 20, 30, 'in');
      const scaled = dims.scale(2);

      expect(scaled.getLength()).toBe(20);
      expect(scaled.getWidth()).toBe(40);
      expect(scaled.getHeight()).toBe(60);
      expect(scaled.getUnit()).toBe('in');
    });

    it('should scale down dimensions', () => {
      const dims = Dimensions.create(10, 20, 30, 'in');
      const scaled = dims.scale(0.5);

      expect(scaled.getLength()).toBe(5);
      expect(scaled.getWidth()).toBe(10);
      expect(scaled.getHeight()).toBe(15);
    });

    it('should reject zero scale factor', () => {
      const dims = Dimensions.create(10, 20, 30, 'in');
      expect(() => dims.scale(0)).toThrow(InvalidDimensionsError);
      expect(() => dims.scale(0)).toThrow('Scale factor must be positive');
    });

    it('should reject negative scale factor', () => {
      const dims = Dimensions.create(10, 20, 30, 'in');
      expect(() => dims.scale(-1)).toThrow(InvalidDimensionsError);
    });

    it('should reject infinite scale factor', () => {
      const dims = Dimensions.create(10, 20, 30, 'in');
      expect(() => dims.scale(Infinity)).toThrow(InvalidDimensionsError);
    });
  });

  describe('equality', () => {
    it('should return true for identical dimensions', () => {
      const dims1 = Dimensions.create(10, 20, 30, 'in');
      const dims2 = Dimensions.create(10, 20, 30, 'in');

      expect(dims1.equals(dims2)).toBe(true);
    });

    it('should return true for dimensions in different units', () => {
      const dims1 = Dimensions.create(10, 20, 30, 'in');
      const dims2 = Dimensions.create(25.4, 50.8, 76.2, 'cm');

      expect(dims1.equals(dims2)).toBe(true);
    });

    it('should return false for different dimensions', () => {
      const dims1 = Dimensions.create(10, 20, 30, 'in');
      const dims2 = Dimensions.create(15, 25, 35, 'in');

      expect(dims1.equals(dims2)).toBe(false);
    });
  });

  describe('formatting', () => {
    it('should format with default options', () => {
      const dims = Dimensions.create(10.5, 20.7, 30.9, 'in');
      expect(dims.format()).toBe('10.50 × 20.70 × 30.90 in');
    });

    it('should format without unit', () => {
      const dims = Dimensions.create(10, 20, 30, 'in');
      expect(dims.format({ includeUnit: false })).toBe('10.00 × 20.00 × 30.00');
    });

    it('should format with custom precision', () => {
      const dims = Dimensions.create(10.123, 20.456, 30.789, 'cm');
      expect(dims.format({ precision: 1 })).toBe('10.1 × 20.5 × 30.8 cm');
    });

    it('should convert to string', () => {
      const dims = Dimensions.create(10, 20, 30, 'in');
      expect(dims.toString()).toBe('10.00 × 20.00 × 30.00 in');
    });

    it('should convert to JSON', () => {
      const dims = Dimensions.create(10, 20, 30, 'cm');
      const json = dims.toJSON();

      expect(json).toEqual({
        length: 10,
        width: 20,
        height: 30,
        unit: 'cm',
      });
    });
  });

  describe('factory methods', () => {
    it('should create dimensions with create method', () => {
      const dims = Dimensions.create(10, 20, 30, 'in');
      expect(dims).toBeInstanceOf(Dimensions);
    });

    it('should return null for invalid dimensions with createOrNull', () => {
      const dims = Dimensions.createOrNull(0, 20, 30, 'in');
      expect(dims).toBeNull();
    });

    it('should validate dimensions with isValid', () => {
      expect(Dimensions.isValid(10, 20, 30, 'in')).toBe(true);
      expect(Dimensions.isValid(0, 20, 30, 'in')).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should not modify original after conversion', () => {
      const original = Dimensions.create(10, 20, 30, 'in');
      const converted = original.convertTo('cm');

      expect(original.getUnit()).toBe('in');
      expect(original.getLength()).toBe(10);
      expect(converted.getUnit()).toBe('cm');
    });

    it('should not modify original after scaling', () => {
      const original = Dimensions.create(10, 20, 30, 'in');
      const scaled = original.scale(2);

      expect(original.getLength()).toBe(10);
      expect(scaled.getLength()).toBe(20);
    });
  });
});
