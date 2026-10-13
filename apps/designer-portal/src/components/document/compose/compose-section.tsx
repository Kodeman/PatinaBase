'use client';

import { useEffect, useId, useState } from 'react';

/**
 * One fillable section of the Composing Page (R40). A section is a grouping that
 * fills in ANY order, shows its own completion, and opens/closes in place — no
 * gate, no required order.
 *
 * US-28 S9: a facet is a Card on the shared edge (`--card-edge`, 2 px radius),
 * its state one ink word in the eyebrow ("Written" / "To write"); the open
 * facet keeps the clay ring. Zero shadows.
 */

export function ComposeSection({
  name,
  status,
  done,
  open,
  onToggle,
  doneWord = 'Written',
  todoWord = 'To write',
  children,
}: {
  name: string;
  /** The quiet summary line ("identity set", "not yet written", "untaught"…). */
  status: string;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  /** The one ink state word (the Drafting Room says "Drafted" / "To draft"). */
  doneWord?: string;
  todoWord?: string;
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
    <article className={`card facet${open ? ' is-open' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="facet-toggle"
      >
        <span className="eb">
          {done ? doneWord : todoWord}
          {open ? ' · open' : ''}
        </span>
        <span className="name-h t-d3">
          <span className="name">{name}</span>
        </span>
        <span className="line t-body">{status}</span>
      </button>
      {bodyMounted && (
        <div
          id={contentId}
          data-compose-section-body
          hidden={!open}
          inert={!open}
          aria-hidden={!open}
          className={`facet-body ${
            open ? 'motion-safe:animate-[doc-fade_200ms_ease-out]' : ''
          }`}
        >
          {children}
        </div>
      )}
    </article>
  );
}

/**
 * The house Section eyebrow (S1 `.eb` + `.orn`), shared by the making-papers
 * surfaces (compose, drafting, ceremony). Ink words; the ornament is the one
 * clay mark.
 */
export function PaperEyebrow({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <p className="eb" id={id}>
      <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
        <path d="M0 2h34M0 6h28M0 10h20" />
      </svg>
      <span>{children}</span>
    </p>
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
    <label className="mt-3 block min-w-0">
      <span className="doc-type-meta mb-1.5 block font-semibold uppercase tracking-[0.08em]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="doc-type-control min-h-11 w-full min-w-0 rounded-[6px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-3 py-2 focus:border-[var(--color-clay)] focus:bg-white focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
      />
    </label>
  );
}
