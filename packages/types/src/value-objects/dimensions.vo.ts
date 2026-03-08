/**
 * Dimensions Value Object
 *
 * Immutable value object representing 3D dimensions (length, width, height).
 * Supports multiple units and provides conversion capabilities.
 */

export class InvalidDimensionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDimensionsError';
  }
}

export type DimensionUnit = 'in' | 'cm' | 'mm' | 'ft' | 'm';

const UNIT_TO_CM: Record<DimensionUnit, number> = {
  in: 2.54,
  cm: 1,
  mm: 0.1,
  ft: 30.48,
  m: 100,
};

export class Dimensions {
  private static readonly MIN_VALUE = 0;
  private static readonly MAX_VALUE = 100000; // 100,000 cm = 1km

  private constructor(
    private readonly length: number,
    private readonly width: number,
    private readonly height: number,
    private readonly unit: DimensionUnit,
  ) {
    this.validate();
  }

  private validate(): void {
    if (this.length <= Dimensions.MIN_VALUE || this.width <= Dimensions.MIN_VALUE || this.height <= Dimensions.MIN_VALUE) {
      throw new InvalidDimensionsError('All dimensions must be positive');
    }

    if (!isFinite(this.length) || !isFinite(this.width) || !isFinite(this.height)) {
      throw new InvalidDimensionsError('All dimensions must be finite');
    }

    if (isNaN(this.length) || isNaN(this.width) || isNaN(this.height)) {
      throw new InvalidDimensionsError('All dimensions must be valid numbers');
    }

    // Convert to cm for max validation
    const lengthCm = this.length * UNIT_TO_CM[this.unit];
    const widthCm = this.width * UNIT_TO_CM[this.unit];
    const heightCm = this.height * UNIT_TO_CM[this.unit];

    if (lengthCm > Dimensions.MAX_VALUE || widthCm > Dimensions.MAX_VALUE || heightCm > Dimensions.MAX_VALUE) {
      throw new InvalidDimensionsError('Dimensions exceed maximum allowed value');
    }

    if (!UNIT_TO_CM[this.unit]) {
      throw new InvalidDimensionsError(`Invalid unit: ${this.unit}`);
    }
  }

  /**
   * Get length
   */
  getLength(): number {
    return this.length;
  }

  /**
   * Get width
   */
  getWidth(): number {
    return this.width;
  }

  /**
   * Get height
   */
  getHeight(): number {
    return this.height;
  }

  /**
   * Get unit
   */
  getUnit(): DimensionUnit {
    return this.unit;
  }

  /**
   * Calculate volume in current unit cubed
   */
  getVolume(): number {
    return this.length * this.width * this.height;
  }

  /**
   * Calculate volume in cubic centimeters
   */
  getVolumeCubicCm(): number {
    const lengthCm = this.length * UNIT_TO_CM[this.unit];
    const widthCm = this.width * UNIT_TO_CM[this.unit];
    const heightCm = this.height * UNIT_TO_CM[this.unit];
    return lengthCm * widthCm * heightCm;
  }

  /**
   * Calculate volume in cubic inches
   */
  getVolumeCubicInches(): number {
    return this.getVolumeCubicCm() / Math.pow(UNIT_TO_CM['in'], 3);
  }

  /**
   * Get longest dimension
   */
  getLongestSide(): number {
    return Math.max(this.length, this.width, this.height);
  }

  /**
   * Get shortest dimension
   */
  getShortestSide(): number {
    return Math.min(this.length, this.width, this.height);
  }

  /**
   * Convert to different unit
   */
  convertTo(targetUnit: DimensionUnit): Dimensions {
    if (this.unit === targetUnit) {
      return this;
    }

    const factor = UNIT_TO_CM[this.unit] / UNIT_TO_CM[targetUnit];
    return new Dimensions(
      this.length * factor,
      this.width * factor,
      this.height * factor,
      targetUnit,
    );
  }

  /**
   * Check if dimensions fit within given dimensions
   */
  fitsWithin(container: Dimensions): boolean {
    // Convert both to same unit
    const containerInOurUnit = container.convertTo(this.unit);

    // Check all possible orientations
    const dims = [this.length, this.width, this.height].sort((a, b) => a - b);
    const containerDims = [
      containerInOurUnit.length,
      containerInOurUnit.width,
      containerInOurUnit.height,
    ].sort((a, b) => a - b);

    return dims[0] <= containerDims[0] && dims[1] <= containerDims[1] && dims[2] <= containerDims[2];
  }

  /**
   * Scale dimensions by factor
   */
  scale(factor: number): Dimensions {
    if (factor <= 0) {
      throw new InvalidDimensionsError('Scale factor must be positive');
    }
    if (!isFinite(factor)) {
      throw new InvalidDimensionsError('Scale factor must be finite');
    }

    return new Dimensions(
      this.length * factor,
      this.width * factor,
      this.height * factor,
      this.unit,
    );
  }

  /**
   * Check if two dimensions are equal
   */
  equals(other: Dimensions): boolean {
    const otherInOurUnit = other.convertTo(this.unit);
    const precision = 0.001; // 0.001 unit tolerance

    return (
      Math.abs(this.length - otherInOurUnit.length) < precision &&
      Math.abs(this.width - otherInOurUnit.width) < precision &&
      Math.abs(this.height - otherInOurUnit.height) < precision
    );
  }

  /**
   * Format dimensions as string
   */
  format(options: { precision?: number; includeUnit?: boolean } = {}): string {
    const { precision = 2, includeUnit = true } = options;
    const l = this.length.toFixed(precision);
    const w = this.width.toFixed(precision);
    const h = this.height.toFixed(precision);
    const unitStr = includeUnit ? ` ${this.unit}` : '';

    return `${l} × ${w} × ${h}${unitStr}`;
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
  toJSON(): { length: number; width: number; height: number; unit: DimensionUnit } {
    return {
      length: this.length,
      width: this.width,
      height: this.height,
      unit: this.unit,
    };
  }

  /**
   * Factory method to create Dimensions value object
   */
  static create(length: number, width: number, height: number, unit: DimensionUnit = 'in'): Dimensions {
    return new Dimensions(length, width, height, unit);
  }

  /**
   * Create from object
   */
  static fromObject(obj: { length: number; width: number; height: number; unit: DimensionUnit }): Dimensions {
    return new Dimensions(obj.length, obj.width, obj.height, obj.unit);
  }

  /**
   * Create dimensions or return null if invalid
   */
  static createOrNull(length: number, width: number, height: number, unit: DimensionUnit = 'in'): Dimensions | null {
    try {
      return Dimensions.create(length, width, height, unit);
    } catch {
      return null;
    }
  }

  /**
   * Validate dimensions without creating instance
   */
  static isValid(length: number, width: number, height: number, unit: DimensionUnit = 'in'): boolean {
    try {
      Dimensions.create(length, width, height, unit);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get conversion factor between units
   */
  static getConversionFactor(fromUnit: DimensionUnit, toUnit: DimensionUnit): number {
    return UNIT_TO_CM[fromUnit] / UNIT_TO_CM[toUnit];
  }
}
