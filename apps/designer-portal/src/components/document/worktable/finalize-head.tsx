'use client';

/**
 * The Finalize table's head (Start to Signature W4a, flag `worktable`).
 *
 * Two lines, in the Document's voice:
 *
 *   1. The verdict roll-up, promoted. On every other surface it is a 9px mono
 *      whisper under the section heading; on this table it is the headline
 *      sentence, because on a sent proposal where the client's verdicts stand
 *      IS the state of the document. The whisper stands down here — the same
 *      fact printed twice at two weights is two documents.
 *
 *   2. The one inked leader, derived (finalize-leader.ts) from lifecycle ×
 *      verdicts × the send wall's own nudge decision. Every verb here already
 *      exists below on the paper; the head promotes one of them and the
 *      instruments stand that one down, so the act is offered once.
 *
 * **This is the LEGACY proposal's head.** Its headline counts per-line client
 * verdicts and its leader is derived from the legacy watch — neither sentence
 * is true of a design-services agreement or a furnishings authorization, which
 * carry their own status blocks and their own acts. The head holds the same
 * gate `OfferFacets` does (`commercialDocumentExperience(...) === 'legacy'`)
 * so those editions keep their own voice; on `commercial_readonly` in
 * particular the wall below prints nothing at all, so a wrong leader here
 * would have been the document's only act.
 *
 * Scored ink, no buttons (I107). Overlays are local state over the still-
 * mounted document (D1).
 */

import { useState } from 'react';
import { useNudgeProposal, useProposal } from '@/hooks/use-proposals';
import { useFinalizeLeader } from '@/hooks/use-finalize-leader';
import { commercialDocumentExperience } from '@/lib/document/commercial-documents';
import { familyLabel } from '@/lib/document/family-label';
import {
  DocumentAction,
  DocumentActionGroup,
} from '../document-action';
import { ProposalPreview } from '../proposal-preview';
import { SendSheet } from '../overlays/send-sheet';

const HEADLINE_ID = 'finalize-table-heading';

export function FinalizeHead({
  proposalId,
  clientName,
}: {
  proposalId: string;
  clientName: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal } = useProposal(proposalId) as { data: any };
  const { headline, leader } = useFinalizeLeader(proposalId, clientName);
  const nudge = useNudgeProposal();
  const [note, setNote] = useState<{
    text: string;
    tone: 'ok' | 'warn' | 'err';
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);

  const onNudge = async () => {
    setNote(null);
    try {
      const res = await nudge.mutateAsync({ proposalId });
      setNote(
        res._emailDispatched
          ? { text: `Reminder sent to ${familyLabel(clientName)}.`, tone: 'ok' }
          : {
              text: 'Nudge recorded, but the email couldn’t be sent — follow up directly.',
              tone: 'warn',
            },
      );
    } catch (e) {
      setNote({
        text: e instanceof Error ? e.message : 'Could not send the reminder.',
        tone: 'err',
      });
    }
  };

  if (
    !proposal ||
    commercialDocumentExperience(proposal.document_kind) !== 'legacy'
  ) {
    return null;
  }

  return (
    <div data-finalize-head className="mb-3 mt-1">
      {headline && (
        // A real heading, as the neighbouring region heads print theirs: this
        // is the table's opening line, not a caption floating outside the
        // document's heading tree.
        <h2
          id={HEADLINE_ID}
          data-finalize-headline
          tabIndex={-1}
          className="font-heading text-[1.15rem] leading-snug text-[var(--color-charcoal)] outline-none"
        >
          {headline}
        </h2>
      )}
      {leader && (
        <DocumentActionGroup
          surfaceKey="open-document"
          regionKey="finalize-leader"
          className="mt-0.5"
          aria-label="The table's leader"
        >
          {leader.kind === 'nudge' && (
            <DocumentAction
              actionKey="nudge-client"
              variant="inked"
              loading={nudge.isPending}
              loadingLabel="Nudging…"
              onClick={onNudge}
            >
              {leader.label}
            </DocumentAction>
          )}
          {leader.kind === 'preview' && (
            <DocumentAction
              actionKey="preview-proposal-as-client"
              variant="inked"
              onClick={() => setPreviewOpen(true)}
            >
              {leader.label}
            </DocumentAction>
          )}
          {leader.kind === 'resend' && (
            <DocumentAction
              actionKey="resend-proposal"
              variant="inked"
              onClick={() => setResendOpen(true)}
            >
              {leader.label}
            </DocumentAction>
          )}
        </DocumentActionGroup>
      )}
      {note && (
        <p
          role={note.tone === 'err' ? 'alert' : 'status'}
          className="font-mono text-[10px] uppercase tracking-[0.06em]"
          style={{
            color:
              note.tone === 'ok'
                ? 'var(--color-sage)'
                : note.tone === 'warn'
                  ? 'var(--color-aged-oak)'
                  : '#C77B6E',
          }}
        >
          {note.text}
        </p>
      )}
      <SendSheet
        proposalId={proposalId}
        open={resendOpen}
        onClose={() => setResendOpen(false)}
      />
      {previewOpen && (
        <ProposalPreview
          proposalId={proposalId}
          clientName={clientName}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
