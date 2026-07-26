'use client';

/**
 * Discovery field-kit — the typed inputs the structured essentials capture
 * with (R66: "structured data, NOT freeform prose"). Paper tokens, ink
 * hairline borders, zero shadows (D4). Shared by every block editor so the
 * blocks read as one structured surface, not eight bespoke forms.
 */

import React from 'react';
import { DocumentAction } from '../document-action';

const inputCls =
  'w-full rounded-[4px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[12.5px] text-[var(--color-charcoal)] outline-none transition-colors focus:border-[var(--color-clay)]';

const labelCls =
  'mb-1 block font-mono text-[8.5px] uppercase tracking-[0.07em] text-[var(--text-muted)]';

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      className={inputCls}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  prefix,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  prefix?: string;
}) {
  return (
    <span className="flex items-center gap-1">
      {prefix && (
        <span className="font-mono text-[11px] text-[var(--text-muted)]">
          {prefix}
        </span>
      )}
      <input
        type="number"
        className={inputCls}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(e.target.value === '' ? null : Number(e.target.value))
        }
      />
    </span>
  );
}

export function DateInput({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <input
      type="date"
      className={inputCls}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

export interface Option {
  value: string;
  label: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: Option[];
  placeholder?: string;
}) {
  return (
    <select
      className={inputCls}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{placeholder ?? '—'}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A small ✕ remove control reused across the row editors. */
export function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Remove"
      onClick={onClick}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[3px] border border-[var(--color-pearl)] font-mono text-[11px] leading-none text-[var(--text-muted)] transition-colors hover:border-[var(--color-clay)] hover:text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
    >
      ✕
    </button>
  );
}

export function AddRowButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <DocumentAction
      actionKey="add-discovery-row"
      surfaceKey="discovery"
      regionKey="structured-editor"
      variant="secondary"
      onClick={onClick}
      className="mt-1.5"
    >
      {label}
    </DocumentAction>
  );
}

/** Multi-select chips backed by a fixed vocabulary (the style tags). */
export function ChipMultiSelect({
  options,
  selected,
  onToggle,
}: {
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`min-h-11 rounded-[3px] border px-2.5 py-1 text-[11.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
              on
                ? 'border-[var(--color-clay)] bg-[rgba(196,165,123,0.12)] text-[var(--color-mocha)]'
                : 'border-[var(--color-pearl)] bg-[var(--doc-paper)] text-[var(--color-charcoal)] hover:border-[var(--color-clay)]'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Free-text chips (style keywords) — type + Enter to add, ✕ to remove. */
export function KeywordChips({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = React.useState('');
  const add = () => {
    const t = draft.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft('');
  };
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--color-clay)] bg-[rgba(196,165,123,0.12)] px-2 py-0.5 text-[11.5px] text-[var(--color-mocha)]"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[3px] leading-none text-[var(--color-aged-oak)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        className={inputCls}
        value={draft}
        placeholder={placeholder ?? 'Type a word, press Enter'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

export interface RowColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox';
  options?: Option[];
  placeholder?: string;
  /** flex-basis hint, e.g. 'min-w-[120px] flex-1'. */
  className?: string;
}

type RowValue = Record<string, string | number | boolean | null>;

/** A generic add/remove row list — the shape behind rooms, lifestyle,
 *  keep/avoid, and decision-makers. Each row is a record keyed by column. */
export function RowListEditor({
  rows,
  columns,
  onChange,
  addLabel,
}: {
  rows: RowValue[];
  columns: RowColumn[];
  onChange: (rows: RowValue[]) => void;
  addLabel: string;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const focusRow = React.useRef<number | null>(null);

  const setCell = (
    i: number,
    key: string,
    val: string | number | boolean | null,
  ) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r));
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => {
    focusRow.current = rows.length; // the index the new row will render at
    onChange([...rows, {}]);
  };

  // F5 (walk 2026-07): after "+ Add a row" the focus stayed on the button, so
  // typing went nowhere — land it in the new row's first TEXT input (the name /
  // who field), falling back to whatever control the row leads with.
  React.useEffect(() => {
    if (focusRow.current == null) return;
    const row =
      listRef.current?.querySelectorAll<HTMLElement>('[data-row]')[
        focusRow.current
      ];
    focusRow.current = null;
    const target =
      row?.querySelector<HTMLElement>('input[type="text"]') ??
      row?.querySelector<HTMLElement>('input, select, textarea');
    target?.focus();
  }, [rows.length]);

  return (
    <div ref={listRef}>
      {rows.map((row, i) => (
        <div
          key={i}
          data-row
          className="mb-1.5 flex flex-wrap items-center gap-1.5"
        >
          {columns.map((c) => {
            const v = row[c.key];
            if (c.type === 'checkbox') {
              return (
                <label
                  key={c.key}
                  className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--text-muted)]"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(v)}
                    onChange={(e) => setCell(i, c.key, e.target.checked)}
                  />
                  {c.label}
                </label>
              );
            }
            if (c.type === 'select') {
              return (
                <span
                  key={c.key}
                  className={c.className ?? 'min-w-[110px] flex-1'}
                >
                  <Select
                    value={(v as string) ?? null}
                    onChange={(val) => setCell(i, c.key, val)}
                    options={c.options ?? []}
                    placeholder={c.placeholder}
                  />
                </span>
              );
            }
            if (c.type === 'number') {
              return (
                <span key={c.key} className={c.className ?? 'w-[88px]'}>
                  <NumberInput
                    value={(v as number) ?? null}
                    onChange={(val) => setCell(i, c.key, val)}
                    placeholder={c.placeholder}
                  />
                </span>
              );
            }
            return (
              <span
                key={c.key}
                className={c.className ?? 'min-w-[120px] flex-1'}
              >
                <TextInput
                  value={(v as string) ?? ''}
                  onChange={(val) => setCell(i, c.key, val)}
                  placeholder={c.placeholder ?? c.label}
                />
              </span>
            );
          })}
          <RemoveButton onClick={() => remove(i)} />
        </div>
      ))}
      <AddRowButton label={addLabel} onClick={add} />
    </div>
  );
}
