// @patina/fulfillment — the Config editor's form state (S4, spec §10).
//
// fulfillment_config rows are `{key, value: jsonb}` (00351 seed: seven keys —
// commission_rate_default, settlement_variance_tolerance, margin_floor_warning,
// pledge_accrual, sla_hours, inspection_window_days_default, business_hours).
// Six of the seven are flat rate/pct/hours/days/cents scalars addressed by
// CONFIG_FIELD_SCHEMAS below; business_hours is structured (a week + a
// holiday-date list) and gets its own parse/serialize pair.
//
// These are pure functions ONLY — no fetch, no React — so the editor's typed-
// field behavior (percent <-> fraction, dollars <-> cents) is unit-testable
// without a live stack, matching money.ts/format.ts's posture.

export type ConfigFieldType = 'pct' | 'cents' | 'hours' | 'days' | 'minutes' | 'string';

export interface ConfigFieldSchema {
  /** Path into the row's jsonb `value`, e.g. ['rate']. */
  path: string[];
  label: string;
  type: ConfigFieldType;
}

/** Every flat (non business_hours) config key's typed fields. */
export const CONFIG_FIELD_SCHEMAS: Record<string, ConfigFieldSchema[]> = {
  commission_rate_default: [{ path: ['rate'], label: 'Default commission rate', type: 'pct' }],
  settlement_variance_tolerance: [
    { path: ['abs_cents'], label: 'Absolute tolerance', type: 'cents' },
    { path: ['pct_of_po'], label: 'Percent of PO value', type: 'pct' },
  ],
  margin_floor_warning: [{ path: ['pct'], label: 'Margin floor warning', type: 'pct' }],
  pledge_accrual: [{ path: ['rate'], label: 'Pledge accrual rate', type: 'pct' }],
  sla_hours: [
    { path: ['intake_visible_minutes'], label: 'Intake visible within', type: 'minutes' },
    { path: ['split_confirm_business_hours'], label: 'Split-confirm SLA', type: 'hours' },
    { path: ['ack_chase_business_days'], label: 'Ack-chase after', type: 'days' },
    { path: ['tracking_after_ship_hours'], label: 'Tracking-entry SLA', type: 'hours' },
  ],
  inspection_window_days_default: [
    { path: ['parcel'], label: 'Parcel inspection window', type: 'days' },
    { path: ['ltl'], label: 'LTL inspection window', type: 'days' },
    { path: ['white_glove'], label: 'White-glove inspection window', type: 'days' },
  ],
};

/** business_hours (and any future unknown key) falls back to the raw editor —
 *  the config table page checks this before rendering a schema-driven form. */
export function hasTypedSchema(key: string): boolean {
  return key in CONFIG_FIELD_SCHEMAS;
}

export function getFieldValue(value: Record<string, unknown> | null | undefined, path: string[]): unknown {
  return path.reduce<unknown>(
    (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
    value ?? {},
  );
}

/** Immutable — returns a NEW object with `path` set to `newValue`, leaving
 *  every sibling untouched (so editing one field in a multi-field key like
 *  settlement_variance_tolerance never drops the others). */
export function setFieldValue(
  value: Record<string, unknown> | null | undefined,
  path: string[],
  newValue: unknown,
): Record<string, unknown> {
  const base = value ?? {};
  if (path.length === 0) return base;
  const [head, ...rest] = path;
  if (rest.length === 0) {
    return { ...base, [head]: newValue };
  }
  const current = (base[head] ?? {}) as Record<string, unknown>;
  return { ...base, [head]: setFieldValue(current, rest, newValue) };
}

/** jsonb value -> the string a text input shows. Fractions (0.16) become
 *  whole-percent strings ("16"); cents (2500) become dollar strings ("25.00"). */
export function formatFieldForForm(type: ConfigFieldType, raw: unknown): string {
  if (raw == null || raw === '') return '';
  switch (type) {
    case 'pct':
      return String(Math.round(Number(raw) * 10000) / 100);
    case 'cents':
      return (Number(raw) / 100).toFixed(2);
    case 'hours':
    case 'days':
    case 'minutes':
      return String(raw);
    case 'string':
    default:
      return String(raw);
  }
}

/** The text input's string -> the jsonb value to persist. Inverse of
 *  formatFieldForForm; invalid/empty input parses to a safe zero rather than
 *  NaN so a bad keystroke never corrupts the payload mid-edit. */
export function parseFieldFromForm(type: ConfigFieldType, formValue: string): unknown {
  const trimmed = formValue.trim();
  switch (type) {
    case 'pct': {
      const n = Number(trimmed);
      return Number.isFinite(n) ? Math.round((n / 100) * 10000) / 10000 : 0;
    }
    case 'cents': {
      const n = Number(trimmed);
      return Number.isFinite(n) ? Math.round(n * 100) : 0;
    }
    case 'hours':
    case 'days':
    case 'minutes': {
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : 0;
    }
    case 'string':
    default:
      return trimmed;
  }
}

// ── business_hours (structured, not a flat schema) ─────────────────────────

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export interface BusinessHoursWindow {
  start: string; // "09:00"
  end: string; // "17:00"
}
export type BusinessHoursWeek = Partial<Record<WeekdayKey, BusinessHoursWindow>>;

export interface BusinessHoursFormState {
  timezone: string;
  week: BusinessHoursWeek;
  /** yyyy-mm-dd strings. */
  holidays: string[];
}

const DEFAULT_BUSINESS_HOURS: BusinessHoursFormState = {
  timezone: 'America/Chicago',
  week: {},
  holidays: [],
};

/** fulfillment_config.value for key='business_hours' -> form state.
 *  Tolerant of a missing/malformed row (returns sane defaults) since the
 *  config UI must never crash on an unexpected shape. */
export function parseBusinessHours(value: Record<string, unknown> | null | undefined): BusinessHoursFormState {
  if (!value) return { ...DEFAULT_BUSINESS_HOURS, week: {}, holidays: [] };
  const week: BusinessHoursWeek = {};
  const rawWeek = (value.week ?? {}) as Record<string, unknown>;
  for (const day of WEEKDAY_KEYS) {
    const w = rawWeek[day];
    if (Array.isArray(w) && w.length === 2 && typeof w[0] === 'string' && typeof w[1] === 'string') {
      week[day] = { start: w[0], end: w[1] };
    }
  }
  const holidays = Array.isArray(value.holidays)
    ? value.holidays.filter((h): h is string => typeof h === 'string')
    : [];
  return {
    timezone: typeof value.timezone === 'string' ? value.timezone : DEFAULT_BUSINESS_HOURS.timezone,
    week,
    holidays,
  };
}

/** Form state -> the exact jsonb shape fulfillment_business_hours_between()
 *  (00351) reads: `{timezone, week: {mon: [start, end], …}, holidays: […]}`. */
export function serializeBusinessHours(form: BusinessHoursFormState): Record<string, unknown> {
  const week: Record<string, [string, string]> = {};
  for (const day of WEEKDAY_KEYS) {
    const w = form.week[day];
    if (w) week[day] = [w.start, w.end];
  }
  return { timezone: form.timezone, week, holidays: [...form.holidays] };
}

export { WEEKDAY_KEYS };
