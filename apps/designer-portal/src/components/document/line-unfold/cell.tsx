import type { ReactNode } from 'react';

/** The unfold's quiet label: mono, small, muted. */
export const LABEL_CLS =
  'font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]';
export const FIELD_CLS =
  'bg-transparent text-[11px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60';

/**
 * C-14 (D1-03): one of the unfold's six cells. A serif head over the cell's
 * facts on warm paper, with no shadow. `min-w-0` lets a cell shrink inside the
 * grid so nothing scrolls sideways at 390.
 */
export function UnfoldCell({
  head,
  testId,
  children,
}: {
  head: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={head}
      data-testid={testId}
      className="min-w-0 bg-[var(--doc-paper)] p-3"
    >
      <p className="mb-1 font-heading text-[13px] leading-snug text-[var(--color-charcoal)]">
        {head}
      </p>
      {children}
    </div>
  );
}

export function CellValue({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11.5px] font-medium text-[var(--color-charcoal)]">
      {children}
    </p>
  );
}

export function CellSub({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-[var(--text-muted)]">{children}</p>;
}
