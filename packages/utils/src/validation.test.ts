import { isEmail, isPhone, isURL, isEmpty, isUUID } from './validation';

describe('Validation Utilities', () => {
  describe('isEmail', () => {
    it('should validate correct email addresses', () => {
      expect(isEmail('user@example.com')).toBe(true);
      expect(isEmail('test.user@example.com')).toBe(true);
      expect(isEmail('user+tag@example.co.uk')).toBe(true);
      expect(isEmail('user_name@example-domain.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(isEmail('invalid')).toBe(false);
      expect(isEmail('invalid@')).toBe(false);
      expect(isEmail('@example.com')).toBe(false);
      expect(isEmail('invalid@domain')).toBe(false);
      expect(isEmail('invalid @example.com')).toBe(false);
      expect(isEmail('')).toBe(false);
    });

    it('should reject emails with multiple @ symbols', () => {
      expect(isEmail('user@@example.com')).toBe(false);
      expect(isEmail('user@domain@example.com')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isEmail('a@b.c')).toBe(true); // Minimum valid email
      expect(isEmail('user@localhost')).toBe(false); // No TLD
    });
  });

  describe('isPhone', () => {
    it('should validate phone numbers with various formats', () => {
      expect(isPhone('+1234567890')).toBe(true);
      expect(isPhone('1234567890')).toBe(true);
      expect(isPhone('+1 234 567 8900')).toBe(true);
      expect(isPhone('123-456-7890')).toBe(true);
      expect(isPhone('(123) 456-7890')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isPhone('abc123')).toBe(false);
      expect(isPhone('phone')).toBe(false);
      expect(isPhone('')).toBe(false);
      expect(isPhone('123!456')).toBe(false);
    });

    it('should handle international formats', () => {
      expect(isPhone('+44 20 7946 0958')).toBe(true);
      expect(isPhone('+81-3-1234-5678')).toBe(true);
    });
  });

  describe('isURL', () => {
    it('should validate correct URLs', () => {
      expect(isURL('https://example.com')).toBe(true);
      expect(isURL('http://example.com')).toBe(true);
      expect(isURL('https://www.example.com')).toBe(true);
      expect(isURL('https://example.com/path')).toBe(true);
      expect(isURL('https://example.com/path?query=value')).toBe(true);
      expect(isURL('https://example.com:8080')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isURL('not a url')).toBe(false);
      expect(isURL('example.com')).toBe(false);
      expect(isURL('//example.com')).toBe(false);
      expect(isURL('')).toBe(false);
      expect(isURL('ftp://')).toBe(false);
    });

    it('should handle different protocols', () => {
      expect(isURL('ftp://example.com')).toBe(true);
      expect(isURL('ws://example.com')).toBe(true);
      expect(isURL('wss://example.com')).toBe(true);
    });

    it('should handle localhost and IP addresses', () => {
      expect(isURL('http://localhost')).toBe(true);
      expect(isURL('http://localhost:3000')).toBe(true);
      expect(isURL('http://192.168.1.1')).toBe(true);
    });
  });

  describe('isEmpty', () => {
    it('should detect empty values', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
      expect(isEmpty('')).toBe(true);
      expect(isEmpty('   ')).toBe(true);
      expect(isEmpty([])).toBe(true);
      expect(isEmpty({})).toBe(true);
    });

    it('should detect non-empty strings', () => {
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty('  hello  ')).toBe(false);
      expect(isEmpty('0')).toBe(false);
    });

    it('should detect non-empty arrays', () => {
      expect(isEmpty([1, 2, 3])).toBe(false);
      expect(isEmpty([''])).toBe(false);
      expect(isEmpty([null])).toBe(false);
    });

    it('should detect non-empty objects', () => {
      expect(isEmpty({ key: 'value' })).toBe(false);
      expect(isEmpty({ key: null })).toBe(false);
    });

    it('should handle numbers', () => {
      expect(isEmpty(0)).toBe(false);
      expect(isEmpty(1)).toBe(false);
      expect(isEmpty(-1)).toBe(false);
    });

    it('should handle booleans', () => {
      expect(isEmpty(false)).toBe(false);
      expect(isEmpty(true)).toBe(false);
    });
  });

  describe('isUUID', () => {
    it('should validate correct UUIDs', () => {
      expect(isUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('should validate UUIDs with different versions', () => {
      expect(isUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true); // v1
      expect(isUUID('6ba7b811-9dad-21d1-80b4-00c04fd430c8')).toBe(true); // v2
      expect(isUUID('6ba7b812-9dad-31d1-80b4-00c04fd430c8')).toBe(true); // v3
      expect(isUUID('6ba7b813-9dad-41d1-80b4-00c04fd430c8')).toBe(true); // v4
      expect(isUUID('6ba7b814-9dad-51d1-80b4-00c04fd430c8')).toBe(true); // v5
    });

    it('should handle uppercase UUIDs', () => {
      expect(isUUID('123E4567-E89B-12D3-A456-426614174000')).toBe(true);
      expect(isUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(isUUID('not-a-uuid')).toBe(false);
      expect(isUUID('123e4567-e89b-12d3-a456')).toBe(false);
      expect(isUUID('123e4567-e89b-12d3-a456-42661417400g')).toBe(false);
      expect(isUUID('123e4567e89b12d3a456426614174000')).toBe(false); // No hyphens
      expect(isUUID('')).toBe(false);
    });

    it('should reject UUIDs with wrong format', () => {
      expect(isUUID('123e4567-e89b-12d3-a456-4266141740000')).toBe(false); // Too long
      expect(isUUID('123e4567-e89b-12d3-a456-42661417400')).toBe(false); // Too short
      expect(isUUID('123e4567-e89b-62d3-a456-426614174000')).toBe(false); // Invalid version
    });

    it('should validate variant field correctly', () => {
      expect(isUUID('123e4567-e89b-12d3-8456-426614174000')).toBe(true); // Variant 8
      expect(isUUID('123e4567-e89b-12d3-9456-426614174000')).toBe(true); // Variant 9
      expect(isUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true); // Variant a
      expect(isUUID('123e4567-e89b-12d3-b456-426614174000')).toBe(true); // Variant b
      expect(isUUID('123e4567-e89b-12d3-c456-426614174000')).toBe(false); // Invalid variant
    });
  });
});
