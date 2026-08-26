'use client';

import { useId, useState } from 'react';
import { documentEvents } from '@/lib/analytics/document-events';

export function PreviousWork({
  count,
  children,
  open: controlledOpen,
  onOpenChange,
  approvalsAwaitingPublish = null,
  onOpenApprovals,
}: {
  count: number;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** W4: client approvals drafted but not yet published — `null` while the
   *  read has not answered, so the line never grows a clause after first
   *  paint. A zero is not news either. */
  approvalsAwaitingPublish?: number | null;
  /** The approvals record is a door, not content of this disclosure: the
   *  clause only appears when there is somewhere for it to go. */
  onOpenApprovals?: () => void;
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
    <section className="mb-5 mt-4" aria-label="The record">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between border-y border-[var(--color-pearl)] py-2 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
      >
        {/* F90 — canon names it The Record (I137); the screen now says so. */}
        <span>The record · {count} complete</span>
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {approvalsAwaitingPublish !== null &&
        approvalsAwaitingPublish > 0 &&
        onOpenApprovals && (
          <button
            type="button"
            onClick={onOpenApprovals}
            className="mt-1 flex min-h-11 items-center font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay-ink)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            Client approvals · {approvalsAwaitingPublish} awaiting publish →
          </button>
        )}
      <div id={contentId} hidden={!open} className="pt-2">{open ? children : null}</div>
    </section>
  );
}
