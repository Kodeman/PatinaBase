'use client';

import { useId, useState } from 'react';
import { documentEvents } from '@/lib/analytics/document-events';
import { RegionHead } from './region/region-head';

/**
 * W2 (C-2, `document-index.ts`) — the running index's stable id for this
 * region root. Not fixed in `document-index.ts` on this branch yet
 * (`DocumentIndexKey` does not carry `'care' | 'record'` here — W2-L2 adds
 * those keys), so this is the literal fallback named by the build plan.
 */
const RECORD_HEADING_ID = 'previous-work-heading';

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

  // W2 (C-2) — the `record` root is now ALWAYS emitted, empty body when
  // `count === 0` (this used to return null, which left the running index
  // with no `record` root to observe on a project with nothing settled).
  // A zero-count project isn't a press target: no ledger entry, no toggle.
  const hasHistory = count > 0;

  return (
    <section
      data-index-region="record"
      className="mb-5 mt-4"
      aria-label="The record"
    >
      <RegionHead
        headingId={RECORD_HEADING_ID}
        // F90 — canon names it The Record (I137); the screen now says so.
        name="The record"
        // Reconciliation §"Quiet regions": `N complete`, and `Nothing yet` for
        // the empty read — the ratified string, not a paraphrase of it.
        status={hasHistory ? `${count} complete` : 'Nothing yet'}
        surfaceKey="project"
        regionKey="record"
        // Only when a body actually renders. `RegionHead`'s dev guard ("a head
        // with no acts is a caption, not a head") is suppressed by a truthy
        // `bodyId`, so naming an id that is not on the page both defeats the
        // guard and points `aria-controls` at nothing.
        bodyId={hasHistory ? contentId : undefined}
        actions={
          hasHistory
            ? [
                {
                  key: 'toggle-record',
                  label: open ? 'Fold ↑' : 'Open the record',
                  onClick: () => setOpen(!open),
                  'aria-expanded': open,
                  'aria-controls': contentId,
                },
              ]
            : []
        }
      />
      {approvalsAwaitingPublish !== null &&
        approvalsAwaitingPublish > 0 &&
        onOpenApprovals && (
          <button
            type="button"
            onClick={onOpenApprovals}
            className="mt-1 flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-clay-ink)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            Client approvals · {approvalsAwaitingPublish} awaiting publish →
          </button>
        )}
      {hasHistory && (
        <div id={contentId} hidden={!open} className="pt-2">
          {open ? children : null}
        </div>
      )}
    </section>
  );
}
