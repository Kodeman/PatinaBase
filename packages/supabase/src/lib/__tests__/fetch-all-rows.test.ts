import { describe, expect, it } from 'vitest';
import { fetchAllRows } from '../fetch-all-rows';

describe('fetchAllRows', () => {
  it.each([0, 999, 1000, 1001, 2001, 2500])('reads all %i ordered rows', async (size) => {
    const rows = Array.from({ length: size }, (_, i) => ({ id: `id-${i}` }));
    const ranges: number[][] = [];
    const result = await fetchAllRows((from, to) => {
      ranges.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    });
    expect(result).toEqual(rows);
    expect(ranges).toEqual(Array.from({ length: Math.floor(size / 1000) + 1 }, (_, i) => [i * 1000, i * 1000 + 999]));
  });

  it('stops a builder that never applies the range', async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }));
    await expect(fetchAllRows(() => Promise.resolve({ data: page, error: null }))).rejects.toThrow('.range(from, to)');
  });

  it('rejects the whole read on a later-page failure', async () => {
    await expect(fetchAllRows((from) => Promise.resolve(from === 1000
      ? { data: null, error: new Error('page refused') }
      : { data: Array.from({ length: 1000 }, (_, i) => ({ id: String(i) })), error: null }),
    )).rejects.toThrow('page refused');
  });
});
