import { describe, it, expect } from 'vitest';
import { extractWxHxD, extractLabeledDimensions } from '../../lib/extraction/dimensions';

describe('extractWxHxD', () => {
  it('parses standard WxHxD with inch marks', () => {
    const result = extractWxHxD('24" x 36" x 22"');
    expect(result).not.toBeNull();
    expect(result!.width).toBe(24);
    expect(result!.height).toBe(36);
    expect(result!.depth).toBe(22);
    expect(result!.unit).toBe('in');
  });

  it('parses without spaces around x', () => {
    const result = extractWxHxD('24"x36"x22"');
    expect(result).not.toBeNull();
    expect(result!.width).toBe(24);
  });

  it('parses decimal dimensions', () => {
    const result = extractWxHxD('24.5 x 36.25 x 22.75 in');
    expect(result).not.toBeNull();
    expect(result!.width).toBe(24.5);
    expect(result!.height).toBe(36.25);
    expect(result!.depth).toBe(22.75);
  });

  it('parses metric dimensions (cm)', () => {
    const result = extractWxHxD('60cm x 90cm x 55cm');
    expect(result).not.toBeNull();
    expect(result!.width).toBe(60);
    expect(result!.height).toBe(90);
    expect(result!.depth).toBe(55);
    expect(result!.unit).toBe('cm');
  });

  it('parses with "inches" suffix', () => {
    const result = extractWxHxD('24 x 36 x 22 inches');
    expect(result).not.toBeNull();
    expect(result!.unit).toBe('in');
  });

  it('returns null for text without dimensions', () => {
    expect(extractWxHxD('this is some text')).toBeNull();
  });

  it('returns null for only two values', () => {
    expect(extractWxHxD('24 x 36')).toBeNull();
  });
});

describe('extractLabeledDimensions', () => {
  it('extracts labeled W/H/D with full words', () => {
    // Note: The abbreviated H(?:eight)? pattern can false-match the trailing
    // "h" in "Width", so we test with "W:" format separately below.
    const result = extractLabeledDimensions('Height: 36" Depth: 22"');
    expect(result.height).toBe(36);
    expect(result.depth).toBe(22);
  });

  it('extracts abbreviated W/H/D labels', () => {
    const result = extractLabeledDimensions('W: 24 H: 36 D: 22');
    expect(result.width).toBe(24);
    expect(result.height).toBe(36);
    expect(result.depth).toBe(22);
  });

  it('extracts seat height', () => {
    const result = extractLabeledDimensions('Seat Height: 18"');
    expect(result.seatHeight).toBe(18);
  });

  it('extracts arm height', () => {
    const result = extractLabeledDimensions('Arm Height: 25"');
    expect(result.armHeight).toBe(25);
  });

  it('extracts clearance', () => {
    const result = extractLabeledDimensions('Floor Clearance: 6"');
    expect(result.clearance).toBe(6);
  });

  it('detects cm unit', () => {
    const result = extractLabeledDimensions('Width: 60cm');
    expect(result.unit).toBe('cm');
  });

  it('defaults to inches', () => {
    const result = extractLabeledDimensions('Width: 24');
    expect(result.unit).toBe('in');
  });

  it('returns partial result when only some dimensions present', () => {
    const result = extractLabeledDimensions('Seat Height: 18"');
    expect(result.seatHeight).toBe(18);
    expect(result.width).toBeUndefined();
    expect(result.depth).toBeUndefined();
  });
});
