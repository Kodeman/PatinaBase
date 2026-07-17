import { describe, it, expect } from 'vitest';
import {
  CONFIG_FIELD_SCHEMAS,
  formatFieldForForm,
  getFieldValue,
  hasTypedSchema,
  parseBusinessHours,
  parseFieldFromForm,
  serializeBusinessHours,
  setFieldValue,
} from '../config-form';

describe('CONFIG_FIELD_SCHEMAS', () => {
  it('covers all six flat-scalar seed keys (00351)', () => {
    expect(Object.keys(CONFIG_FIELD_SCHEMAS).sort()).toEqual(
      [
        'commission_rate_default',
        'inspection_window_days_default',
        'margin_floor_warning',
        'pledge_accrual',
        'settlement_variance_tolerance',
        'sla_hours',
      ].sort(),
    );
  });

  it('business_hours has no flat schema (structured editor instead)', () => {
    expect(hasTypedSchema('business_hours')).toBe(false);
    expect(hasTypedSchema('margin_floor_warning')).toBe(true);
  });
});

describe('getFieldValue / setFieldValue', () => {
  it('reads a nested path', () => {
    expect(getFieldValue({ abs_cents: 2500, pct_of_po: 0.02 }, ['abs_cents'])).toBe(2500);
  });

  it('setFieldValue is immutable and preserves sibling fields', () => {
    const original = { abs_cents: 2500, pct_of_po: 0.02 };
    const updated = setFieldValue(original, ['pct_of_po'], 0.05);
    expect(updated).toEqual({ abs_cents: 2500, pct_of_po: 0.05 });
    expect(original.pct_of_po).toBe(0.02); // untouched
  });

  it('setFieldValue tolerates a null/undefined base', () => {
    expect(setFieldValue(null, ['rate'], 0.16)).toEqual({ rate: 0.16 });
    expect(setFieldValue(undefined, ['rate'], 0.16)).toEqual({ rate: 0.16 });
  });
});

describe('formatFieldForForm / parseFieldFromForm round-trip', () => {
  it('pct: fraction <-> whole-percent string', () => {
    expect(formatFieldForForm('pct', 0.16)).toBe('16');
    expect(parseFieldFromForm('pct', '16')).toBe(0.16);
    expect(formatFieldForForm('pct', 0.025)).toBe('2.5');
  });

  it('cents: integer cents <-> dollar string', () => {
    expect(formatFieldForForm('cents', 2500)).toBe('25.00');
    expect(parseFieldFromForm('cents', '25.00')).toBe(2500);
    expect(parseFieldFromForm('cents', '25')).toBe(2500);
  });

  it('hours/days/minutes pass through as plain numbers', () => {
    expect(formatFieldForForm('hours', 4)).toBe('4');
    expect(parseFieldFromForm('days', '3')).toBe(3);
    expect(parseFieldFromForm('minutes', '1')).toBe(1);
  });

  it('empty/null input formats to empty string', () => {
    expect(formatFieldForForm('pct', null)).toBe('');
    expect(formatFieldForForm('cents', undefined)).toBe('');
  });

  it('invalid parse input falls back to 0 rather than NaN (never corrupts the payload mid-edit)', () => {
    expect(parseFieldFromForm('pct', 'not a number')).toBe(0);
    expect(parseFieldFromForm('cents', '')).toBe(0);
  });

  it.each(CONFIG_FIELD_SCHEMAS.sla_hours!.map((f) => f.path[0]))(
    'sla_hours field %s has a schema entry',
    (path) => {
      const field = CONFIG_FIELD_SCHEMAS.sla_hours!.find((f) => f.path[0] === path)!;
      expect(field.label.length).toBeGreaterThan(0);
    },
  );
});

describe('business_hours parse/serialize', () => {
  const SEEDED_VALUE = {
    timezone: 'America/Chicago',
    week: {
      mon: ['09:00', '17:00'],
      tue: ['09:00', '17:00'],
      wed: ['09:00', '17:00'],
      thu: ['09:00', '17:00'],
      fri: ['09:00', '17:00'],
    },
    holidays: [],
  };

  it('parses the seeded (00351) business_hours value', () => {
    const form = parseBusinessHours(SEEDED_VALUE);
    expect(form.timezone).toBe('America/Chicago');
    expect(form.week.mon).toEqual({ start: '09:00', end: '17:00' });
    expect(form.week.sat).toBeUndefined();
    expect(form.holidays).toEqual([]);
  });

  it('round-trips through serialize back to the same shape fulfillment_business_hours_between reads', () => {
    const form = parseBusinessHours(SEEDED_VALUE);
    expect(serializeBusinessHours(form)).toEqual(SEEDED_VALUE);
  });

  it('tolerates a missing/malformed value without throwing', () => {
    expect(parseBusinessHours(null)).toEqual({ timezone: 'America/Chicago', week: {}, holidays: [] });
    expect(parseBusinessHours({ week: 'not-an-object' } as never)).toEqual({
      timezone: 'America/Chicago',
      week: {},
      holidays: [],
    });
  });

  it('holidays round-trip as a plain date-string array', () => {
    const form = parseBusinessHours({ ...SEEDED_VALUE, holidays: ['2026-12-25', '2026-01-01'] });
    expect(form.holidays).toEqual(['2026-12-25', '2026-01-01']);
    expect(serializeBusinessHours(form).holidays).toEqual(['2026-12-25', '2026-01-01']);
  });
});
