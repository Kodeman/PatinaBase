import { describe, it, expect } from 'vitest';
import { extractMaterialsFromText, getMaterialCategory } from '../../lib/extraction/materials';

describe('extractMaterialsFromText', () => {
  it('finds single wood material', () => {
    const result = extractMaterialsFromText('Solid oak construction');
    expect(result).toContain('Oak');
  });

  it('finds multiple materials', () => {
    const result = extractMaterialsFromText(
      'This chair features a walnut frame with leather upholstery and brass accents'
    );
    expect(result).toContain('Walnut');
    expect(result).toContain('Leather');
    expect(result).toContain('Brass');
  });

  it('normalizes material names to title case', () => {
    const result = extractMaterialsFromText('stainless steel base');
    expect(result).toContain('Stainless Steel');
  });

  it('handles compound material names', () => {
    const result = extractMaterialsFromText('features reclaimed wood and performance fabric');
    expect(result).toContain('Reclaimed Wood');
    expect(result).toContain('Performance Fabric');
  });

  it('avoids partial matches', () => {
    // "ash" should not match inside "fashion"
    const result = extractMaterialsFromText('This is a fashion item');
    expect(result).not.toContain('Ash');
  });

  it('returns empty array for text with no materials', () => {
    expect(extractMaterialsFromText('hello world')).toEqual([]);
  });

  it('deduplicates results', () => {
    const result = extractMaterialsFromText('oak frame, solid oak legs, oak veneer');
    const oakCount = result.filter(m => m === 'Oak').length;
    expect(oakCount).toBe(1);
  });

  it('finds boucle without accent', () => {
    const result = extractMaterialsFromText('upholstered in boucle fabric');
    expect(result).toContain('Boucle');
  });

  it('finds glass materials', () => {
    const result = extractMaterialsFromText('tempered glass top');
    expect(result).toContain('Tempered Glass');
  });

  it('finds natural fiber materials', () => {
    const result = extractMaterialsFromText('rattan and wicker basket weave');
    expect(result).toContain('Rattan');
    expect(result).toContain('Wicker');
  });
});

describe('getMaterialCategory', () => {
  it('classifies oak as wood', () => {
    expect(getMaterialCategory('Oak')).toBe('wood');
  });

  it('classifies brass as metal', () => {
    expect(getMaterialCategory('Brass')).toBe('metal');
  });

  it('classifies leather as fabric', () => {
    expect(getMaterialCategory('Leather')).toBe('fabric');
  });

  it('classifies marble as stone', () => {
    expect(getMaterialCategory('Marble')).toBe('stone');
  });

  it('classifies rattan as natural', () => {
    expect(getMaterialCategory('Rattan')).toBe('natural');
  });

  it('classifies tempered glass as glass', () => {
    expect(getMaterialCategory('Tempered Glass')).toBe('glass');
  });

  it('returns null for unknown material', () => {
    expect(getMaterialCategory('Unicornium')).toBeNull();
  });
});
