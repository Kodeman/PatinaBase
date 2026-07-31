'use client';

import { useEffect, useId, useState } from 'react';

/**
 * One fillable section of the Composing Page (R40). A section is a grouping that
 * fills in ANY order, shows its own completion (a tick + a status word), and
 * opens/closes in place — no gate, no required order. Zero shadows (D4); depth
 * is the ink border + the done/open accent, never a drop.
 */

export function ComposeSection({
  name,
  status,
  done,
  open,
  onToggle,
  children,
}: {
  name: string;
  /** The quiet status word ("identity set", "not yet written", "untaught"…). */
  status: string;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const contentId = useId();
  const [hasOpened, setHasOpened] = useState(open);

  useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);

  // Mount an editor only when first visited; after that, keep its local draft
  // alive while the single-active facet moves elsewhere.
  const bodyMounted = open || hasOpened;

  return (
    <div
      className={`mb-2.5 overflow-hidden rounded-[8px] border bg-[var(--doc-paper)] transition-colors motion-reduce:transition-none ${
        open
          ? 'border-[var(--color-clay)]'
          : done
            ? 'border-[rgba(168,181,160,0.5)]'
            : 'border-[var(--color-pearl)]'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
      >
        <span
          aria-hidden
          className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] text-[0.6rem] font-bold transition-colors motion-reduce:transition-none ${
            done
              ? 'border-[var(--color-sage)] bg-[rgba(168,181,160,0.18)] text-[var(--color-sage)]'
              : 'border-[#cfc8bb] text-transparent'
          }`}
        >
          ✓
        </span>
        <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
          <span className="doc-type-body shrink-0 font-semibold leading-tight text-[var(--color-charcoal)]">
            {name}
          </span>
          <span
            title={status}
            className={`doc-type-meta truncate leading-tight sm:ml-auto ${
              done ? '' : 'italic opacity-70'
            }`}
          >
            {status}
          </span>
        </span>
        <span
          aria-hidden
          className={`doc-type-meta shrink-0 text-[var(--color-quiet-ink)] transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        >
          ▸
        </span>
      </button>
      {bodyMounted && (
        <div
          id={contentId}
          data-compose-section-body
          hidden={!open}
          inert={!open}
          aria-hidden={!open}
          className={`border-t border-[var(--doc-ink-border)] px-4 pb-4 pt-1 ${
            open ? 'motion-safe:animate-[doc-fade_200ms_ease-out]' : ''
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** A labelled text field (the composing grammar). */
export function ComposeField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="mt-3 block">
      <span className="doc-type-meta mb-1.5 block font-semibold uppercase tracking-[0.08em]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="doc-type-control min-h-11 w-full rounded-[6px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-3 py-2 focus:border-[var(--color-clay)] focus:bg-white focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
      />
    </label>
  );
}
