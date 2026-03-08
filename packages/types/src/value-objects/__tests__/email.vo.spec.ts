import { Email, InvalidEmailError } from '../email.vo';

describe('Email Value Object', () => {
  describe('creation', () => {
    it('should create valid email object', () => {
      const email = Email.create('user@example.com');
      expect(email.getValue()).toBe('user@example.com');
    });

    it('should normalize email to lowercase', () => {
      const email = Email.create('User@Example.COM');
      expect(email.getValue()).toBe('user@example.com');
    });

    it('should trim whitespace', () => {
      const email = Email.create('  user@example.com  ');
      expect(email.getValue()).toBe('user@example.com');
    });

    it('should accept email with plus sign', () => {
      const email = Email.create('user+tag@example.com');
      expect(email.getValue()).toBe('user+tag@example.com');
    });

    it('should accept email with dots in local part', () => {
      const email = Email.create('first.last@example.com');
      expect(email.getValue()).toBe('first.last@example.com');
    });

    it('should accept email with numbers', () => {
      const email = Email.create('user123@example456.com');
      expect(email.getValue()).toBe('user123@example456.com');
    });

    it('should accept email with hyphens in domain', () => {
      const email = Email.create('user@my-domain.com');
      expect(email.getValue()).toBe('user@my-domain.com');
    });

    it('should accept email with subdomain', () => {
      const email = Email.create('user@mail.example.com');
      expect(email.getValue()).toBe('user@mail.example.com');
    });

    it('should accept email with special characters', () => {
      const email = Email.create('user!#$%&*@example.com');
      expect(email.getValue()).toBe('user!#$%&*@example.com');
    });
  });

  describe('validation errors', () => {
    it('should reject empty email', () => {
      expect(() => Email.create('')).toThrow(InvalidEmailError);
      expect(() => Email.create('')).toThrow('Email cannot be empty');
    });

    it('should reject whitespace-only email', () => {
      expect(() => Email.create('   ')).toThrow(InvalidEmailError);
    });

    it('should reject email without @', () => {
      expect(() => Email.create('userexample.com')).toThrow(InvalidEmailError);
      expect(() => Email.create('userexample.com')).toThrow('Email format is invalid');
    });

    it('should reject email without local part', () => {
      expect(() => Email.create('@example.com')).toThrow(InvalidEmailError);
    });

    it('should reject email without domain', () => {
      expect(() => Email.create('user@')).toThrow(InvalidEmailError);
    });

    it('should reject email with multiple @ signs', () => {
      expect(() => Email.create('user@@example.com')).toThrow(InvalidEmailError);
    });

    it('should reject email with consecutive dots', () => {
      expect(() => Email.create('user..name@example.com')).toThrow(InvalidEmailError);
      expect(() => Email.create('user..name@example.com')).toThrow('consecutive dots');
    });

    it('should reject email with leading dot in local part', () => {
      expect(() => Email.create('.user@example.com')).toThrow(InvalidEmailError);
      expect(() => Email.create('.user@example.com')).toThrow('cannot start or end with a dot');
    });

    it('should reject email with trailing dot in local part', () => {
      expect(() => Email.create('user.@example.com')).toThrow(InvalidEmailError);
      expect(() => Email.create('user.@example.com')).toThrow('cannot start or end with a dot');
    });

    it('should reject email exceeding max length (254 chars)', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(() => Email.create(longEmail)).toThrow(InvalidEmailError);
      expect(() => Email.create(longEmail)).toThrow('exceeds maximum length');
    });

    it('should reject email with local part exceeding 64 chars', () => {
      const longLocalPart = 'a'.repeat(65) + '@example.com';
      expect(() => Email.create(longLocalPart)).toThrow(InvalidEmailError);
      expect(() => Email.create(longLocalPart)).toThrow('Local part exceeds maximum length');
    });

    it('should reject email with domain exceeding 253 chars', () => {
      const longDomain = 'user@' + 'a'.repeat(254) + '.com';
      expect(() => Email.create(longDomain)).toThrow(InvalidEmailError);
      expect(() => Email.create(longDomain)).toThrow('Domain exceeds maximum length');
    });

    it('should reject email with spaces', () => {
      expect(() => Email.create('user name@example.com')).toThrow(InvalidEmailError);
    });

    it('should reject email with invalid characters', () => {
      expect(() => Email.create('user<>@example.com')).toThrow(InvalidEmailError);
    });
  });

  describe('getters', () => {
    it('should get local part', () => {
      const email = Email.create('user@example.com');
      expect(email.getLocalPart()).toBe('user');
    });

    it('should get domain', () => {
      const email = Email.create('user@example.com');
      expect(email.getDomain()).toBe('example.com');
    });

    it('should get value', () => {
      const email = Email.create('user@example.com');
      expect(email.getValue()).toBe('user@example.com');
    });
  });

  describe('equality', () => {
    it('should return true for identical emails', () => {
      const email1 = Email.create('user@example.com');
      const email2 = Email.create('user@example.com');
      expect(email1.equals(email2)).toBe(true);
    });

    it('should return true for case-insensitive match', () => {
      const email1 = Email.create('User@Example.com');
      const email2 = Email.create('user@example.com');
      expect(email1.equals(email2)).toBe(true);
    });

    it('should return false for different emails', () => {
      const email1 = Email.create('user1@example.com');
      const email2 = Email.create('user2@example.com');
      expect(email1.equals(email2)).toBe(false);
    });
  });

  describe('domain checking', () => {
    it('should return true for matching domain', () => {
      const email = Email.create('user@example.com');
      expect(email.isDomain('example.com')).toBe(true);
    });

    it('should return true for matching domain (case-insensitive)', () => {
      const email = Email.create('user@example.com');
      expect(email.isDomain('EXAMPLE.COM')).toBe(true);
    });

    it('should return false for different domain', () => {
      const email = Email.create('user@example.com');
      expect(email.isDomain('other.com')).toBe(false);
    });
  });

  describe('string conversion', () => {
    it('should convert to string', () => {
      const email = Email.create('user@example.com');
      expect(email.toString()).toBe('user@example.com');
    });

    it('should convert to JSON', () => {
      const email = Email.create('user@example.com');
      expect(email.toJSON()).toBe('user@example.com');
    });
  });

  describe('factory methods', () => {
    it('should create email with create method', () => {
      const email = Email.create('user@example.com');
      expect(email).toBeInstanceOf(Email);
      expect(email.getValue()).toBe('user@example.com');
    });

    it('should return null for invalid email with createOrNull', () => {
      const email = Email.createOrNull('invalid-email');
      expect(email).toBeNull();
    });

    it('should return email for valid email with createOrNull', () => {
      const email = Email.createOrNull('user@example.com');
      expect(email).toBeInstanceOf(Email);
      expect(email?.getValue()).toBe('user@example.com');
    });

    it('should validate email format with isValid', () => {
      expect(Email.isValid('user@example.com')).toBe(true);
      expect(Email.isValid('invalid-email')).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should be immutable', () => {
      const email = Email.create('user@example.com');
      const value = email.getValue();

      // Attempting to modify should not affect original
      expect(email.getValue()).toBe(value);
    });
  });
});
