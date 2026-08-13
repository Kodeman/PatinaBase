import { parseUsdCents, strictImportText, strictOptionalUuid } from './validation';

describe('catalog import validation', () => {
  it.each([
    ['$1,234.56', 123456],
    ['USD 1,234.50', 123450],
    ['0.99', 99],
    [1250, 125000],
  ])('parses strict USD price %p', (raw, cents) => {
    expect(parseUsdCents(raw)).toEqual({ value: cents, error: null });
  });

  it.each(['=1+1', '+SUM(A1)', '@A1', '-cmd', ' 12.00', '12.00 ', '1 2', '1,23.00', '1.234', '12.', '.99', '$$12', 'EUR 12', '-1', 'NaN'])
    ('rejects malformed or unsafe price %p', (raw) => {
      expect(parseUsdCents(raw).error).toBe('Invalid price');
    });

  it('rejects formula, control, and whitespace text before insert', () => {
    expect(strictImportText('=HYPERLINK("x")', 'name', true).error).toMatch(/formula-like/);
    expect(strictImportText('Chair\u0000', 'name', true).error).toMatch(/control/);
    expect(strictImportText('   ', 'name', true).error).toMatch(/whitespace-only/);
    expect(strictImportText(' Chair', 'name', true).error).toMatch(/surrounding whitespace/);
  });
});

describe('strictOptionalUuid', () => {
  it('accepts only canonical UUID-shaped vendor identities', () => {
    expect(strictOptionalUuid('123e4567-e89b-42d3-a456-426614174000', 'vendorId')).toEqual({
      value: '123e4567-e89b-42d3-a456-426614174000', error: null,
    });
    expect(strictOptionalUuid('Acme Furniture', 'vendorId').error).toMatch(/expected UUID/);
    expect(strictOptionalUuid(' 123e4567-e89b-42d3-a456-426614174000', 'vendorId').error).toMatch(/expected UUID/);
  });
});
