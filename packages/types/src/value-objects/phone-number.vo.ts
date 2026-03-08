/**
 * PhoneNumber Value Object
 *
 * Immutable value object representing a validated phone number.
 * Supports North American (US/Canada) and international formats.
 * Provides normalization and formatting capabilities.
 */

export class InvalidPhoneNumberError extends Error {
  constructor(phone: string, reason?: string) {
    super(reason ? `Invalid phone number "${phone}": ${reason}` : `Invalid phone number "${phone}"`);
    this.name = 'InvalidPhoneNumberError';
  }
}

export type PhoneNumberCountryCode = 'US' | 'CA' | 'GB' | 'AU' | 'INTL';

export class PhoneNumber {
  // North American format: +1 (XXX) XXX-XXXX
  private static readonly NANP_REGEX = /^(\+?1)?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/;

  // Note: INTL_REGEX is reserved for future international format validation
  // Currently, international validation uses digit count constraints only

  private static readonly MIN_DIGITS = 10;
  private static readonly MAX_DIGITS = 15;

  private constructor(
    private readonly digits: string,
    private readonly countryCode: PhoneNumberCountryCode,
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.digits || this.digits.length === 0) {
      throw new InvalidPhoneNumberError(this.digits, 'Phone number cannot be empty');
    }

    const digitCount = this.digits.replace(/\D/g, '').length;

    if (digitCount < PhoneNumber.MIN_DIGITS) {
      throw new InvalidPhoneNumberError(
        this.digits,
        `Phone number must have at least ${PhoneNumber.MIN_DIGITS} digits`,
      );
    }

    if (digitCount > PhoneNumber.MAX_DIGITS) {
      throw new InvalidPhoneNumberError(
        this.digits,
        `Phone number must have at most ${PhoneNumber.MAX_DIGITS} digits`,
      );
    }

    // Validate NANP numbers (US/CA)
    if (this.countryCode === 'US' || this.countryCode === 'CA') {
      if (digitCount !== 10 && digitCount !== 11) {
        throw new InvalidPhoneNumberError(
          this.digits,
          'North American phone numbers must have 10 or 11 digits',
        );
      }

      const numbersOnly = this.digits.replace(/\D/g, '');
      const areaCode = digitCount === 11 ? numbersOnly.substring(1, 4) : numbersOnly.substring(0, 3);
      const exchangeCode = digitCount === 11 ? numbersOnly.substring(4, 7) : numbersOnly.substring(3, 6);

      // Area code cannot start with 0 or 1
      if (areaCode[0] === '0' || areaCode[0] === '1') {
        throw new InvalidPhoneNumberError(this.digits, 'Area code cannot start with 0 or 1');
      }

      // Exchange code cannot start with 0 or 1
      if (exchangeCode[0] === '0' || exchangeCode[0] === '1') {
        throw new InvalidPhoneNumberError(this.digits, 'Exchange code cannot start with 0 or 1');
      }
    }
  }

  /**
   * Get the raw digits (numbers only)
   */
  getDigits(): string {
    return this.digits.replace(/\D/g, '');
  }

  /**
   * Get the country code
   */
  getCountryCode(): PhoneNumberCountryCode {
    return this.countryCode;
  }

  /**
   * Format phone number for display
   * US/CA: (555) 123-4567
   * International: +XX XXXXXXXXXX
   */
  format(): string {
    const numbersOnly = this.getDigits();

    if (this.countryCode === 'US' || this.countryCode === 'CA') {
      // Remove leading 1 if present
      const localNumber = numbersOnly.length === 11 ? numbersOnly.substring(1) : numbersOnly;
      const areaCode = localNumber.substring(0, 3);
      const exchangeCode = localNumber.substring(3, 6);
      const lineNumber = localNumber.substring(6, 10);

      return `(${areaCode}) ${exchangeCode}-${lineNumber}`;
    }

    // International format
    if (numbersOnly.startsWith('1')) {
      return `+1 ${numbersOnly.substring(1)}`;
    }

    return `+${numbersOnly}`;
  }

  /**
   * Format phone number in E.164 format (+1XXXXXXXXXX)
   */
  toE164(): string {
    const numbersOnly = this.getDigits();

    if (this.countryCode === 'US' || this.countryCode === 'CA') {
      // Ensure we have country code 1
      if (numbersOnly.length === 10) {
        return `+1${numbersOnly}`;
      }
      if (numbersOnly.startsWith('1')) {
        return `+${numbersOnly}`;
      }
      return `+1${numbersOnly}`;
    }

    // International numbers should already have country code
    return numbersOnly.startsWith('+') ? numbersOnly : `+${numbersOnly}`;
  }

  /**
   * Get area code (for NANP numbers)
   */
  getAreaCode(): string | null {
    if (this.countryCode !== 'US' && this.countryCode !== 'CA') {
      return null;
    }

    const numbersOnly = this.getDigits();
    const localNumber = numbersOnly.length === 11 ? numbersOnly.substring(1) : numbersOnly;
    return localNumber.substring(0, 3);
  }

  /**
   * Check if two phone numbers are equal
   */
  equals(other: PhoneNumber): boolean {
    return this.getDigits() === other.getDigits() && this.countryCode === other.countryCode;
  }

  /**
   * Convert to string representation (formatted)
   */
  toString(): string {
    return this.format();
  }

  /**
   * Convert to JSON representation (E.164 format)
   */
  toJSON(): string {
    return this.toE164();
  }

  /**
   * Factory method to create a PhoneNumber value object
   */
  static create(phone: string, countryCode: PhoneNumberCountryCode = 'US'): PhoneNumber {
    const normalized = phone.trim();
    return new PhoneNumber(normalized, countryCode);
  }

  /**
   * Create phone number from string or return null if invalid
   */
  static createOrNull(phone: string, countryCode: PhoneNumberCountryCode = 'US'): PhoneNumber | null {
    try {
      return PhoneNumber.create(phone, countryCode);
    } catch {
      return null;
    }
  }

  /**
   * Validate phone number format without creating instance
   */
  static isValid(phone: string, countryCode: PhoneNumberCountryCode = 'US'): boolean {
    try {
      PhoneNumber.create(phone, countryCode);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Auto-detect country code from phone number format
   */
  static detectCountryCode(phone: string): PhoneNumberCountryCode {
    const normalized = phone.trim().replace(/\s/g, '');

    // Check for explicit country codes
    if (normalized.startsWith('+1') || normalized.startsWith('1')) {
      return 'US'; // Could be US or CA, default to US
    }
    if (normalized.startsWith('+44')) {
      return 'GB';
    }
    if (normalized.startsWith('+61')) {
      return 'AU';
    }

    // If it looks like NANP without country code
    if (PhoneNumber.NANP_REGEX.test(normalized)) {
      return 'US';
    }

    return 'INTL';
  }

  /**
   * Create phone number with auto-detected country code
   */
  static createWithAutoDetect(phone: string): PhoneNumber {
    const countryCode = PhoneNumber.detectCountryCode(phone);
    return PhoneNumber.create(phone, countryCode);
  }
}
