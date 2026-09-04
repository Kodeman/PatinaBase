'use client';

import { CommercialDocumentShell } from '@/components/commercial-document-shell';
import { useClientCommercialDocument } from '@/hooks/use-commercial-client';

/* ── THE PAPER, READ IN FULL ─────────────────────────────────────────────────
   The old `/proposals/[id]` page was, underneath its chrome, one thing: the
   instrument printed out at length — every section, every line, every
   signature. That reading is what this file moves onto the page, unchanged:
   the same `CommercialDocumentShell` the route rendered, over the same
   `get_client_commercial_document_bundle` read, laid into whatever unfolds it
   (the door's "Read it in full", a signed instrument in Previously, the papers
   sheet) instead of behind a route the client has to leave the house for.

   A LEGACY ROW HAS NO SHELL. `CommercialDocumentShell` returns null for
   `kind: 'legacy'`, so this holds its tongue rather than unfolding an empty
   panel; the acts that offer the reading decide not to offer it at all.
   ────────────────────────────────────────────────────────────────────────── */

export interface InstrumentReadingProps {
  proposalId: string;
}

export function InstrumentReading({ proposalId }: InstrumentReadingProps) {
  const bundle = useClientCommercialDocument(proposalId);

  if (bundle.isLoading) {
    return (
      <p
        data-testid="instrument-reading-drawing"
        className="mt-3 text-[15px] leading-normal text-[var(--text-muted)]"
      >
        Drawing this paper.
      </p>
    );
  }

  // The one sentence the door already says when the read fails; a refusal the
  // client can act on, not a thrown error string printed as content.
  if (bundle.isError) {
    return (
      <p
        role="alert"
        data-testid="instrument-reading-refused"
        className="mt-3 text-[15px] leading-normal text-[var(--color-error)]"
      >
        This paper could not be drawn just now. Reload to try again.
      </p>
    );
  }

  if (!bundle.data || bundle.data.document.kind === 'legacy') return null;

  return (
    <div
      data-testid="instrument-reading"
      className="mt-4 border border-[var(--border-subtle)] bg-[var(--bg-warm)] p-1"
    >
      <CommercialDocumentShell bundle={bundle.data} />
    </div>
  );
}
