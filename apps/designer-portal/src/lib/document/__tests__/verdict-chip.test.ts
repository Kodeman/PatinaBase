import { verdictChipSpec } from '../verdict-chip';

describe('verdictChipSpec', () => {
  it('marks Approved as a green record with forest ink', () => {
    expect(verdictChipSpec('approved')).toEqual({
      label: 'Approved', color: 'var(--color-forest)', tone: 'record',
    });
    expect(verdictChipSpec('approved', '2026-10-20')).toEqual(verdictChipSpec('approved'));
  });

  it('leaves rejection and neutral mappings unchanged', () => {
    expect(verdictChipSpec('rejected')).toEqual({ label: 'Flagged', color: 'var(--color-clay)' });
    expect(verdictChipSpec('rejected', '2026-10-20')).toEqual({ label: 'Flag cleared', color: 'var(--text-muted)' });
    expect(verdictChipSpec('comment')).toEqual({ label: 'Noted', color: 'var(--text-muted)' });
    expect(verdictChipSpec(null)).toBeNull();
    expect(verdictChipSpec(undefined)).toBeNull();
  });
});
