import {
  generateToken,
  generateUUID,
  sha256,
  sha512,
  hmacSha256,
  verifyHmac,
  timingSafeEqual,
  hashSensitiveData,
  generateSlugId,
  maskString,
  maskEmail,
  maskCardNumber,
  generateIdempotencyKey,
  secureRandomInt,
  secureRandomPasswordCharacter,
  generateIdentifierSuffix,
} from './crypto';

describe('Crypto Utilities', () => {
  describe('generateToken', () => {
    it('should generate token with default length', () => {
      const token = generateToken();
      expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate token with custom length', () => {
      const token = generateToken(16);
      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate unique tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(token1).not.toBe(token2);
    });

    it('should handle small lengths', () => {
      const token = generateToken(1);
      expect(token).toHaveLength(2); // 1 byte = 2 hex chars
    });
  });

  describe('generateUUID', () => {
    it('should generate valid UUID v4 format', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('should generate unique UUIDs', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      expect(uuid1).not.toBe(uuid2);
    });

    it('should have version 4 indicator', () => {
      const uuid = generateUUID();
      expect(uuid.charAt(14)).toBe('4');
    });

    it('should have valid variant', () => {
      const uuid = generateUUID();
      const variant = uuid.charAt(19);
      expect(['8', '9', 'a', 'b']).toContain(variant);
    });
  });

  describe('secureRandomInt', () => {
    it('should generate values within range', () => {
      for (let i = 0; i < 50; i++) {
        const value = secureRandomInt(10);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(10);
      }
    });

    it('should produce varied output', () => {
      const values = new Set<number>();
      for (let i = 0; i < 20; i++) {
        values.add(secureRandomInt(1000));
      }
      expect(values.size).toBeGreaterThan(1);
    });

    it('should throw on invalid input', () => {
      expect(() => secureRandomInt(0)).toThrow('maxExclusive must be a positive integer');
      expect(() => secureRandomInt(-1)).toThrow('maxExclusive must be a positive integer');
      expect(() => secureRandomInt(1.5)).toThrow('maxExclusive must be a positive integer');
    });
  });

  describe('secureRandomPasswordCharacter', () => {
    it('should select character from charset', () => {
      const charset = 'abc';
      for (let i = 0; i < 20; i++) {
        expect(charset.includes(secureRandomPasswordCharacter(charset))).toBe(true);
      }
    });

    it('should generate varied characters', () => {
      const charset = 'abc';
      const values = new Set<string>();
      for (let i = 0; i < 20; i++) {
        values.add(secureRandomPasswordCharacter(charset));
      }
      expect(values.size).toBeGreaterThan(1);
    });

    it('should throw on empty charset', () => {
      expect(() => secureRandomPasswordCharacter('')).toThrow('charset must be a non-empty string');
    });
  });

  describe('generateIdentifierSuffix', () => {
    it('should generate suffix of requested length', () => {
      const suffix = generateIdentifierSuffix(8);
      expect(suffix).toHaveLength(8);
      expect(suffix).toMatch(/^[0-9A-Z]+$/);
    });

    it('should generate varied suffixes', () => {
      const suffixes = new Set<string>();
      for (let i = 0; i < 10; i++) {
        suffixes.add(generateIdentifierSuffix(6));
      }
      expect(suffixes.size).toBeGreaterThan(1);
    });

    it('should support custom alphabet', () => {
      const suffix = generateIdentifierSuffix(5, 'abc');
      expect(suffix).toMatch(/^[abc]{5}$/);
    });

    it('should throw on invalid input', () => {
      expect(() => generateIdentifierSuffix(0)).toThrow('length must be a positive integer');
      expect(() => generateIdentifierSuffix(-1)).toThrow('length must be a positive integer');
      expect(() => generateIdentifierSuffix(5, '')).toThrow('alphabet must be a non-empty string');
    });
  });

  describe('sha256', () => {
    it('should generate SHA-256 hash', () => {
      const hash = sha256('hello');
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('should generate consistent hashes', () => {
      const hash1 = sha256('test');
      const hash2 = sha256('test');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = sha256('test1');
      const hash2 = sha256('test2');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = sha256('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should produce 64 character hex string', () => {
      const hash = sha256('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('sha512', () => {
    it('should generate SHA-512 hash', () => {
      const hash = sha512('hello');
      expect(hash).toBe('9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043');
    });

    it('should generate consistent hashes', () => {
      const hash1 = sha512('test');
      const hash2 = sha512('test');
      expect(hash1).toBe(hash2);
    });

    it('should produce 128 character hex string', () => {
      const hash = sha512('test');
      expect(hash).toHaveLength(128);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('hmacSha256', () => {
    it('should generate HMAC signature', () => {
      const signature = hmacSha256('data', 'secret');
      expect(signature).toHaveLength(64);
      expect(signature).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate consistent signatures with same secret', () => {
      const sig1 = hmacSha256('data', 'secret');
      const sig2 = hmacSha256('data', 'secret');
      expect(sig1).toBe(sig2);
    });

    it('should generate different signatures with different secrets', () => {
      const sig1 = hmacSha256('data', 'secret1');
      const sig2 = hmacSha256('data', 'secret2');
      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different data', () => {
      const sig1 = hmacSha256('data1', 'secret');
      const sig2 = hmacSha256('data2', 'secret');
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifyHmac', () => {
    it('should verify correct HMAC signature', () => {
      const signature = hmacSha256('data', 'secret');
      expect(verifyHmac('data', signature, 'secret')).toBe(true);
    });

    it('should reject incorrect signature', () => {
      hmacSha256('data', 'secret');
      expect(verifyHmac('data', 'wrong', 'secret')).toBe(false);
    });

    it('should reject signature with wrong secret', () => {
      const signature = hmacSha256('data', 'secret1');
      expect(verifyHmac('data', signature, 'secret2')).toBe(false);
    });

    it('should reject signature with different data', () => {
      const signature = hmacSha256('data1', 'secret');
      expect(verifyHmac('data2', signature, 'secret')).toBe(false);
    });
  });

  describe('timingSafeEqual', () => {
    it('should return true for identical strings', () => {
      expect(timingSafeEqual('hello', 'hello')).toBe(true);
      expect(timingSafeEqual('test123', 'test123')).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(timingSafeEqual('hello', 'world')).toBe(false);
      expect(timingSafeEqual('test1', 'test2')).toBe(false);
    });

    it('should return false for different length strings', () => {
      expect(timingSafeEqual('hello', 'hello world')).toBe(false);
      expect(timingSafeEqual('short', 'longer string')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(timingSafeEqual('', '')).toBe(true);
      expect(timingSafeEqual('', 'test')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(timingSafeEqual('Hello', 'hello')).toBe(false);
    });
  });

  describe('hashSensitiveData', () => {
    it('should hash sensitive data', () => {
      const hash = hashSensitiveData('user@example.com');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should normalize to lowercase', () => {
      const hash1 = hashSensitiveData('USER@EXAMPLE.COM');
      const hash2 = hashSensitiveData('user@example.com');
      expect(hash1).toBe(hash2);
    });

    it('should trim whitespace', () => {
      const hash1 = hashSensitiveData('  user@example.com  ');
      const hash2 = hashSensitiveData('user@example.com');
      expect(hash1).toBe(hash2);
    });

    it('should generate consistent hashes', () => {
      const hash1 = hashSensitiveData('test@example.com');
      const hash2 = hashSensitiveData('test@example.com');
      expect(hash1).toBe(hash2);
    });
  });

  describe('generateSlugId', () => {
    it('should generate slug ID without prefix', () => {
      const id = generateSlugId();
      expect(id).toHaveLength(16); // 8 bytes = 16 hex chars
      expect(id).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate slug ID with prefix', () => {
      const id = generateSlugId('user');
      expect(id).toMatch(/^user_[0-9a-f]{16}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = generateSlugId('prefix');
      const id2 = generateSlugId('prefix');
      expect(id1).not.toBe(id2);
    });

    it('should handle different prefixes', () => {
      const id1 = generateSlugId('user');
      const id2 = generateSlugId('order');
      expect(id1).toMatch(/^user_/);
      expect(id2).toMatch(/^order_/);
    });
  });

  describe('maskString', () => {
    it('should mask middle of string with default settings', () => {
      const masked = maskString('1234567890');
      expect(masked).toBe('1234**7890');
    });

    it('should handle custom visible start and end', () => {
      const masked = maskString('1234567890', 2, 2);
      expect(masked).toBe('12******90');
    });

    it('should mask entire string if too short', () => {
      const masked = maskString('123', 4, 4);
      expect(masked).toBe('***');
    });

    it('should handle single character visible portions', () => {
      const masked = maskString('1234567890', 1, 1);
      expect(masked).toBe('1********0');
    });

    it('should handle zero visible portions', () => {
      const masked = maskString('1234567890', 0, 0);
      expect(masked).toBe('**********');
    });

    it('should handle empty strings', () => {
      const masked = maskString('');
      expect(masked).toBe('');
    });
  });

  describe('maskEmail', () => {
    it('should mask email local part', () => {
      const masked = maskEmail('user@example.com');
      expect(masked).toMatch(/^us\*+@example\.com$/);
    });

    it('should handle short email local parts', () => {
      const masked = maskEmail('ab@example.com');
      // Short local parts get masked differently
      expect(masked).toContain('@example.com');
    });

    it('should handle single character local parts', () => {
      const masked = maskEmail('a@example.com');
      // Single char local parts get masked
      expect(masked).toContain('@example.com');
    });

    it('should handle invalid emails without @', () => {
      const masked = maskEmail('notanemail');
      // Falls back to maskString with default parameters
      expect(masked.length).toBe('notanemail'.length);
    });

    it('should preserve domain', () => {
      const masked = maskEmail('test@example.com');
      expect(masked).toContain('@example.com');
    });
  });

  describe('maskCardNumber', () => {
    it('should mask credit card showing last 4 digits', () => {
      const masked = maskCardNumber('1234567890123456');
      expect(masked).toBe('************3456');
    });

    it('should handle cards with spaces', () => {
      const masked = maskCardNumber('1234 5678 9012 3456');
      expect(masked).toBe('************3456');
    });

    it('should handle Amex format', () => {
      const masked = maskCardNumber('123456789012345');
      expect(masked).toBe('***********2345');
    });

    it('should mask entire short numbers', () => {
      const masked = maskCardNumber('123');
      expect(masked).toBe('***');
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should generate consistent keys for same data', () => {
      const data = { userId: 123, action: 'create' };
      const key1 = generateIdempotencyKey(data);
      const key2 = generateIdempotencyKey(data);
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different data', () => {
      const data1 = { userId: 123, action: 'create' };
      const data2 = { userId: 456, action: 'create' };
      const key1 = generateIdempotencyKey(data1);
      const key2 = generateIdempotencyKey(data2);
      expect(key1).not.toBe(key2);
    });

    it('should normalize key order', () => {
      const data1 = { a: 1, b: 2, c: 3 };
      const data2 = { c: 3, a: 1, b: 2 };
      const key1 = generateIdempotencyKey(data1);
      const key2 = generateIdempotencyKey(data2);
      expect(key1).toBe(key2);
    });

    it('should handle nested objects', () => {
      const data = { user: { id: 123, name: 'test' }, action: 'create' };
      const key = generateIdempotencyKey(data);
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]+$/);
    });

    it('should handle empty objects', () => {
      const key = generateIdempotencyKey({});
      expect(key).toHaveLength(64);
    });
  });
});
