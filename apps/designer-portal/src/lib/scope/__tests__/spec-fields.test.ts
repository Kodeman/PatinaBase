import {
  slugifyFieldKey,
  deriveUniqueFieldKey,
  coerceFieldValue,
  withFieldValue,
  nextFieldSortOrder,
  reorderedFieldDefs,
} from '../spec-fields';

// ─── S6 · field_key slugging ─────────────────────────────────────────────────

describe('slugifyFieldKey', () => {
  it('lowercases and underscores non-alphanumeric runs', () => {
    expect(slugifyFieldKey('Finish')).toBe('finish');
    expect(slugifyFieldKey('Lead Vendor')).toBe('lead_vendor');
    expect(slugifyFieldKey('COM / Fabric')).toBe('com_fabric');
    expect(slugifyFieldKey('Spec-Sheet URL')).toBe('spec_sheet_url');
  });

  it('trims edge underscores and collapses repeats', () => {
    expect(slugifyFieldKey('  Finish!!  ')).toBe('finish');
    expect(slugifyFieldKey('—Notes—')).toBe('notes');
  });

  it('falls back to "field" for empty/symbol-only names', () => {
    expect(slugifyFieldKey('')).toBe('field');
    expect(slugifyFieldKey('***')).toBe('field');
  });

  it('keeps digits', () => {
    expect(slugifyFieldKey('Grade 2')).toBe('grade_2');
  });
});

describe('deriveUniqueFieldKey', () => {
  it('returns the base slug when free', () => {
    expect(deriveUniqueFieldKey('Finish', [])).toBe('finish');
    expect(deriveUniqueFieldKey('Finish', ['color', 'lead_vendor'])).toBe('finish');
  });

  it('suffixes _2, _3 on collision (case-insensitive)', () => {
    expect(deriveUniqueFieldKey('Finish', ['finish'])).toBe('finish_2');
    expect(deriveUniqueFieldKey('Finish', ['FINISH', 'finish_2'])).toBe('finish_3');
  });

  it('ignores null/undefined existing keys', () => {
    expect(deriveUniqueFieldKey('Finish', [null, undefined, 'finish'])).toBe('finish_2');
  });
});

// ─── S6 · value coercion + immutable-key writes ──────────────────────────────

describe('coerceFieldValue', () => {
  it('trims text/url and returns null when empty', () => {
    expect(coerceFieldValue('text', '  walnut ')).toBe('walnut');
    expect(coerceFieldValue('url', ' https://x.co ')).toBe('https://x.co');
    expect(coerceFieldValue('text', '   ')).toBeNull();
  });

  it('parses numbers, rejecting non-numeric', () => {
    expect(coerceFieldValue('number', '12.5')).toBe(12.5);
    expect(coerceFieldValue('number', 'abc')).toBeNull();
    expect(coerceFieldValue('number', '')).toBeNull();
  });
});

describe('withFieldValue', () => {
  it('writes a coerced value under field_key without mutating the input', () => {
    const before = { finish: 'oak' };
    const after = withFieldValue(before, 'grade', 'number', '2');
    expect(after).toEqual({ finish: 'oak', grade: 2 });
    expect(before).toEqual({ finish: 'oak' }); // immutable
  });

  it('deletes the key on an empty value', () => {
    expect(withFieldValue({ finish: 'oak', grade: 2 }, 'grade', 'number', '')).toEqual({
      finish: 'oak',
    });
  });

  it('handles a null/undefined starting object', () => {
    expect(withFieldValue(null, 'finish', 'text', 'oak')).toEqual({ finish: 'oak' });
  });
});

// ─── S6 · defs-manager derivations ───────────────────────────────────────────

describe('nextFieldSortOrder', () => {
  it('is 0 for an empty list, else max+1', () => {
    expect(nextFieldSortOrder([])).toBe(0);
    expect(nextFieldSortOrder([{ sort_order: 0 }, { sort_order: 3 }])).toBe(4);
  });
});

describe('reorderedFieldDefs', () => {
  const defs = [
    { id: 'a', sort_order: 0 },
    { id: 'b', sort_order: 1 },
    { id: 'c', sort_order: 2 },
  ];

  it('swaps two adjacent sort_orders when moving later', () => {
    expect(reorderedFieldDefs(defs, 'a', 1)).toEqual([
      { id: 'a', sort_order: 1 },
      { id: 'b', sort_order: 0 },
    ]);
  });

  it('swaps when moving earlier', () => {
    expect(reorderedFieldDefs(defs, 'c', -1)).toEqual([
      { id: 'c', sort_order: 1 },
      { id: 'b', sort_order: 2 },
    ]);
  });

  it('is a no-op at the edges or for an unknown id', () => {
    expect(reorderedFieldDefs(defs, 'a', -1)).toEqual([]);
    expect(reorderedFieldDefs(defs, 'c', 1)).toEqual([]);
    expect(reorderedFieldDefs(defs, 'z', 1)).toEqual([]);
  });
});
