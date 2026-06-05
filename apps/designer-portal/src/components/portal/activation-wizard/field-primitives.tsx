'use client';

import { type ReactNode } from 'react';
import { FieldHelper } from '@patina/help-system';
import {
  Input as KitInput,
  Select as KitSelect,
  Textarea as KitTextarea,
} from '@/components/ui/controls';

/**
 * FieldRow — Activation Wizard field wrapper.
 *
 * F1.3 (Sprint 2): when a `helperSurfaceKey` is supplied, the inline `hint`
 * string becomes the CMS fallback rendered while Sanity content is being
 * authored (spec §13.4 graceful absence). Once the CMS document publishes,
 * `<FieldHelper>` swaps in the canonical copy.
 *
 * The label slot accepts a `trailing` node so the migrated steps can drop in
 * `<InfoIcon>` (general questions) or `<StrataInfoIcon>` (Patina-specific
 * concepts — Aesthete, FF&E, visibility tiers) right next to the label
 * without having to re-declare the small-caps label styling per step.
 *
 * The `htmlFor` prop wires the visible <label> to the field's accessible
 * name. Each migrated step passes a stable id matching its input's `id`
 * attribute so screen readers + click-the-label-to-focus work correctly.
 *
 * NOTE: we keep the inline `hint` prop for callers that want a static
 * helper string (e.g. computed values like "Auto-calculated: 32 weeks
 * total"). If both `helperSurfaceKey` and a static `hint` are passed,
 * `helperSurfaceKey` wins and the `hint` becomes the fallback.
 */
export function FieldRow({
  label,
  hint,
  children,
  helperSurfaceKey,
  trailing,
  htmlFor,
  required,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  helperSurfaceKey?: string;
  trailing?: ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <div className="mb-4">
      <label
        htmlFor={htmlFor}
        className="mb-1 inline-flex items-center gap-1.5"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        <span>{label}</span>
        {required ? (
          <span
            aria-hidden="true"
            data-testid="field-row-required-marker"
            style={{ color: 'var(--color-terracotta, #D4A090)' }}
          >
            *
          </span>
        ) : null}
        {trailing}
      </label>
      {children}
      {helperSurfaceKey ? (
        <FieldHelper
          surfaceKey={helperSurfaceKey}
          fallback={hint}
          className="mt-1 text-[0.7rem]"
        />
      ) : hint ? (
        <p className="mt-1 text-[0.7rem] text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  ariaLabel?: string;
}) {
  return (
    <KitInput
      id={id}
      aria-label={ariaLabel}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

export function NumberInput({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  id?: string;
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <KitInput
      id={id}
      aria-label={ariaLabel}
      type="number"
      value={value || ''}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      placeholder={placeholder}
    />
  );
}

export function CurrencyInput({
  id,
  cents,
  onChange,
  placeholder,
  ariaLabel,
}: {
  id?: string;
  cents: number;
  onChange: (cents: number) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <span
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[0.85rem]"
        style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
      >
        $
      </span>
      <KitInput
        id={id}
        aria-label={ariaLabel}
        type="number"
        value={cents > 0 ? cents / 100 : ''}
        onChange={(e) => onChange(Math.round((Number(e.target.value) || 0) * 100))}
        placeholder={placeholder}
        className="pl-6"
      />
    </div>
  );
}

export function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <KitSelect
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </KitSelect>
  );
}

export function TextArea({
  id,
  value,
  onChange,
  rows = 3,
  placeholder,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <KitTextarea
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
    />
  );
}
