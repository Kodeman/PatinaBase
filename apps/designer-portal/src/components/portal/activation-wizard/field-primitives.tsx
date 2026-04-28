'use client';

import { type ReactNode } from 'react';

export function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <label
        className="mb-1 block"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-[0.7rem] text-[var(--text-muted)]">{hint}</p>
      )}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-[3px] border border-[var(--border-default)] bg-white px-3 py-2 font-body text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
    />
  );
}

export function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value || ''}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      placeholder={placeholder}
      className="w-full rounded-[3px] border border-[var(--border-default)] bg-white px-3 py-2 font-body text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
    />
  );
}

export function CurrencyInput({
  cents,
  onChange,
  placeholder,
}: {
  cents: number;
  onChange: (cents: number) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[0.85rem]"
        style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
      >
        $
      </span>
      <input
        type="number"
        value={cents > 0 ? cents / 100 : ''}
        onChange={(e) => onChange(Math.round((Number(e.target.value) || 0) * 100))}
        placeholder={placeholder}
        className="w-full rounded-[3px] border border-[var(--border-default)] bg-white px-3 py-2 pl-6 font-body text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
      />
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[3px] border border-[var(--border-default)] bg-white px-3 py-2 font-body text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextArea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full rounded-[3px] border border-[var(--border-default)] bg-white px-3 py-2 font-body text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
    />
  );
}
