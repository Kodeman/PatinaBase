/**
 * Address Value Object
 *
 * Immutable value object representing a physical address.
 * Supports US, Canadian, and international formats.
 * Provides normalization and formatting capabilities.
 */

export class InvalidAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAddressError';
  }
}

export type Country = 'US' | 'CA' | 'GB' | 'AU' | 'INTL';

export interface AddressComponents {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: Country;
}

export class Address {
  private static readonly US_ZIP_REGEX = /^\d{5}(-\d{4})?$/;
  private static readonly CA_POSTAL_REGEX = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;
  private static readonly UK_POSTAL_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
  private static readonly AU_POSTAL_REGEX = /^\d{4}$/;

  private static readonly US_STATE_CODES = new Set([
    'AL',
    'AK',
    'AZ',
    'AR',
    'CA',
    'CO',
    'CT',
    'DE',
    'FL',
    'GA',
    'HI',
    'ID',
    'IL',
    'IN',
    'IA',
    'KS',
    'KY',
    'LA',
    'ME',
    'MD',
    'MA',
    'MI',
    'MN',
    'MS',
    'MO',
    'MT',
    'NE',
    'NV',
    'NH',
    'NJ',
    'NM',
    'NY',
    'NC',
    'ND',
    'OH',
    'OK',
    'OR',
    'PA',
    'RI',
    'SC',
    'SD',
    'TN',
    'TX',
    'UT',
    'VT',
    'VA',
    'WA',
    'WV',
    'WI',
    'WY',
    'DC',
  ]);

  private static readonly CA_PROVINCE_CODES = new Set([
    'AB',
    'BC',
    'MB',
    'NB',
    'NL',
    'NS',
    'NT',
    'NU',
    'ON',
    'PE',
    'QC',
    'SK',
    'YT',
  ]);

  private constructor(
    private readonly street1: string,
    private readonly street2: string | undefined,
    private readonly city: string,
    private readonly state: string,
    private readonly postalCode: string,
    private readonly country: Country,
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.street1 || this.street1.trim().length === 0) {
      throw new InvalidAddressError('Street address is required');
    }

    if (!this.city || this.city.trim().length === 0) {
      throw new InvalidAddressError('City is required');
    }

    if (!this.state || this.state.trim().length === 0) {
      throw new InvalidAddressError('State/Province is required');
    }

    if (!this.postalCode || this.postalCode.trim().length === 0) {
      throw new InvalidAddressError('Postal code is required');
    }

    if (!this.country) {
      throw new InvalidAddressError('Country is required');
    }

    // Validate based on country
    this.validateCountrySpecific();
  }

  private validateCountrySpecific(): void {
    switch (this.country) {
      case 'US':
        this.validateUSAddress();
        break;
      case 'CA':
        this.validateCAAddress();
        break;
      case 'GB':
        this.validateGBAddress();
        break;
      case 'AU':
        this.validateAUAddress();
        break;
      case 'INTL':
        // International addresses have minimal validation
        break;
    }
  }

  private validateUSAddress(): void {
    const stateUpper = this.state.toUpperCase();
    if (!Address.US_STATE_CODES.has(stateUpper)) {
      throw new InvalidAddressError(`Invalid US state code: ${this.state}`);
    }

    if (!Address.US_ZIP_REGEX.test(this.postalCode)) {
      throw new InvalidAddressError(`Invalid US ZIP code format: ${this.postalCode}`);
    }
  }

  private validateCAAddress(): void {
    const provinceUpper = this.state.toUpperCase();
    if (!Address.CA_PROVINCE_CODES.has(provinceUpper)) {
      throw new InvalidAddressError(`Invalid Canadian province code: ${this.state}`);
    }

    if (!Address.CA_POSTAL_REGEX.test(this.postalCode)) {
      throw new InvalidAddressError(`Invalid Canadian postal code format: ${this.postalCode}`);
    }
  }

  private validateGBAddress(): void {
    if (!Address.UK_POSTAL_REGEX.test(this.postalCode)) {
      throw new InvalidAddressError(`Invalid UK postal code format: ${this.postalCode}`);
    }
  }

  private validateAUAddress(): void {
    if (!Address.AU_POSTAL_REGEX.test(this.postalCode)) {
      throw new InvalidAddressError(`Invalid Australian postal code format: ${this.postalCode}`);
    }
  }

  /**
   * Get street address line 1
   */
  getStreet1(): string {
    return this.street1;
  }

  /**
   * Get street address line 2
   */
  getStreet2(): string | undefined {
    return this.street2;
  }

  /**
   * Get city
   */
  getCity(): string {
    return this.city;
  }

  /**
   * Get state/province
   */
  getState(): string {
    return this.state;
  }

  /**
   * Get postal/ZIP code
   */
  getPostalCode(): string {
    return this.postalCode;
  }

  /**
   * Get country code
   */
  getCountry(): Country {
    return this.country;
  }

  /**
   * Get all address components
   */
  getComponents(): AddressComponents {
    return {
      street1: this.street1,
      street2: this.street2,
      city: this.city,
      state: this.state,
      postalCode: this.postalCode,
      country: this.country,
    };
  }

  /**
   * Format address as single line
   */
  toSingleLine(): string {
    const parts = [this.street1];

    if (this.street2) {
      parts.push(this.street2);
    }

    parts.push(`${this.city}, ${this.state} ${this.postalCode}`);

    if (this.country !== 'US') {
      parts.push(this.country);
    }

    return parts.join(', ');
  }

  /**
   * Format address as multiple lines
   */
  toMultiLine(): string {
    const lines = [this.street1];

    if (this.street2) {
      lines.push(this.street2);
    }

    lines.push(`${this.city}, ${this.state} ${this.postalCode}`);

    if (this.country !== 'US') {
      lines.push(this.country);
    }

    return lines.join('\n');
  }

  /**
   * Check if two addresses are equal
   */
  equals(other: Address): boolean {
    return (
      this.normalizeString(this.street1) === this.normalizeString(other.street1) &&
      this.normalizeString(this.street2) === this.normalizeString(other.street2) &&
      this.normalizeString(this.city) === this.normalizeString(other.city) &&
      this.state.toUpperCase() === other.state.toUpperCase() &&
      this.normalizePostalCode(this.postalCode) === this.normalizePostalCode(other.postalCode) &&
      this.country === other.country
    );
  }

  /**
   * Check if address is in the same city
   */
  isSameCity(other: Address): boolean {
    return (
      this.normalizeString(this.city) === this.normalizeString(other.city) &&
      this.state.toUpperCase() === other.state.toUpperCase() &&
      this.country === other.country
    );
  }

  /**
   * Check if address is in the same state/province
   */
  isSameState(other: Address): boolean {
    return this.state.toUpperCase() === other.state.toUpperCase() && this.country === other.country;
  }

  /**
   * Check if address is in the same country
   */
  isSameCountry(other: Address): boolean {
    return this.country === other.country;
  }

  /**
   * Convert to string representation (single line)
   */
  toString(): string {
    return this.toSingleLine();
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): AddressComponents {
    return this.getComponents();
  }

  private normalizeString(value: string | undefined): string {
    return (value || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private normalizePostalCode(code: string): string {
    return code.replace(/\s+/g, '').toUpperCase();
  }

  /**
   * Factory method to create an Address value object
   */
  static create(components: AddressComponents): Address {
    const street1 = components.street1.trim();
    const street2 = components.street2?.trim();
    const city = components.city.trim();
    const state = components.state.trim().toUpperCase();
    const postalCode = components.postalCode.trim().toUpperCase();
    const country = components.country;

    return new Address(street1, street2, city, state, postalCode, country);
  }

  /**
   * Create address from components or return null if invalid
   */
  static createOrNull(components: AddressComponents): Address | null {
    try {
      return Address.create(components);
    } catch {
      return null;
    }
  }

  /**
   * Validate address components without creating instance
   */
  static isValid(components: AddressComponents): boolean {
    try {
      Address.create(components);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of valid US state codes
   */
  static getUSStates(): string[] {
    return Array.from(Address.US_STATE_CODES).sort();
  }

  /**
   * Get list of valid Canadian province codes
   */
  static getCAProvinces(): string[] {
    return Array.from(Address.CA_PROVINCE_CODES).sort();
  }

  /**
   * Validate US ZIP code format
   */
  static isValidUSZip(zip: string): boolean {
    return Address.US_ZIP_REGEX.test(zip);
  }

  /**
   * Validate Canadian postal code format
   */
  static isValidCAPostal(postal: string): boolean {
    return Address.CA_POSTAL_REGEX.test(postal);
  }
}
