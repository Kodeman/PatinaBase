'use client';

import { use, type ReactNode } from 'react';
import { useDocumentEngagement } from '@/hooks/use-document-state';
import { useHoldDocument } from '@/hooks/document-time-provider';

/**
 * The document's time hold (D11, ratified R19; moved here by US-21 D14).
 * Picking up the document starts the timer (chaining out any running one);
 * putting it down releases it through the log strip. Projects only: time
 * attaches to project rows (00177 FK).
 *
 * It lives on the layout, not the page, so walking into the spec book, boards,
 * plans or pieces under this document keeps the same hold, with no release and
 * no fresh timer. A different [id] releases and re-holds once. Rooms and the
 * Library sit outside /doc/[id], so entering one still puts the document down.
 *
 * Same hook and cache key as the page, so no second fetch. No wrapper element:
 * the arrival (`data-arrival-held`) DOM is the page's own.
 */
export default function DocumentHoldLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: resolution } = useDocumentEngagement(id);
  const row = resolution?.kind === 'engagement' ? resolution.row : null;
  useHoldDocument(
    row?.project_id
      ? {
          projectId: row.project_id,
          projectName: row.title,
          phaseKey: row.current_phase ?? null,
        }
      : null,
  );
  return children;
}
