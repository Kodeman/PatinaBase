'use client';

import { useId, useState } from 'react';
import { documentEvents } from '@/lib/analytics/document-events';

export function PreviousWork({
  count,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  count: number;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const contentId = `previous-work-${useId().replace(/:/g, '')}`;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setLocalOpen(next);
    onOpenChange?.(next);
    documentEvents.historyToggled({ expanded: next, completed_count: count });
  };
  if (count === 0) return null;

  return (
    <section className="mb-5 mt-4" aria-label="Previous work">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between border-y border-[var(--color-pearl)] py-2 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
      >
        <span>Previous work · {count} complete</span>
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>
      <div id={contentId} hidden={!open} className="pt-2">{open ? children : null}</div>
    </section>
  );
}
