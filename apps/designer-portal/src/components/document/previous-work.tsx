'use client';

import { useId, useState, type CSSProperties } from 'react';
import { documentEvents } from '@/lib/analytics/document-events';
import { RegionHead } from './region/region-head';
import type { RegionDensity } from './region/use-region-fold';
import { useLensDensityStore } from '@/hooks/use-lens-density';
import {
  quietStateSentence,
  recordQuietStatus,
} from '@/lib/document/lens-quiet-status';

/**
 * W2 (C-2, `document-index.ts`) — the running index's stable id for this
 * region root. Not fixed in `document-index.ts` on this branch yet
 * (`DocumentIndexKey` does not carry `'care' | 'record'` here — W2-L2 adds
 * those keys), so this is the literal fallback named by the build plan.
 */
const RECORD_HEADING_ID = 'previous-work-heading';

/**
 * OD-12 — the quiet height, held at EVERY density so a body shorter than its
 * reserve cannot shrink the region on mount. W3-L3 declares both floors as
 * tokens; `-exc` is for a head that prints standing exceptions, and the
 * record's head prints none, so this root takes the minimum.
 */
const QUIET_RESERVE = 'var(--doc-quiet-reserve-min)';

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

  // W4 (C-8) — the lens's reading of this root, taken from the store and never
  // from the DOM. `record` is not a `RegionFoldKey` (the record is a
  // disclosure, not a fold — there is no `useRegionFold` here to carry the
  // fourth voice), so the same expression C-8 states for a stop with no
  // explicit choice is written directly: the lens speaks `full` or is silent,
  // and silence means quiet.
  const density: RegionDensity = useLensDensityStore('record') ?? 'quiet';

  // W2 (C-2) — the `record` root is now ALWAYS emitted, empty body when
  // `count === 0` (this used to return null, which left the running index
  // with no `record` root to observe on a project with nothing settled).
  // A zero-count project isn't a press target: no ledger entry, no toggle.
  const hasHistory = count > 0;

  // A zero-record paper has no count to print and no body to promote, so it
  // prints exactly its `Nothing yet` head at either density — and therefore
  // states `full`, not `quiet` (W4-C16): a root whose printed form cannot
  // change with the lens must not claim a density it does not hold.
  const quiet = density === 'quiet' && hasHistory;
  const printedDensity: RegionDensity = hasHistory ? density : 'full';

  return (
    <section
      data-index-region="record"
      data-density={printedDensity}
      style={{ '--doc-quiet-reserve': QUIET_RESERVE } as CSSProperties}
      className="mt-[var(--doc-region-gap)]"
      aria-label="The record"
    >
      <RegionHead
        headingId={RECORD_HEADING_ID}
        // F90 — canon names it The Record (I137); the screen now says so.
        name="The record"
        // W4-R1 — the head's own status line IS the count line at either
        // density: `N complete`, and `Nothing yet` for the empty read.
        status={recordQuietStatus({ complete: count })}
        surfaceKey="project"
        regionKey="record"
        // Only when a body actually renders. `RegionHead`'s dev guard ("a head
        // with no acts is a caption, not a head") is suppressed by a truthy
        // `bodyId`, so naming an id that is not on the page both defeats the
        // guard and points `aria-controls` at nothing.
        bodyId={hasHistory ? contentId : undefined}
        // A zero-count record has no ledger entry and no foldable body by
        // construction — a ratified state (W2, "the record root is now
        // ALWAYS emitted"), not a head someone forgot to finish.
        allowNoActs={!hasHistory}
        actsAtQuiet={quiet ? 'leader' : 'all'}
        actions={
          hasHistory
            ? [
                {
                  key: 'toggle-record',
                  // W4-N-06 — at quiet the wrapper holds the sr-only line and
                  // nothing else, so an `open` carried in from before the lens
                  // withdrew would make this control announce a disclosure
                  // that shows nothing. The disclosure is only expanded when
                  // the body it names is actually printing.
                  label: open && !quiet ? 'Fold ↑' : 'Open the record',
                  onClick: () => setOpen(!open),
                  'aria-expanded': open && !quiet,
                  'aria-controls': contentId,
                },
              ]
            : []
        }
      />
      {quiet ? (
        // W4-C7: the id rides the quiet wrapper too. Both the head's Fold
        // button (`bodyId`) and the `toggle-record` act name `contentId`, and
        // the record is the last stop on the paper — so the dangling reference
        // was the state on every load until the reader reached the foot.
        <div id={contentId}>
          <p className="sr-only">
            {quietStateSentence(
              recordQuietStatus({ complete: count }),
              'The record',
            )}
          </p>
        </div>
      ) : (
        <>
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
        </>
      )}
    </section>
  );
}
