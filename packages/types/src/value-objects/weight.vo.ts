/**
 * Weight Value Object
 *
 * Immutable value object representing weight/mass.
 * Supports multiple units and provides conversion capabilities.
 */

export class InvalidWeightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWeightError';
  }
}

export type WeightUnit = 'lb' | 'oz' | 'kg' | 'g' | 'mg' | 'ton';

const UNIT_TO_KG: Record<WeightUnit, number> = {
  lb: 0.453592,
  oz: 0.0283495,
  kg: 1,
  g: 0.001,
  mg: 0.000001,
  ton: 907.185, // US ton (short ton)
};

export class Weight {
  private static readonly MIN_VALUE = 0;
  private static readonly MAX_VALUE = 1000000; // 1,000,000 kg = 1,000 metric tons

  private constructor(
    private readonly value: number,
    private readonly unit: WeightUnit,
  ) {
    this.validate();
  }

  private validate(): void {
    if (this.value < Weight.MIN_VALUE) {
      throw new InvalidWeightError('Weight must be non-negative');
    }

    if (!isFinite(this.value)) {
      throw new InvalidWeightError('Weight must be finite');
    }

    if (isNaN(this.value)) {
      throw new InvalidWeightError('Weight must be a valid number');
    }

    // Convert to kg for max validation
    const valueKg = this.value * UNIT_TO_KG[this.unit];
    if (valueKg > Weight.MAX_VALUE) {
      throw new InvalidWeightError('Weight exceeds maximum allowed value');
    }

    if (!UNIT_TO_KG[this.unit]) {
      throw new InvalidWeightError(`Invalid unit: ${this.unit}`);
    }
  }

  /**
   * Get weight value
   */
  getValue(): number {
    return this.value;
  }

  /**
   * Get weight unit
   */
  getUnit(): WeightUnit {
    return this.unit;
  }

  /**
   * Check if weight is zero
   */
  isZero(): boolean {
    return this.value === 0;
  }

  /**
   * Convert to different unit
   */
  convertTo(targetUnit: WeightUnit): Weight {
    if (this.unit === targetUnit) {
      return this;
    }

    const valueInKg = this.value * UNIT_TO_KG[this.unit];
    const valueInTarget = valueInKg / UNIT_TO_KG[targetUnit];

    return new Weight(valueInTarget, targetUnit);
  }

  /**
   * Add another weight value
   */
  add(other: Weight): Weight {
    const otherInOurUnit = other.convertTo(this.unit);
    return new Weight(this.value + otherInOurUnit.value, this.unit);
  }

  /**
   * Subtract another weight value
   */
  subtract(other: Weight): Weight {
    const otherInOurUnit = other.convertTo(this.unit);
    const result = this.value - otherInOurUnit.value;

    if (result < 0) {
      throw new InvalidWeightError('Cannot subtract to negative weight');
    }

    return new Weight(result, this.unit);
  }

  /**
   * Multiply by factor
   */
  multiply(factor: number): Weight {
    if (factor < 0) {
      throw new InvalidWeightError('Cannot multiply by negative factor');
    }
    if (!isFinite(factor) || isNaN(factor)) {
      throw new InvalidWeightError('Factor must be finite');
    }

    return new Weight(this.value * factor, this.unit);
  }

  /**
   * Divide by divisor
   */
  divide(divisor: number): Weight {
    if (divisor === 0) {
      throw new InvalidWeightError('Cannot divide by zero');
    }
    if (divisor < 0) {
      throw new InvalidWeightError('Cannot divide by negative divisor');
    }
    if (!isFinite(divisor) || isNaN(divisor)) {
      throw new InvalidWeightError('Divisor must be finite');
    }

    return new Weight(this.value / divisor, this.unit);
  }

  /**
   * Compare with another weight value
   * Returns: -1 if less, 0 if equal, 1 if greater
   */
  compare(other: Weight): number {
    const otherInOurUnit = other.convertTo(this.unit);
    if (this.value < otherInOurUnit.value) return -1;
    if (this.value > otherInOurUnit.value) return 1;
    return 0;
  }

  /**
   * Check if equal to another weight value
   */
  equals(other: Weight): boolean {
    const otherInOurUnit = other.convertTo(this.unit);
    const precision = 0.0001; // 0.0001 unit tolerance

    return Math.abs(this.value - otherInOurUnit.value) < precision;
  }

  /**
   * Check if greater than another weight value
   */
  greaterThan(other: Weight): boolean {
    return this.compare(other) > 0;
  }

  /**
   * Check if greater than or equal to another weight value
   */
  greaterThanOrEqual(other: Weight): boolean {
    return this.compare(other) >= 0;
  }

  /**
   * Check if less than another weight value
   */
  lessThan(other: Weight): boolean {
    return this.compare(other) < 0;
  }

  /**
   * Check if less than or equal to another weight value
   */
  lessThanOrEqual(other: Weight): boolean {
    return this.compare(other) <= 0;
  }

  /**
   * Format weight as string
   */
  format(options: { precision?: number; includeUnit?: boolean } = {}): string {
    const { precision = 2, includeUnit = true } = options;
    const formattedValue = this.value.toFixed(precision);
    return includeUnit ? `${formattedValue} ${this.unit}` : formattedValue;
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    return this.format();
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): { value: number; unit: WeightUnit } {
    return {
      value: this.value,
      unit: this.unit,
    };
  }

  /**
   * Factory method to create Weight value object
   */
  static create(value: number, unit: WeightUnit = 'lb'): Weight {
    return new Weight(value, unit);
  }

  /**
   * Create zero weight
   */
  static zero(unit: WeightUnit = 'lb'): Weight {
    return new Weight(0, unit);
  }

  /**
   * Create from object
   */
  static fromObject(obj: { value: number; unit: WeightUnit }): Weight {
    return new Weight(obj.value, obj.unit);
  }

  /**
   * Create weight or return null if invalid
   */
  static createOrNull(value: number, unit: WeightUnit = 'lb'): Weight | null {
    try {
      return Weight.create(value, unit);
    } catch {
      return null;
    }
  }

  /**
   * Validate weight without creating instance
   */
  static isValid(value: number, unit: WeightUnit = 'lb'): boolean {
    try {
      Weight.create(value, unit);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sum an array of weight values
   */
  static sum(values: Weight[]): Weight {
    if (values.length === 0) {
      throw new InvalidWeightError('Cannot sum empty array');
    }

    return values.reduce((sum, value) => sum.add(value), Weight.zero(values[0].unit));
  }

  /**
   * Get the minimum of multiple weight values
   */
  static min(...values: Weight[]): Weight {
    if (values.length === 0) {
      throw new InvalidWeightError('Cannot get minimum of empty array');
    }

    return values.reduce((min, value) => (value.lessThan(min) ? value : min));
  }

  /**
   * Get the maximum of multiple weight values
   */
  static max(...values: Weight[]): Weight {
    if (values.length === 0) {
      throw new InvalidWeightError('Cannot get maximum of empty array');
    }

    return values.reduce((max, value) => (value.greaterThan(max) ? value : max));
  }

  /**
   * Get conversion factor between units
   */
  static getConversionFactor(fromUnit: WeightUnit, toUnit: WeightUnit): number {
    return UNIT_TO_KG[fromUnit] / UNIT_TO_KG[toUnit];
  }
}
