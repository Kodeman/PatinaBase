'use client';

import { useEffect, useState } from 'react';
import type { FulfillmentConfigRow } from '@patina/fulfillment';
import {
  CONFIG_FIELD_SCHEMAS,
  formatFieldForForm,
  getFieldValue,
  hasTypedSchema,
  parseBusinessHours,
  parseFieldFromForm,
  serializeBusinessHours,
  setFieldValue,
  WEEKDAY_KEYS,
  type BusinessHoursFormState,
  type WeekdayKey,
} from '@patina/fulfillment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

// One fulfillment_config row's editor (S4, spec §10). Typed rate/pct/hours
// fields for the six flat-scalar keys (CONFIG_FIELD_SCHEMAS); business_hours
// gets a structured week + holidays editor. All the value <-> form-string
// mapping is pure and tested in @patina/fulfillment/config-form.ts — this
// component is field layout + save wiring only.

export interface ConfigKeyEditorProps {
  row: FulfillmentConfigRow;
  onSave: (value: Record<string, unknown>) => void;
  saving: boolean;
}

const WEEKDAY_LABEL: Record<WeekdayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

function TypedFieldsEditor({ row, onSave, saving }: ConfigKeyEditorProps) {
  const schema = CONFIG_FIELD_SCHEMAS[row.key];
  const [value, setValue] = useState<Record<string, unknown>>(row.value);

  useEffect(() => setValue(row.value), [row.value]);

  return (
    <div data-testid={`config-editor-${row.key}`} className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {schema.map((field) => (
        <div key={field.path.join('.')}>
          <label className="block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-meta)' }}>
            {field.label}
            {field.type === 'pct' ? ' (%)' : field.type === 'cents' ? ' ($)' : ''}
          </label>
          <Input
            data-testid={`config-field-${row.key}-${field.path.join('-')}`}
            type="number"
            className="mt-1"
            value={formatFieldForForm(field.type, getFieldValue(value, field.path))}
            onChange={(e) =>
              setValue((prev) => setFieldValue(prev, field.path, parseFieldFromForm(field.type, e.target.value)))
            }
          />
        </div>
      ))}
      <div className="col-span-full mt-1">
        <Button type="button" data-testid={`config-save-${row.key}`} disabled={saving} onClick={() => onSave(value)}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function BusinessHoursEditor({ row, onSave, saving }: ConfigKeyEditorProps) {
  const [form, setForm] = useState<BusinessHoursFormState>(() => parseBusinessHours(row.value));
  const [holidaysText, setHolidaysText] = useState(() => parseBusinessHours(row.value).holidays.join(', '));

  useEffect(() => {
    const parsed = parseBusinessHours(row.value);
    setForm(parsed);
    setHolidaysText(parsed.holidays.join(', '));
  }, [row.value]);

  const setDay = (day: WeekdayKey, enabled: boolean, start = '09:00', end = '17:00') => {
    setForm((prev) => {
      const week = { ...prev.week };
      if (enabled) week[day] = week[day] ?? { start, end };
      else delete week[day];
      return { ...prev, week };
    });
  };
  const setDayTime = (day: WeekdayKey, field: 'start' | 'end', v: string) => {
    setForm((prev) => ({
      ...prev,
      week: { ...prev.week, [day]: { ...(prev.week[day] ?? { start: '09:00', end: '17:00' }), [field]: v } },
    }));
  };

  const save = () => {
    const holidays = holidaysText
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    onSave(serializeBusinessHours({ ...form, holidays }));
  };

  return (
    <div data-testid="config-editor-business_hours">
      <label className="block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-meta)' }}>
        Timezone
      </label>
      <Input
        data-testid="config-business-hours-timezone"
        className="mt-1 max-w-xs"
        value={form.timezone}
        onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
      />

      <div className="mt-4 space-y-2">
        {WEEKDAY_KEYS.map((day) => {
          const window = form.week[day];
          return (
            <div key={day} className="flex items-center gap-3">
              <Switch
                data-testid={`config-business-hours-${day}-enabled`}
                checked={!!window}
                onCheckedChange={(checked) => setDay(day, checked)}
              />
              <span className="w-10 text-[0.75rem]">{WEEKDAY_LABEL[day]}</span>
              <Input
                data-testid={`config-business-hours-${day}-start`}
                type="time"
                className="w-28"
                disabled={!window}
                value={window?.start ?? ''}
                onChange={(e) => setDayTime(day, 'start', e.target.value)}
              />
              <span className="text-[var(--text-muted)]">–</span>
              <Input
                data-testid={`config-business-hours-${day}-end`}
                type="time"
                className="w-28"
                disabled={!window}
                value={window?.end ?? ''}
                onChange={(e) => setDayTime(day, 'end', e.target.value)}
              />
            </div>
          );
        })}
      </div>

      <label className="mt-4 block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-meta)' }}>
        Holidays (comma-separated yyyy-mm-dd)
      </label>
      <Input
        data-testid="config-business-hours-holidays"
        className="mt-1"
        value={holidaysText}
        onChange={(e) => setHolidaysText(e.target.value)}
        placeholder="2026-12-25, 2027-01-01"
      />

      <div className="mt-4">
        <Button type="button" data-testid="config-save-business_hours" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export function ConfigKeyEditor(props: ConfigKeyEditorProps) {
  const { row } = props;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="type-item-name">{row.key.replace(/_/g, ' ')}</h3>
        <p className="type-meta-small text-[var(--text-subtle)]" data-testid={`config-updated-${row.key}`}>
          {row.updatedBy ? `updated by ${row.updatedBy} · ` : ''}
          {new Date(row.updatedAt).toLocaleString()}
        </p>
      </div>
      {row.description && <p className="type-body-small mt-1 text-[var(--text-muted)]">{row.description}</p>}
      <div className="mt-3">
        {hasTypedSchema(row.key) ? <TypedFieldsEditor {...props} /> : <BusinessHoursEditor {...props} />}
      </div>
    </div>
  );
}
