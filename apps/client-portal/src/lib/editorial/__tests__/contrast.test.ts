import { contrastRatio, hexToRgb, relativeLuminance } from '../contrast';

describe('contrast', () => {
  it('parses six- and three-digit hex', () => {
    expect(hexToRgb('#FAF7F2')).toEqual([250, 247, 242]);
    expect(hexToRgb('fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('not a colour')).toBeNull();
  });

  it('gives WCAG luminance at the ends of the scale', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 6);
  });

  it('measures 21:1 for black on white, symmetric in argument order', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 6);
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 6);
  });

  it('measures the page pairs the plates rely on', () => {
    // ink on paper ≈ 13:1 (PLAN arrival table); caption ink on paper clears 4.5:1
    expect(contrastRatio('#2C2926', '#FAF7F2')!).toBeGreaterThan(13);
    expect(contrastRatio('#4E4339', '#FAF7F2')!).toBeGreaterThan(4.5);
    expect(contrastRatio('#FAF7F2', '#FAF7F2')).toBeCloseTo(1, 6);
  });

  it('returns null for an unreadable colour', () => {
    expect(contrastRatio('#zzz', '#fff')).toBeNull();
  });
});
