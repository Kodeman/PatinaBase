'use client';

/**
 * One print, at full size. The bytes are fetched through a short-lived signed
 * URL on the private project-documents bucket — the same 3600s door the Folio
 * viewer uses.
 *
 * A superseded print wears its stamp in the VIEWER's chrome, never on the page
 * itself: the stored bytes are the drawing Nell plotted, and Patina does not
 * write on a drawing. The stamp is this surface's statement about the print,
 * and it disappears with the overlay.
 */

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@patina/supabase';
import { fmtDay } from '@/lib/document/format';
import { Stamp } from '../stamp';
import {
  FullScreenViewerShell,
  FullScreenViewerState,
} from '../overlays/full-screen-viewer-shell';

export interface PlanPrintViewerProps {
  sheetNumber: string;
  sheetTitle: string;
  revLetter: string;
  filedAt: string;
  projectDocumentId: string;
  isCurrent: boolean;
  /** The revision that superseded this one, when it isn't current. */
  supersededBy: string | null;
  onClose: () => void;
}

export function PlanPrintViewer({
  sheetNumber,
  sheetTitle,
  revLetter,
  filedAt,
  projectDocumentId,
  isCurrent,
  supersededBy,
  onClose,
}: PlanPrintViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let live = true;
    setUrl(null);
    setSettled(false);
    void (async () => {
      try {
        const supabase = createBrowserClient() as unknown as {
          from: (table: string) => {
            select: (columns: string) => {
              eq: (
                column: string,
                value: string,
              ) => {
                maybeSingle: () => Promise<{
                  data: { storage_path: string | null } | null;
                }>;
              };
            };
          };
          storage: {
            from: (bucket: string) => {
              createSignedUrl: (
                path: string,
                expiresIn: number,
              ) => Promise<{ data: { signedUrl: string } | null }>;
            };
          };
        };
        const { data } = await supabase
          .from('project_documents')
          .select('storage_path')
          .eq('id', projectDocumentId)
          .maybeSingle();
        const path = data?.storage_path ?? null;
        if (!path) {
          if (live) setSettled(true);
          return;
        }
        const signed = await supabase.storage
          .from('project-documents')
          .createSignedUrl(path, 3600);
        if (!live) return;
        setUrl(signed.data?.signedUrl ?? null);
        setSettled(true);
      } catch {
        if (live) setSettled(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [projectDocumentId]);

  const title = `${sheetNumber} · Rev ${revLetter}`;

  return (
    <FullScreenViewerShell
      title={title}
      meta={`${sheetTitle} · filed ${fmtDay(filedAt)}`}
      onClose={onClose}
      actionKey="close-plan-print-viewer"
    >
      {!isCurrent && supersededBy && (
        <div className="flex shrink-0 items-center justify-end border-b border-[var(--doc-ink-border)] px-4 py-2 sm:px-7">
          <Stamp
            label={`SUPERSEDED · by Rev ${supersededBy}`}
            color="var(--color-terracotta)"
            ink="var(--color-aged-oak)"
          />
        </div>
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-6">
        {!settled ? (
          <FullScreenViewerState>Opening the print…</FullScreenViewerState>
        ) : !url ? (
          <FullScreenViewerState error>
            This print could not be opened. File it again and try once more.
          </FullScreenViewerState>
        ) : (
          <iframe
            title={title}
            src={url}
            className="h-full min-h-[60dvh] w-full border border-[var(--doc-ink-border)] bg-white"
          />
        )}
      </div>
    </FullScreenViewerShell>
  );
}
