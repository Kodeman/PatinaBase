'use client';

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
  return (
    <div
      className={`mb-2.5 overflow-hidden rounded-[8px] border bg-white transition-colors ${
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
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span
          aria-hidden
          className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] text-[0.6rem] font-bold transition-colors ${
            done
              ? 'border-[var(--color-sage)] bg-[rgba(168,181,160,0.18)] text-[var(--color-sage)]'
              : 'border-[#cfc8bb] text-transparent'
          }`}
        >
          ✓
        </span>
        <span className="text-[0.86rem] font-semibold text-[var(--color-charcoal)]">{name}</span>
        <span
          className={`ml-auto font-mono text-[0.55rem] tracking-[0.04em] text-[var(--color-aged-oak)] ${
            done ? '' : 'italic opacity-70'
          }`}
        >
          {status}
        </span>
        <span
          aria-hidden
          className={`text-[0.7rem] text-[var(--color-aged-oak)] transition-transform ${open ? 'rotate-90' : ''}`}
        >
          ▸
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--doc-ink-border)] px-4 pb-4 pt-1 motion-safe:animate-[doc-fade_200ms_ease-out]">
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
      <span className="mb-1.5 block font-mono text-[0.5rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[6px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-3 py-2 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:bg-white focus:outline-none"
      />
    </label>
  );
}
