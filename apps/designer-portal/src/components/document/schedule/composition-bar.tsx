'use client';

/**
 * The composition bar (Authorized Schedule deck, slide 10).
 *
 * While you are selecting, the bar under the schedule counts what you have.
 * It never floats and it never leaves before it is read: a portal to the body
 * so no ancestor's overflow can clip it, one 1px top rule and paper contrast
 * for depth — never a shadow (D4).
 *
 * The bar is arithmetic, not a promise. It counts what is ticked. The deposit
 * percent is editable on the review sheet, not here — and until the agreement's
 * term resolves, the bar says nothing about a deposit at all.
 *
 * Stacking: z-45 sits above the Studio Drawer (z-40) and below the DocSheet
 * layer (z-50), so the review sheet covers it when it opens. On the wide
 * layout it rides above the drawer's 60px rail.
 */

import { createPortal } from 'react-dom';
import {
  depositCents,
  furnishingsDepositPercent,
  releaseSummary,
  type ReleaseLine,
} from '@/lib/document/authorization-derivation';
import { fmtUsd } from '@/lib/document/format';
import { useProjectBillingAuthority } from '@/hooks/use-commercial-documents';
import { DocumentAction, DocumentActionRow } from '../document-action';

export function CompositionBar({
  projectId,
  lines,
  onReview,
  onPutBack,
}: {
  projectId: string;
  lines: readonly ReleaseLine[];
  onReview: () => void;
  onPutBack: () => void;
}) {
  const authority = useProjectBillingAuthority(projectId);
  const { lineCount, roomCount, totalCents } = releaseSummary(lines);
  const percent = furnishingsDepositPercent(authority.data);

  if (typeof document === 'undefined') return null;

  const counts = [
    `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`,
    `${roomCount} ${roomCount === 1 ? 'room' : 'rooms'}`,
    fmtUsd(totalCents),
  ];

  return createPortal(
    <section
      role="region"
      aria-label="Release composition"
      data-testid="composition-bar"
      className="fixed inset-x-0 bottom-0 z-[45] border-t border-[var(--color-clay)] bg-[var(--doc-paper,#FCFAF6)] px-4 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 min-[1180px]:bottom-[60px] min-[1180px]:py-2"
    >
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <p className="min-w-0 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
          {counts.join(' · ')}
          {percent !== null && (
            <span className="text-[var(--text-muted)]">
              {' · '}deposit {fmtUsd(depositCents(totalCents, percent))} at{' '}
              {percent}%
            </span>
          )}
        </p>
        <DocumentActionRow
          surfaceKey="project"
          regionKey="release-composition"
          aria-label="Release acts"
        >
          <DocumentAction
            actionKey="put-back-release-selection"
            variant="tertiary"
            onClick={onPutBack}
          >
            Put back
          </DocumentAction>
          <DocumentAction
            actionKey="review-release"
            variant="primary"
            disabled={lineCount === 0}
            onClick={onReview}
          >
            Review &amp; release
          </DocumentAction>
        </DocumentActionRow>
      </div>
    </section>,
    document.body,
  );
}
