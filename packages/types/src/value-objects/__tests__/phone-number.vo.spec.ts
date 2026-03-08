import { PhoneNumber, InvalidPhoneNumberError } from '../phone-number.vo';

describe('PhoneNumber Value Object', () => {
  describe('creation - US numbers', () => {
    it('should create valid US phone number with various formats', () => {
      const formats = [
        '5552234567',
        '555-223-4567',
        '(555) 223-4567',
        '555.223.4567',
        '+1 555 223 4567',
        '1-555-223-4567',
      ];

      formats.forEach((format) => {
        const phone = PhoneNumber.create(format, 'US');
        expect(phone.getDigits()).toBe('5552234567');
      });
    });

    it('should create valid US phone number with country code', () => {
      const phone = PhoneNumber.create('+15552234567', 'US');
      expect(phone.getDigits()).toBe('15552234567');
    });

    it('should trim whitespace', () => {
      const phone = PhoneNumber.create('  555-223-4567  ', 'US');
      expect(phone.getDigits()).toBe('5552234567');
    });
  });

  describe('creation - Canadian numbers', () => {
    it('should create valid Canadian phone number', () => {
      const phone = PhoneNumber.create('416-555-2234', 'CA');
      expect(phone.getDigits()).toBe('4165552234');
      expect(phone.getCountryCode()).toBe('CA');
    });

    it('should create Canadian number with country code', () => {
      const phone = PhoneNumber.create('+1-416-555-2234', 'CA');
      expect(phone.getDigits()).toBe('14165552234');
    });
  });

  describe('creation - International numbers', () => {
    it('should create valid UK phone number', () => {
      const phone = PhoneNumber.create('+442071234567', 'GB');
      expect(phone.getDigits()).toBe('442071234567');
      expect(phone.getCountryCode()).toBe('GB');
    });

    it('should create valid Australian phone number', () => {
      const phone = PhoneNumber.create('+61212345678', 'AU');
      expect(phone.getDigits()).toBe('61212345678');
      expect(phone.getCountryCode()).toBe('AU');
    });

    it('should create international phone number', () => {
      const phone = PhoneNumber.create('+33123456789', 'INTL');
      expect(phone.getDigits()).toBe('33123456789');
      expect(phone.getCountryCode()).toBe('INTL');
    });
  });

  describe('validation errors', () => {
    it('should reject empty phone number', () => {
      expect(() => PhoneNumber.create('', 'US')).toThrow(InvalidPhoneNumberError);
      expect(() => PhoneNumber.create('', 'US')).toThrow('Phone number cannot be empty');
    });

    it('should reject phone number with too few digits', () => {
      expect(() => PhoneNumber.create('123', 'US')).toThrow(InvalidPhoneNumberError);
      expect(() => PhoneNumber.create('123', 'US')).toThrow('at least 10 digits');
    });

    it('should reject phone number with too many digits', () => {
      const longNumber = '1234567890123456'; // 16 digits
      expect(() => PhoneNumber.create(longNumber, 'INTL')).toThrow(InvalidPhoneNumberError);
      expect(() => PhoneNumber.create(longNumber, 'INTL')).toThrow('at most 15 digits');
    });

    it('should reject US number with wrong digit count', () => {
      expect(() => PhoneNumber.create('123456789', 'US')).toThrow(InvalidPhoneNumberError);
      expect(() => PhoneNumber.create('123456789', 'US')).toThrow('10 or 11 digits');
    });

    it('should reject US number with area code starting with 0', () => {
      expect(() => PhoneNumber.create('0551234567', 'US')).toThrow(InvalidPhoneNumberError);
      expect(() => PhoneNumber.create('0551234567', 'US')).toThrow('Area code cannot start with 0 or 1');
    });

    it('should reject US number with area code starting with 1', () => {
      expect(() => PhoneNumber.create('1551234567', 'US')).toThrow(InvalidPhoneNumberError);
      expect(() => PhoneNumber.create('1551234567', 'US')).toThrow('Area code cannot start with 0 or 1');
    });

    it('should reject US number with exchange code starting with 0', () => {
      expect(() => PhoneNumber.create('5550234567', 'US')).toThrow(InvalidPhoneNumberError);
      expect(() => PhoneNumber.create('5550234567', 'US')).toThrow('Exchange code cannot start with 0 or 1');
    });

    it('should reject US number with exchange code starting with 1', () => {
      expect(() => PhoneNumber.create('5551234567', 'US')).toThrow(InvalidPhoneNumberError);
      expect(() => PhoneNumber.create('5551234567', 'US')).toThrow('Exchange code cannot start with 0 or 1');
    });
  });

  describe('formatting', () => {
    it('should format US number correctly', () => {
      const phone = PhoneNumber.create('5552234567', 'US');
      expect(phone.format()).toBe('(555) 223-4567');
    });

    it('should format US number with country code', () => {
      const phone = PhoneNumber.create('15552234567', 'US');
      expect(phone.format()).toBe('(555) 223-4567');
    });

    it('should format Canadian number correctly', () => {
      const phone = PhoneNumber.create('4165552234', 'CA');
      expect(phone.format()).toBe('(416) 555-2234');
    });

    it('should format international number correctly', () => {
      const phone = PhoneNumber.create('+442071234567', 'GB');
      expect(phone.format()).toBe('+442071234567');
    });
  });

  describe('E.164 format', () => {
    it('should convert US number to E.164', () => {
      const phone = PhoneNumber.create('5552234567', 'US');
      expect(phone.toE164()).toBe('+15552234567');
    });

    it('should convert US number with country code to E.164', () => {
      const phone = PhoneNumber.create('15552234567', 'US');
      expect(phone.toE164()).toBe('+15552234567');
    });

    it('should convert Canadian number to E.164', () => {
      const phone = PhoneNumber.create('4165552234', 'CA');
      expect(phone.toE164()).toBe('+14165552234');
    });

    it('should convert international number to E.164', () => {
      const phone = PhoneNumber.create('+442071234567', 'GB');
      expect(phone.toE164()).toBe('+442071234567');
    });
  });

  describe('getters', () => {
    it('should get digits only', () => {
      const phone = PhoneNumber.create('(555) 223-4567', 'US');
      expect(phone.getDigits()).toBe('5552234567');
    });

    it('should get country code', () => {
      const phone = PhoneNumber.create('5552234567', 'US');
      expect(phone.getCountryCode()).toBe('US');
    });

    it('should get area code for US number', () => {
      const phone = PhoneNumber.create('5552234567', 'US');
      expect(phone.getAreaCode()).toBe('555');
    });

    it('should get area code for Canadian number', () => {
      const phone = PhoneNumber.create('4165552234', 'CA');
      expect(phone.getAreaCode()).toBe('416');
    });

    it('should return null area code for international number', () => {
      const phone = PhoneNumber.create('+442071234567', 'GB');
      expect(phone.getAreaCode()).toBeNull();
    });
  });

  describe('equality', () => {
    it('should return true for identical phone numbers', () => {
      const phone1 = PhoneNumber.create('5552234567', 'US');
      const phone2 = PhoneNumber.create('555-223-4567', 'US');
      expect(phone1.equals(phone2)).toBe(true);
    });

    it('should return false for different phone numbers', () => {
      const phone1 = PhoneNumber.create('5552234567', 'US');
      const phone2 = PhoneNumber.create('5559876543', 'US');
      expect(phone1.equals(phone2)).toBe(false);
    });

    it('should return false for different country codes', () => {
      const phone1 = PhoneNumber.create('5552234567', 'US');
      const phone2 = PhoneNumber.create('5552234567', 'CA');
      expect(phone1.equals(phone2)).toBe(true); // Same digits
    });
  });

  describe('string conversion', () => {
    it('should convert to string (formatted)', () => {
      const phone = PhoneNumber.create('5552234567', 'US');
      expect(phone.toString()).toBe('(555) 223-4567');
    });

    it('should convert to JSON (E.164)', () => {
      const phone = PhoneNumber.create('5552234567', 'US');
      expect(phone.toJSON()).toBe('+15552234567');
    });
  });

  describe('factory methods', () => {
    it('should create phone number with create method', () => {
      const phone = PhoneNumber.create('5552234567', 'US');
      expect(phone).toBeInstanceOf(PhoneNumber);
      expect(phone.getDigits()).toBe('5552234567');
    });

    it('should return null for invalid phone with createOrNull', () => {
      const phone = PhoneNumber.createOrNull('123', 'US');
      expect(phone).toBeNull();
    });

    it('should return phone for valid phone with createOrNull', () => {
      const phone = PhoneNumber.createOrNull('5552234567', 'US');
      expect(phone).toBeInstanceOf(PhoneNumber);
      expect(phone?.getDigits()).toBe('5552234567');
    });

    it('should validate phone format with isValid', () => {
      expect(PhoneNumber.isValid('5552234567', 'US')).toBe(true);
      expect(PhoneNumber.isValid('123', 'US')).toBe(false);
    });
  });

  describe('country code detection', () => {
    it('should detect US country code from +1 prefix', () => {
      expect(PhoneNumber.detectCountryCode('+15552234567')).toBe('US');
    });

    it('should detect US country code from 1 prefix', () => {
      expect(PhoneNumber.detectCountryCode('15552234567')).toBe('US');
    });

    it('should detect US country code from NANP format', () => {
      expect(PhoneNumber.detectCountryCode('555-223-4567')).toBe('US');
    });

    it('should detect GB country code from +44 prefix', () => {
      expect(PhoneNumber.detectCountryCode('+442071234567')).toBe('GB');
    });

    it('should detect AU country code from +61 prefix', () => {
      expect(PhoneNumber.detectCountryCode('+61212345678')).toBe('AU');
    });

    it('should default to INTL for unknown format', () => {
      expect(PhoneNumber.detectCountryCode('+33123456789')).toBe('INTL');
    });
  });

  describe('auto-detect creation', () => {
    it('should create US phone with auto-detect', () => {
      const phone = PhoneNumber.createWithAutoDetect('+15552234567');
      expect(phone.getCountryCode()).toBe('US');
      expect(phone.getDigits()).toBe('15552234567');
    });

    it('should create GB phone with auto-detect', () => {
      const phone = PhoneNumber.createWithAutoDetect('+442071234567');
      expect(phone.getCountryCode()).toBe('GB');
      expect(phone.getDigits()).toBe('442071234567');
    });

    it('should create NANP phone with auto-detect', () => {
      const phone = PhoneNumber.createWithAutoDetect('(555) 223-4567');
      expect(phone.getCountryCode()).toBe('US');
    });
  });

  describe('immutability', () => {
    it('should be immutable', () => {
      const phone = PhoneNumber.create('5552234567', 'US');
      const digits = phone.getDigits();

      // Attempting to modify should not affect original
      expect(phone.getDigits()).toBe(digits);
    });
  });
});
