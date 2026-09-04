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

   IT ALWAYS SAYS SOMETHING. An unfold that opens on nothing is an offer that
   leads nowhere, so every branch prints a sentence: a read that came back
   empty takes the door's own refusal, and a legacy row — which
   `CommercialDocumentShell` has no shell for — says so plainly rather than
   opening an empty region. ─────────────────────────────────────────────── */

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

  // The one sentence the door already says when the read FAILED; a refusal the
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

  // A read that RESOLVED to nothing is not an error, and a reload does not
  // change it — so it says so quietly rather than in error ink under a promise
  // it cannot keep. It still says something: an unfold never opens on nothing.
  if (!bundle.data) {
    return (
      <p
        data-testid="instrument-reading-absent"
        className="mt-3 text-[15px] leading-normal text-[var(--text-muted)]"
      >
        This paper is not on file for you. Ask your studio for a copy of it.
      </p>
    );
  }

  if (bundle.data.document.kind === 'legacy') {
    return (
      <p
        data-testid="instrument-reading-unprinted"
        className="mt-3 text-[15px] leading-normal text-[var(--text-muted)]"
      >
        This is an older paper. Ask your studio for a copy of it.
      </p>
    );
  }

  return (
    <div
      data-testid="instrument-reading"
      className="mt-4 border border-[var(--border-subtle)] bg-[var(--bg-warm)] p-1"
    >
      <CommercialDocumentShell bundle={bundle.data} />
    </div>
  );
}
