const FORMULA_PREFIX = /^(?:[=+@]|-[A-Za-z])/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
const USD_AMOUNT = /^(?:\$|USD )?(?:(?:0|[1-9]\d*)|(?:[1-9]\d{0,2}(?:,\d{3})+))(?:\.(\d{1,2}))?$/;

export type ValidationResult<T> = { value: T; error: null } | { value: null; error: string };

export function strictImportText(raw: unknown, field: string, required = false): ValidationResult<string | null> {
  if (raw === null || raw === undefined || raw === '') {
    return required ? { value: null, error: `Missing required field: ${field}` } : { value: null, error: null };
  }
  if (typeof raw !== 'string') return { value: null, error: `Invalid ${field}: expected text` };
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, error: `Invalid ${field}: whitespace-only value` };
  if (trimmed !== raw) return { value: null, error: `Invalid ${field}: surrounding whitespace` };
  if (CONTROL_CHARACTER.test(raw)) return { value: null, error: `Invalid ${field}: control character` };
  if (FORMULA_PREFIX.test(trimmed)) return { value: null, error: `Invalid ${field}: formula-like value` };
  return { value: trimmed, error: null };
}

export function parseUsdCents(raw: unknown): ValidationResult<number | null> {
  if (raw === null || raw === undefined || raw === '') return { value: null, error: null };
  if (typeof raw === 'number') {
    const cents = Math.round(raw * 100);
    if (!Number.isFinite(raw) || raw < 0 || !Number.isSafeInteger(cents) || Math.abs(cents / 100 - raw) > 1e-9) {
      return { value: null, error: 'Invalid price' };
    }
    return { value: cents, error: null };
  }
  if (typeof raw !== 'string' || raw !== raw.trim() || CONTROL_CHARACTER.test(raw) || FORMULA_PREFIX.test(raw) || !USD_AMOUNT.test(raw)) {
    return { value: null, error: 'Invalid price' };
  }
  const normalized = raw.replace(/^(?:\$|USD )/, '').replaceAll(',', '');
  const [dollars, fraction = ''] = normalized.split('.');
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents)
    ? { value: cents, error: null }
    : { value: null, error: 'Invalid price' };
}
