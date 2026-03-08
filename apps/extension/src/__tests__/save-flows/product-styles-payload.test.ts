import { describe, it, expect } from 'vitest';
import { buildProductStyleInserts } from '../../lib/payloads';

// Columns on `product_styles` from initial schema + 00005 teaching schema
const PRODUCT_STYLES_COLUMNS = new Set([
  'id', 'product_id', 'style_id', 'confidence', 'assigned_by', 'created_at',
  // 00005 additions
  'is_primary', 'source',
]);

describe('buildProductStyleInserts', () => {
  it('only includes columns that exist on product_styles', () => {
    const rows = buildProductStyleInserts('prod-1', ['style-a', 'style-b'], 'user-1');

    for (const row of rows) {
      for (const key of Object.keys(row)) {
        expect(
          PRODUCT_STYLES_COLUMNS.has(key),
          `"${key}" is not a column on product_styles`
        ).toBe(true);
      }
    }
  });

  it('marks the first style as primary', () => {
    const rows = buildProductStyleInserts('p1', ['s1', 's2', 's3'], 'u1');
    expect(rows[0].is_primary).toBe(true);
    expect(rows[1].is_primary).toBe(false);
    expect(rows[2].is_primary).toBe(false);
  });

  it('sets source to "manual" for all rows', () => {
    const rows = buildProductStyleInserts('p1', ['s1', 's2'], 'u1');
    for (const row of rows) {
      expect(row.source).toBe('manual');
    }
  });

  it('sets confidence to 1.0 for manual assignments', () => {
    const rows = buildProductStyleInserts('p1', ['s1'], 'u1');
    expect(rows[0].confidence).toBe(1.0);
  });

  it('generates one row per style_id', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const rows = buildProductStyleInserts('p1', ids, 'u1');
    expect(rows).toHaveLength(4);
    expect(rows.map(r => r.style_id)).toEqual(ids);
  });

  it('returns empty array for no styles', () => {
    expect(buildProductStyleInserts('p1', [], 'u1')).toEqual([]);
  });
});
