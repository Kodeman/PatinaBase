'use client';

/**
 * The Desk (spec v1.1 §7) — Slice 1 shell. Date + find-anything affordance
 * are the only chrome; the needs-your-hand stack and in-motion chips land in
 * later tasks of this slice.
 */
export default function DeskPage() {
  const today = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-28 pt-14">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-heading text-[1.65rem] italic text-[var(--color-pearl)]">{today}</h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--doc-desk-ink)]">
          Find anything <kbd className="rounded-[3px] border border-[var(--doc-desk-ink)] px-1 py-px font-mono">⌘K</kbd>
        </p>
      </header>
    </main>
  );
}
