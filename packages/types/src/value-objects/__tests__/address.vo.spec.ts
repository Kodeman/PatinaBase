import { Address, InvalidAddressError, type AddressComponents } from '../address.vo';

describe('Address Value Object', () => {
  describe('creation - US addresses', () => {
    it('should create valid US address', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const address = Address.create(components);
      expect(address.getStreet1()).toBe('123 Main St');
      expect(address.getCity()).toBe('New York');
      expect(address.getState()).toBe('NY');
      expect(address.getPostalCode()).toBe('10001');
      expect(address.getCountry()).toBe('US');
    });

    it('should create US address with street2', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        street2: 'Apt 4B',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const address = Address.create(components);
      expect(address.getStreet2()).toBe('Apt 4B');
    });

    it('should accept ZIP+4 format', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001-1234',
        country: 'US',
      };

      const address = Address.create(components);
      expect(address.getPostalCode()).toBe('10001-1234');
    });

    it('should normalize state to uppercase', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: 'ny',
        postalCode: '10001',
        country: 'US',
      };

      const address = Address.create(components);
      expect(address.getState()).toBe('NY');
    });

    it('should trim whitespace', () => {
      const components: AddressComponents = {
        street1: '  123 Main St  ',
        city: '  New York  ',
        state: '  NY  ',
        postalCode: '  10001  ',
        country: 'US',
      };

      const address = Address.create(components);
      expect(address.getStreet1()).toBe('123 Main St');
      expect(address.getCity()).toBe('New York');
      expect(address.getState()).toBe('NY');
      expect(address.getPostalCode()).toBe('10001');
    });
  });

  describe('creation - Canadian addresses', () => {
    it('should create valid Canadian address', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'Toronto',
        state: 'ON',
        postalCode: 'M5H 2N2',
        country: 'CA',
      };

      const address = Address.create(components);
      expect(address.getCountry()).toBe('CA');
      expect(address.getState()).toBe('ON');
      expect(address.getPostalCode()).toBe('M5H 2N2');
    });

    it('should accept postal code without space', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'Toronto',
        state: 'ON',
        postalCode: 'M5H2N2',
        country: 'CA',
      };

      const address = Address.create(components);
      expect(address.getPostalCode()).toBe('M5H2N2');
    });

    it('should normalize postal code to uppercase', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'Toronto',
        state: 'ON',
        postalCode: 'm5h 2n2',
        country: 'CA',
      };

      const address = Address.create(components);
      expect(address.getPostalCode()).toBe('M5H 2N2');
    });
  });

  describe('creation - International addresses', () => {
    it('should create UK address', () => {
      const components: AddressComponents = {
        street1: '10 Downing Street',
        city: 'London',
        state: 'England',
        postalCode: 'SW1A 2AA',
        country: 'GB',
      };

      const address = Address.create(components);
      expect(address.getCountry()).toBe('GB');
    });

    it('should create Australian address', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'Sydney',
        state: 'NSW',
        postalCode: '2000',
        country: 'AU',
      };

      const address = Address.create(components);
      expect(address.getCountry()).toBe('AU');
    });

    it('should create international address', () => {
      const components: AddressComponents = {
        street1: '123 Rue de la Paix',
        city: 'Paris',
        state: 'Île-de-France',
        postalCode: '75001',
        country: 'INTL',
      };

      const address = Address.create(components);
      expect(address.getCountry()).toBe('INTL');
    });
  });

  describe('validation errors', () => {
    it('should reject empty street1', () => {
      const components: AddressComponents = {
        street1: '',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      expect(() => Address.create(components)).toThrow(InvalidAddressError);
      expect(() => Address.create(components)).toThrow('Street address is required');
    });

    it('should reject empty city', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: '',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      expect(() => Address.create(components)).toThrow(InvalidAddressError);
      expect(() => Address.create(components)).toThrow('City is required');
    });

    it('should reject empty state', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: '',
        postalCode: '10001',
        country: 'US',
      };

      expect(() => Address.create(components)).toThrow(InvalidAddressError);
      expect(() => Address.create(components)).toThrow('State/Province is required');
    });

    it('should reject empty postal code', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '',
        country: 'US',
      };

      expect(() => Address.create(components)).toThrow(InvalidAddressError);
      expect(() => Address.create(components)).toThrow('Postal code is required');
    });

    it('should reject invalid US state code', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: 'XX',
        postalCode: '10001',
        country: 'US',
      };

      expect(() => Address.create(components)).toThrow(InvalidAddressError);
      expect(() => Address.create(components)).toThrow('Invalid US state code');
    });

    it('should reject invalid US ZIP code', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: 'ABCDE',
        country: 'US',
      };

      expect(() => Address.create(components)).toThrow(InvalidAddressError);
      expect(() => Address.create(components)).toThrow('Invalid US ZIP code format');
    });

    it('should reject invalid Canadian province', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'Toronto',
        state: 'XX',
        postalCode: 'M5H 2N2',
        country: 'CA',
      };

      expect(() => Address.create(components)).toThrow(InvalidAddressError);
      expect(() => Address.create(components)).toThrow('Invalid Canadian province code');
    });

    it('should reject invalid Canadian postal code', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'Toronto',
        state: 'ON',
        postalCode: '12345',
        country: 'CA',
      };

      expect(() => Address.create(components)).toThrow(InvalidAddressError);
      expect(() => Address.create(components)).toThrow('Invalid Canadian postal code format');
    });

    it('should reject invalid UK postal code', () => {
      const components: AddressComponents = {
        street1: '10 Downing Street',
        city: 'London',
        state: 'England',
        postalCode: '12345',
        country: 'GB',
      };

      expect(() => Address.create(components)).toThrow(InvalidAddressError);
      expect(() => Address.create(components)).toThrow('Invalid UK postal code format');
    });

    it('should reject invalid Australian postal code', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'Sydney',
        state: 'NSW',
        postalCode: 'ABCD',
        country: 'AU',
      };

      expect(() => Address.create(components)).toThrow(InvalidAddressError);
      expect(() => Address.create(components)).toThrow('Invalid Australian postal code format');
    });
  });

  describe('formatting', () => {
    it('should format as single line without street2', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const address = Address.create(components);
      expect(address.toSingleLine()).toBe('123 Main St, New York, NY 10001');
    });

    it('should format as single line with street2', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        street2: 'Apt 4B',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const address = Address.create(components);
      expect(address.toSingleLine()).toBe('123 Main St, Apt 4B, New York, NY 10001');
    });

    it('should format as single line with country for non-US', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'Toronto',
        state: 'ON',
        postalCode: 'M5H 2N2',
        country: 'CA',
      };

      const address = Address.create(components);
      expect(address.toSingleLine()).toBe('123 Main St, Toronto, ON M5H 2N2, CA');
    });

    it('should format as multi-line', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        street2: 'Apt 4B',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const address = Address.create(components);
      const expected = '123 Main St\nApt 4B\nNew York, NY 10001';
      expect(address.toMultiLine()).toBe(expected);
    });

    it('should convert to string (single line)', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const address = Address.create(components);
      expect(address.toString()).toBe('123 Main St, New York, NY 10001');
    });
  });

  describe('equality', () => {
    it('should return true for identical addresses', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const addr1 = Address.create(components);
      const addr2 = Address.create(components);
      expect(addr1.equals(addr2)).toBe(true);
    });

    it('should return true for case-insensitive match', () => {
      const addr1 = Address.create({
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      });

      const addr2 = Address.create({
        street1: '123 MAIN ST',
        city: 'NEW YORK',
        state: 'ny',
        postalCode: '10001',
        country: 'US',
      });

      expect(addr1.equals(addr2)).toBe(true);
    });

    it('should return false for different addresses', () => {
      const addr1 = Address.create({
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      });

      const addr2 = Address.create({
        street1: '456 Park Ave',
        city: 'New York',
        state: 'NY',
        postalCode: '10002',
        country: 'US',
      });

      expect(addr1.equals(addr2)).toBe(false);
    });
  });

  describe('comparison methods', () => {
    it('should identify same city', () => {
      const addr1 = Address.create({
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      });

      const addr2 = Address.create({
        street1: '456 Park Ave',
        city: 'New York',
        state: 'NY',
        postalCode: '10002',
        country: 'US',
      });

      expect(addr1.isSameCity(addr2)).toBe(true);
    });

    it('should identify same state', () => {
      const addr1 = Address.create({
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      });

      const addr2 = Address.create({
        street1: '456 Park Ave',
        city: 'Buffalo',
        state: 'NY',
        postalCode: '14201',
        country: 'US',
      });

      expect(addr1.isSameState(addr2)).toBe(true);
    });

    it('should identify same country', () => {
      const addr1 = Address.create({
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      });

      const addr2 = Address.create({
        street1: '456 Park Ave',
        city: 'Los Angeles',
        state: 'CA',
        postalCode: '90001',
        country: 'US',
      });

      expect(addr1.isSameCountry(addr2)).toBe(true);
    });
  });

  describe('getters', () => {
    it('should get all components', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        street2: 'Apt 4B',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const address = Address.create(components);
      const retrieved = address.getComponents();

      expect(retrieved.street1).toBe('123 Main St');
      expect(retrieved.street2).toBe('Apt 4B');
      expect(retrieved.city).toBe('New York');
      expect(retrieved.state).toBe('NY');
      expect(retrieved.postalCode).toBe('10001');
      expect(retrieved.country).toBe('US');
    });

    it('should convert to JSON', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const address = Address.create(components);
      const json = address.toJSON();

      expect(json.street1).toBe('123 Main St');
      expect(json.city).toBe('New York');
      expect(json.state).toBe('NY');
      expect(json.postalCode).toBe('10001');
      expect(json.country).toBe('US');
    });
  });

  describe('factory methods', () => {
    it('should create address with create method', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const address = Address.create(components);
      expect(address).toBeInstanceOf(Address);
    });

    it('should return null for invalid address with createOrNull', () => {
      const components: AddressComponents = {
        street1: '',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const address = Address.createOrNull(components);
      expect(address).toBeNull();
    });

    it('should validate address with isValid', () => {
      const validComponents: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const invalidComponents: AddressComponents = {
        street1: '',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      expect(Address.isValid(validComponents)).toBe(true);
      expect(Address.isValid(invalidComponents)).toBe(false);
    });
  });

  describe('static helper methods', () => {
    it('should get list of US states', () => {
      const states = Address.getUSStates();
      expect(states).toContain('NY');
      expect(states).toContain('CA');
      expect(states).toContain('TX');
      expect(states.length).toBeGreaterThan(50);
    });

    it('should get list of Canadian provinces', () => {
      const provinces = Address.getCAProvinces();
      expect(provinces).toContain('ON');
      expect(provinces).toContain('BC');
      expect(provinces).toContain('QC');
      expect(provinces.length).toBe(13);
    });

    it('should validate US ZIP codes', () => {
      expect(Address.isValidUSZip('10001')).toBe(true);
      expect(Address.isValidUSZip('10001-1234')).toBe(true);
      expect(Address.isValidUSZip('ABCDE')).toBe(false);
      expect(Address.isValidUSZip('1234')).toBe(false);
    });

    it('should validate Canadian postal codes', () => {
      expect(Address.isValidCAPostal('M5H 2N2')).toBe(true);
      expect(Address.isValidCAPostal('M5H2N2')).toBe(true);
      expect(Address.isValidCAPostal('m5h 2n2')).toBe(true);
      expect(Address.isValidCAPostal('12345')).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should be immutable', () => {
      const components: AddressComponents = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const address = Address.create(components);
      const street1 = address.getStreet1();

      // Original values should remain unchanged
      expect(address.getStreet1()).toBe(street1);
    });
  });
});
