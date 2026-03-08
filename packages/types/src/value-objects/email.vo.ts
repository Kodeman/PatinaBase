/**
 * Email Value Object
 *
 * Immutable value object representing a validated email address.
 * Ensures email format validity and provides normalization.
 */

export class InvalidEmailError extends Error {
  constructor(email: string, reason?: string) {
    super(reason ? `Invalid email "${email}": ${reason}` : `Invalid email "${email}"`);
    this.name = 'InvalidEmailError';
  }
}

export class Email {
  private static readonly EMAIL_REGEX =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  private static readonly MAX_LENGTH = 254; // RFC 5321
  private static readonly MAX_LOCAL_PART_LENGTH = 64;
  private static readonly MAX_DOMAIN_LENGTH = 253;

  private constructor(private readonly value: string) {
    this.validate();
  }

  private validate(): void {
    if (!this.value || this.value.trim().length === 0) {
      throw new InvalidEmailError(this.value, 'Email cannot be empty');
    }

    if (this.value.length > Email.MAX_LENGTH) {
      throw new InvalidEmailError(this.value, `Email exceeds maximum length of ${Email.MAX_LENGTH} characters`);
    }

    if (!Email.EMAIL_REGEX.test(this.value)) {
      throw new InvalidEmailError(this.value, 'Email format is invalid');
    }

    const [localPart, domain] = this.value.split('@');

    if (!localPart || !domain) {
      throw new InvalidEmailError(this.value, 'Email must contain local part and domain');
    }

    if (localPart.length > Email.MAX_LOCAL_PART_LENGTH) {
      throw new InvalidEmailError(this.value, `Local part exceeds maximum length of ${Email.MAX_LOCAL_PART_LENGTH} characters`);
    }

    if (domain.length > Email.MAX_DOMAIN_LENGTH) {
      throw new InvalidEmailError(this.value, `Domain exceeds maximum length of ${Email.MAX_DOMAIN_LENGTH} characters`);
    }

    // Check for consecutive dots
    if (this.value.includes('..')) {
      throw new InvalidEmailError(this.value, 'Email cannot contain consecutive dots');
    }

    // Check for leading/trailing dots
    if (localPart.startsWith('.') || localPart.endsWith('.')) {
      throw new InvalidEmailError(this.value, 'Local part cannot start or end with a dot');
    }
  }

  /**
   * Get the normalized email value (lowercase)
   */
  getValue(): string {
    return this.value;
  }

  /**
   * Get the local part of the email (before @)
   */
  getLocalPart(): string {
    return this.value.split('@')[0];
  }

  /**
   * Get the domain part of the email (after @)
   */
  getDomain(): string {
    return this.value.split('@')[1];
  }

  /**
   * Check if two emails are equal (case-insensitive)
   */
  equals(other: Email): boolean {
    return this.value.toLowerCase() === other.value.toLowerCase();
  }

  /**
   * Check if email belongs to a specific domain
   */
  isDomain(domain: string): boolean {
    return this.getDomain().toLowerCase() === domain.toLowerCase();
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    return this.value;
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): string {
    return this.value;
  }

  /**
   * Factory method to create an Email value object
   * Normalizes the email to lowercase
   */
  static create(email: string): Email {
    const normalized = email.trim().toLowerCase();
    return new Email(normalized);
  }

  /**
   * Create email from string or return null if invalid
   */
  static createOrNull(email: string): Email | null {
    try {
      return Email.create(email);
    } catch {
      return null;
    }
  }

  /**
   * Validate email format without creating instance
   */
  static isValid(email: string): boolean {
    try {
      Email.create(email);
      return true;
    } catch {
      return false;
    }
  }
}
