/**
 * Color Value Object
 *
 * Immutable value object representing a color.
 * Supports HEX, RGB, and HSL formats with conversion between them.
 */

export class InvalidColorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidColorError';
  }
}

export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export class Color {
  private static readonly HEX_REGEX = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

  // Common named colors
  private static readonly NAMED_COLORS: Record<string, string> = {
    black: '#000000',
    white: '#FFFFFF',
    red: '#FF0000',
    green: '#00FF00',
    blue: '#0000FF',
    yellow: '#FFFF00',
    cyan: '#00FFFF',
    magenta: '#FF00FF',
    gray: '#808080',
    grey: '#808080',
    silver: '#C0C0C0',
    maroon: '#800000',
    olive: '#808000',
    lime: '#00FF00',
    aqua: '#00FFFF',
    teal: '#008080',
    navy: '#000080',
    fuchsia: '#FF00FF',
    purple: '#800080',
  };

  private constructor(
    private readonly r: number,
    private readonly g: number,
    private readonly b: number,
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.isValidRGBValue(this.r) || !this.isValidRGBValue(this.g) || !this.isValidRGBValue(this.b)) {
      throw new InvalidColorError(`Invalid RGB values: r=${this.r}, g=${this.g}, b=${this.b}`);
    }
  }

  private isValidRGBValue(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= 255;
  }

  /**
   * Get RGB values
   */
  getRGB(): RGB {
    return { r: this.r, g: this.g, b: this.b };
  }

  /**
   * Get HSL values
   */
  getHSL(): HSL {
    const r = this.r / 255;
    const g = this.g / 255;
    const b = this.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (delta !== 0) {
      s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

      switch (max) {
        case r:
          h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / delta + 2) / 6;
          break;
        case b:
          h = ((r - g) / delta + 4) / 6;
          break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  /**
   * Get HEX value
   */
  toHex(): string {
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(this.r)}${toHex(this.g)}${toHex(this.b)}`.toUpperCase();
  }

  /**
   * Get RGB string
   */
  toRGB(): string {
    return `rgb(${this.r}, ${this.g}, ${this.b})`;
  }

  /**
   * Get HSL string
   */
  toHSL(): string {
    const { h, s, l } = this.getHSL();
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  /**
   * Check if color is grayscale
   */
  isGrayscale(): boolean {
    return this.r === this.g && this.g === this.b;
  }

  /**
   * Get luminance (0-1)
   */
  getLuminance(): number {
    const sRGB = [this.r / 255, this.g / 255, this.b / 255];
    const linear = sRGB.map((val) => {
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  /**
   * Check if color is light (luminance > 0.5)
   */
  isLight(): boolean {
    return this.getLuminance() > 0.5;
  }

  /**
   * Check if color is dark (luminance <= 0.5)
   */
  isDark(): boolean {
    return !this.isLight();
  }

  /**
   * Get contrasting text color (black or white)
   */
  getContrastingColor(): Color {
    return this.isLight() ? Color.fromHex('#000000') : Color.fromHex('#FFFFFF');
  }

  /**
   * Calculate contrast ratio with another color (WCAG)
   */
  getContrastRatio(other: Color): number {
    const l1 = this.getLuminance();
    const l2 = other.getLuminance();
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Check if contrast ratio meets WCAG AA standard (4.5:1 for normal text)
   */
  meetsWCAGAA(other: Color): boolean {
    return this.getContrastRatio(other) >= 4.5;
  }

  /**
   * Check if contrast ratio meets WCAG AAA standard (7:1 for normal text)
   */
  meetsWCAGAAA(other: Color): boolean {
    return this.getContrastRatio(other) >= 7;
  }

  /**
   * Lighten color by percentage (0-100)
   */
  lighten(percentage: number): Color {
    if (percentage < 0 || percentage > 100) {
      throw new InvalidColorError('Percentage must be between 0 and 100');
    }

    const hsl = this.getHSL();
    const newL = Math.min(100, hsl.l + percentage);

    return Color.fromHSL(hsl.h, hsl.s, newL);
  }

  /**
   * Darken color by percentage (0-100)
   */
  darken(percentage: number): Color {
    if (percentage < 0 || percentage > 100) {
      throw new InvalidColorError('Percentage must be between 0 and 100');
    }

    const hsl = this.getHSL();
    const newL = Math.max(0, hsl.l - percentage);

    return Color.fromHSL(hsl.h, hsl.s, newL);
  }

  /**
   * Saturate color by percentage (0-100)
   */
  saturate(percentage: number): Color {
    if (percentage < 0 || percentage > 100) {
      throw new InvalidColorError('Percentage must be between 0 and 100');
    }

    const hsl = this.getHSL();
    const newS = Math.min(100, hsl.s + percentage);

    return Color.fromHSL(hsl.h, newS, hsl.l);
  }

  /**
   * Desaturate color by percentage (0-100)
   */
  desaturate(percentage: number): Color {
    if (percentage < 0 || percentage > 100) {
      throw new InvalidColorError('Percentage must be between 0 and 100');
    }

    const hsl = this.getHSL();
    const newS = Math.max(0, hsl.s - percentage);

    return Color.fromHSL(hsl.h, newS, hsl.l);
  }

  /**
   * Check if two colors are equal
   */
  equals(other: Color): boolean {
    return this.r === other.r && this.g === other.g && this.b === other.b;
  }

  /**
   * Convert to string representation (HEX)
   */
  toString(): string {
    return this.toHex();
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): RGB {
    return this.getRGB();
  }

  /**
   * Factory method to create Color from HEX
   */
  static fromHex(hex: string): Color {
    const normalized = hex.trim();

    if (!Color.HEX_REGEX.test(normalized)) {
      throw new InvalidColorError(`Invalid HEX color: ${hex}`);
    }

    let hexValue = normalized.replace('#', '');

    // Expand shorthand (e.g., "F00" -> "FF0000")
    if (hexValue.length === 3) {
      hexValue = hexValue
        .split('')
        .map((char) => char + char)
        .join('');
    }

    const r = parseInt(hexValue.substring(0, 2), 16);
    const g = parseInt(hexValue.substring(2, 4), 16);
    const b = parseInt(hexValue.substring(4, 6), 16);

    return new Color(r, g, b);
  }

  /**
   * Factory method to create Color from RGB
   */
  static fromRGB(r: number, g: number, b: number): Color {
    return new Color(Math.round(r), Math.round(g), Math.round(b));
  }

  /**
   * Factory method to create Color from RGB object
   */
  static fromRGBObject(rgb: RGB): Color {
    return new Color(rgb.r, rgb.g, rgb.b);
  }

  /**
   * Factory method to create Color from HSL
   */
  static fromHSL(h: number, s: number, l: number): Color {
    // Normalize values
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0,
      g = 0,
      b = 0;

    if (h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      g = 0;
      b = c;
    } else {
      r = c;
      g = 0;
      b = x;
    }

    return new Color(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255));
  }

  /**
   * Factory method to create Color from named color
   */
  static fromName(name: string): Color {
    const hex = Color.NAMED_COLORS[name.toLowerCase()];
    if (!hex) {
      throw new InvalidColorError(`Unknown color name: ${name}`);
    }
    return Color.fromHex(hex);
  }

  /**
   * Create color or return null if invalid
   */
  static createOrNull(value: string): Color | null {
    try {
      // Try HEX
      if (value.startsWith('#') || Color.HEX_REGEX.test(value)) {
        return Color.fromHex(value);
      }

      // Try named color
      if (Color.NAMED_COLORS[value.toLowerCase()]) {
        return Color.fromName(value);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if string is a valid color
   */
  static isValid(value: string): boolean {
    return Color.createOrNull(value) !== null;
  }

  /**
   * Get list of supported named colors
   */
  static getNamedColors(): string[] {
    return Object.keys(Color.NAMED_COLORS);
  }
}
