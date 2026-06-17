'use client';

/**
 * Shared Outreach primitives (Track D) — the prototype's `.subnav`, `.statgrid`,
 * `.camp-row`, and `.camp-badge`. One source of truth so all three sub-tabs read
 * identically. Typography-first, zero shadows (D4); colors from brand tokens.
 */

import type { ReactNode } from 'react';

/** The `.subnav` underline tabs (D1: sub-tabs underline, not nav chrome). */
export function SubNav<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: ReadonlyArray<readonly [T, string]>;
  active: T;
  onSelect: (key: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Outreach sections"
      className="mb-4 flex gap-5 border-b border-[var(--doc-ink-border)] pb-2"
    >
      {tabs.map(([key, label]) => {
        const on = key === active;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(key)}
            className={`relative pb-1.5 font-mono text-[0.54rem] font-semibold uppercase tracking-[0.06em] transition-colors ${
              on ? 'text-[var(--color-charcoal)]' : 'text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]'
            }`}
          >
            {label}
            {on && (
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-[9px] h-[2px] bg-[var(--color-clay)]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The `.statgrid` — three quiet figures over the campaigns list. */
export function StatGrid({ stats }: { stats: ReadonlyArray<{ n: ReactNode; label: string }> }) {
  return (
    <div className="mb-5 grid grid-cols-3 gap-3">
      {stats.map((s, i) => (
        <div
          key={i}
          className="rounded-[9px] border border-[var(--color-pearl)] bg-white px-4 py-3"
        >
          <div className="font-mono text-[1.4rem] font-medium leading-none text-[var(--color-charcoal)]">
            {s.n}
          </div>
          <div className="mt-1 font-mono text-[0.46rem] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The `.camp-row` — name + sub-line on the left, an action/badge on the right. */
export function CampRow({
  name,
  stat,
  right,
}: {
  name: ReactNode;
  stat: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-3.5 rounded-[9px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.82rem] font-semibold text-[var(--color-charcoal)]">{name}</div>
        <div className="mt-0.5 text-[0.66rem] text-[var(--color-aged-oak)]">{stat}</div>
      </div>
      {right}
    </div>
  );
}

const BADGE_TONE: Record<string, { color: string; border: string }> = {
  sent: { color: 'var(--color-sage)', border: 'var(--color-sage)' },
  draft: { color: 'var(--color-aged-oak)', border: '#cbb48f' },
  scheduled: { color: 'var(--color-dusty-blue)', border: 'var(--color-dusty-blue)' },
  sending: { color: 'var(--color-clay)', border: 'var(--color-clay)' },
  cancelled: { color: 'var(--color-aged-oak)', border: 'var(--color-pearl)' },
  archived: { color: 'var(--color-aged-oak)', border: 'var(--color-pearl)' },
};

/** The `.camp-badge` — a campaign's lifecycle stamp (sent/draft/scheduled…). */
export function CampBadge({ status }: { status: string }) {
  const tone = BADGE_TONE[status] ?? BADGE_TONE.draft!;
  return (
    <span
      className="shrink-0 rounded-[3px] border px-[7px] py-[2px] font-mono text-[0.44rem] font-semibold uppercase tracking-[0.05em]"
      style={{ color: tone.color, borderColor: tone.border }}
    >
      {status}
    </span>
  );
}

/** A quiet small button (the `.btn.sm` in the prototype). Used for + New / Edit /
 *  View / Send. Zero shadows; clay-on-hover hairline. */
export function OutreachButton({
  children,
  onClick,
  disabled,
  tone = 'default',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'quiet';
  type?: 'button' | 'submit';
}) {
  const base =
    'inline-flex shrink-0 items-center gap-1.5 rounded-[5px] border px-2.5 py-1.5 font-mono text-[0.5rem] font-semibold uppercase tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-45';
  const tones: Record<string, string> = {
    default:
      'border-[var(--color-pearl)] bg-white text-[var(--color-charcoal)] hover:border-[var(--color-clay)]',
    primary:
      'border-[var(--color-clay)] bg-[var(--color-clay)] text-white hover:border-[var(--color-aged-oak)] hover:bg-[var(--color-aged-oak)]',
    quiet:
      'border-transparent bg-transparent text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${tones[tone]}`}>
      {children}
    </button>
  );
}

/** A quiet "+ New …" header row above a list. */
export function ListHeader({ label, action }: { label: string; action: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-mono text-[0.5rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
        {label}
      </h2>
      {action}
    </div>
  );
}

/** The quiet dashed empty/placeholder block (matches view-shell's idiom). */
export function QuietNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[var(--doc-ink-border)] bg-white/40 px-5 py-7 text-center">
      <p className="text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]">{children}</p>
    </div>
  );
}
