import { Color, InvalidColorError } from '../color.vo';

describe('Color Value Object', () => {
  describe('creation from HEX', () => {
    it('should create color from 6-digit HEX', () => {
      const color = Color.fromHex('#FF0000');
      const rgb = color.getRGB();

      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);
    });

    it('should create color from 3-digit HEX', () => {
      const color = Color.fromHex('#F00');
      const rgb = color.getRGB();

      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);
    });

    it('should create color from HEX without hash', () => {
      const color = Color.fromHex('FF0000');
      expect(color.toHex()).toBe('#FF0000');
    });

    it('should handle lowercase HEX', () => {
      const color = Color.fromHex('#ff0000');
      expect(color.toHex()).toBe('#FF0000');
    });

    it('should reject invalid HEX', () => {
      expect(() => Color.fromHex('#GGGGGG')).toThrow(InvalidColorError);
      expect(() => Color.fromHex('invalid')).toThrow(InvalidColorError);
      expect(() => Color.fromHex('#FF')).toThrow(InvalidColorError);
    });
  });

  describe('creation from RGB', () => {
    it('should create color from RGB values', () => {
      const color = Color.fromRGB(255, 128, 64);
      const rgb = color.getRGB();

      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(128);
      expect(rgb.b).toBe(64);
    });

    it('should create color from RGB object', () => {
      const color = Color.fromRGBObject({ r: 255, g: 128, b: 64 });
      const rgb = color.getRGB();

      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(128);
      expect(rgb.b).toBe(64);
    });

    it('should round RGB values', () => {
      const color = Color.fromRGB(254.7, 128.3, 64.5);
      const rgb = color.getRGB();

      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(128);
      expect(rgb.b).toBe(65);
    });

    it('should reject invalid RGB values', () => {
      expect(() => Color.fromRGB(-1, 0, 0)).toThrow(InvalidColorError);
      expect(() => Color.fromRGB(256, 0, 0)).toThrow(InvalidColorError);
      expect(() => Color.fromRGB(0, -1, 0)).toThrow(InvalidColorError);
      expect(() => Color.fromRGB(0, 256, 0)).toThrow(InvalidColorError);
    });
  });

  describe('creation from HSL', () => {
    it('should create color from HSL values', () => {
      const color = Color.fromHSL(0, 100, 50); // Red
      const rgb = color.getRGB();

      expect(rgb.r).toBe(255);
      expect(rgb.g).toBeCloseTo(0, 0);
      expect(rgb.b).toBeCloseTo(0, 0);
    });

    it('should create green from HSL', () => {
      const color = Color.fromHSL(120, 100, 50);
      const rgb = color.getRGB();

      expect(rgb.r).toBeCloseTo(0, 0);
      expect(rgb.g).toBe(255);
      expect(rgb.b).toBeCloseTo(0, 0);
    });

    it('should create blue from HSL', () => {
      const color = Color.fromHSL(240, 100, 50);
      const rgb = color.getRGB();

      expect(rgb.r).toBeCloseTo(0, 0);
      expect(rgb.g).toBeCloseTo(0, 0);
      expect(rgb.b).toBe(255);
    });

    it('should normalize hue > 360', () => {
      const color1 = Color.fromHSL(0, 100, 50);
      const color2 = Color.fromHSL(360, 100, 50);
      const color3 = Color.fromHSL(720, 100, 50);

      expect(color1.equals(color2)).toBe(true);
      expect(color1.equals(color3)).toBe(true);
    });

    it('should clamp saturation and lightness', () => {
      const color = Color.fromHSL(0, 150, -10); // Clamps to 0-100
      expect(color).toBeDefined();
    });
  });

  describe('creation from named colors', () => {
    it('should create color from name', () => {
      const red = Color.fromName('red');
      expect(red.toHex()).toBe('#FF0000');

      const blue = Color.fromName('blue');
      expect(blue.toHex()).toBe('#0000FF');
    });

    it('should be case-insensitive', () => {
      const color1 = Color.fromName('RED');
      const color2 = Color.fromName('red');

      expect(color1.equals(color2)).toBe(true);
    });

    it('should reject unknown color name', () => {
      expect(() => Color.fromName('unknown')).toThrow(InvalidColorError);
      expect(() => Color.fromName('unknown')).toThrow('Unknown color name');
    });

    it('should get list of named colors', () => {
      const names = Color.getNamedColors();
      expect(names).toContain('red');
      expect(names).toContain('blue');
      expect(names).toContain('green');
    });
  });

  describe('conversions', () => {
    it('should convert to HEX', () => {
      const color = Color.fromRGB(255, 128, 64);
      expect(color.toHex()).toBe('#FF8040');
    });

    it('should convert to RGB string', () => {
      const color = Color.fromHex('#FF8040');
      expect(color.toRGB()).toBe('rgb(255, 128, 64)');
    });

    it('should convert to HSL string', () => {
      const color = Color.fromHex('#FF0000');
      expect(color.toHSL()).toBe('hsl(0, 100%, 50%)');
    });

    it('should convert between formats accurately', () => {
      const original = Color.fromHex('#FF8040');
      const hsl = original.getHSL();
      const recreated = Color.fromHSL(hsl.h, hsl.s, hsl.l);

      expect(original.equals(recreated)).toBe(true);
    });
  });

  describe('color analysis', () => {
    it('should identify grayscale colors', () => {
      const gray = Color.fromHex('#808080');
      const black = Color.fromHex('#000000');
      const white = Color.fromHex('#FFFFFF');
      const red = Color.fromHex('#FF0000');

      expect(gray.isGrayscale()).toBe(true);
      expect(black.isGrayscale()).toBe(true);
      expect(white.isGrayscale()).toBe(true);
      expect(red.isGrayscale()).toBe(false);
    });

    it('should calculate luminance', () => {
      const white = Color.fromHex('#FFFFFF');
      const black = Color.fromHex('#000000');

      expect(white.getLuminance()).toBeCloseTo(1, 1);
      expect(black.getLuminance()).toBeCloseTo(0, 1);
    });

    it('should identify light colors', () => {
      const white = Color.fromHex('#FFFFFF');
      const lightGray = Color.fromHex('#CCCCCC');
      const darkGray = Color.fromHex('#333333');
      const black = Color.fromHex('#000000');

      expect(white.isLight()).toBe(true);
      expect(lightGray.isLight()).toBe(true);
      expect(darkGray.isLight()).toBe(false);
      expect(black.isLight()).toBe(false);
    });

    it('should identify dark colors', () => {
      const black = Color.fromHex('#000000');
      const darkGray = Color.fromHex('#333333');
      const lightGray = Color.fromHex('#CCCCCC');
      const white = Color.fromHex('#FFFFFF');

      expect(black.isDark()).toBe(true);
      expect(darkGray.isDark()).toBe(true);
      expect(lightGray.isDark()).toBe(false);
      expect(white.isDark()).toBe(false);
    });

    it('should get contrasting color', () => {
      const white = Color.fromHex('#FFFFFF');
      const black = Color.fromHex('#000000');

      const whiteContrast = white.getContrastingColor();
      const blackContrast = black.getContrastingColor();

      expect(whiteContrast.toHex()).toBe('#000000');
      expect(blackContrast.toHex()).toBe('#FFFFFF');
    });
  });

  describe('contrast ratio', () => {
    it('should calculate contrast ratio', () => {
      const white = Color.fromHex('#FFFFFF');
      const black = Color.fromHex('#000000');

      const ratio = white.getContrastRatio(black);
      expect(ratio).toBeCloseTo(21, 0); // Maximum contrast
    });

    it('should check WCAG AA compliance', () => {
      const white = Color.fromHex('#FFFFFF');
      const black = Color.fromHex('#000000');
      const gray = Color.fromHex('#767676');

      expect(white.meetsWCAGAA(black)).toBe(true);
      expect(white.meetsWCAGAA(gray)).toBe(true);
    });

    it('should check WCAG AAA compliance', () => {
      const white = Color.fromHex('#FFFFFF');
      const black = Color.fromHex('#000000');

      expect(white.meetsWCAGAAA(black)).toBe(true);
    });
  });

  describe('color manipulation', () => {
    it('should lighten color', () => {
      const color = Color.fromHex('#808080');
      const lighter = color.lighten(20);

      expect(lighter.getHSL().l).toBeGreaterThan(color.getHSL().l);
    });

    it('should darken color', () => {
      const color = Color.fromHex('#808080');
      const darker = color.darken(20);

      expect(darker.getHSL().l).toBeLessThan(color.getHSL().l);
    });

    it('should saturate color', () => {
      const color = Color.fromHex('#808080');
      const saturated = color.saturate(50);

      expect(saturated.getHSL().s).toBeGreaterThan(color.getHSL().s);
    });

    it('should desaturate color', () => {
      const color = Color.fromHex('#FF0000');
      const desaturated = color.desaturate(50);

      expect(desaturated.getHSL().s).toBeLessThan(color.getHSL().s);
    });

    it('should reject invalid percentages', () => {
      const color = Color.fromHex('#808080');

      expect(() => color.lighten(-10)).toThrow(InvalidColorError);
      expect(() => color.lighten(150)).toThrow(InvalidColorError);
      expect(() => color.darken(-10)).toThrow(InvalidColorError);
      expect(() => color.saturate(150)).toThrow(InvalidColorError);
    });
  });

  describe('equality', () => {
    it('should return true for identical colors', () => {
      const color1 = Color.fromHex('#FF0000');
      const color2 = Color.fromHex('#FF0000');

      expect(color1.equals(color2)).toBe(true);
    });

    it('should return true for colors from different formats', () => {
      const hex = Color.fromHex('#FF0000');
      const rgb = Color.fromRGB(255, 0, 0);

      expect(hex.equals(rgb)).toBe(true);
    });

    it('should return false for different colors', () => {
      const red = Color.fromHex('#FF0000');
      const blue = Color.fromHex('#0000FF');

      expect(red.equals(blue)).toBe(false);
    });
  });

  describe('string conversion', () => {
    it('should convert to string (HEX)', () => {
      const color = Color.fromRGB(255, 128, 64);
      expect(color.toString()).toBe('#FF8040');
    });

    it('should convert to JSON (RGB)', () => {
      const color = Color.fromHex('#FF8040');
      const json = color.toJSON();

      expect(json).toEqual({ r: 255, g: 128, b: 64 });
    });
  });

  describe('factory methods', () => {
    it('should create from HEX with createOrNull', () => {
      const color = Color.createOrNull('#FF0000');
      expect(color).toBeInstanceOf(Color);
    });

    it('should create from name with createOrNull', () => {
      const color = Color.createOrNull('red');
      expect(color).toBeInstanceOf(Color);
    });

    it('should return null for invalid color', () => {
      const color = Color.createOrNull('invalid');
      expect(color).toBeNull();
    });

    it('should validate color with isValid', () => {
      expect(Color.isValid('#FF0000')).toBe(true);
      expect(Color.isValid('red')).toBe(true);
      expect(Color.isValid('invalid')).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should not modify original after manipulation', () => {
      const original = Color.fromHex('#808080');
      const lighter = original.lighten(20);

      expect(original.toHex()).toBe('#808080');
      expect(lighter.toHex()).not.toBe('#808080');
    });
  });
});
