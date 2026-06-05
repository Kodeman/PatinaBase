import type { ReactNode } from 'react';
import { StatusBadge, type StatusTone } from '@/components/ui/controls';
import { cn } from '@/lib/utils';

/**
 * Tone vocabulary for the leading status chip. Aliases the control-kit
 * `StatusTone` so the public prop name reads as `BadgeTone` at call sites
 * (the design language calls these "badge tones"); the underlying value set
 * is identical.
 */
export type BadgeTone = StatusTone;

export interface PageActionBarProps {
  /** Leading status chip; renders the kit `StatusBadge`. */
  status?: { tone: BadgeTone; label: string; dot?: boolean };
  /**
   * Free-form meta cluster (version, client link, phase dots, save-state).
   * Pages own this content. The left container is `relative`-friendly so
   * popover anchors (e.g. a ClientPicker) can be nested inside.
   */
  meta?: ReactNode;
  /** Action group — typically kit `Button`s. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Slim, single-line action bar that sits directly beneath the global
 * breadcrumb (SubNav) on detail pages. The breadcrumb already carries the
 * entity title, so there is intentionally no h1 here — only status/meta on
 * the left and actions on the right.
 *
 * Renders `null` when every slot is empty so a page can hand it whatever it
 * has without guarding the markup itself.
 */
export function PageActionBar({
  status,
  meta,
  actions,
  className,
}: PageActionBarProps) {
  if (!status && !meta && !actions) return null;

  return (
    <div
      className={cn(
        'mb-6 flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-3',
        className,
      )}
    >
      <div className="relative flex min-w-0 flex-wrap items-center gap-2">
        {status && (
          <StatusBadge tone={status.tone} dot={status.dot}>
            {status.label}
          </StatusBadge>
        )}
        {meta}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
