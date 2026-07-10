'use client';

/**
 * ReviseSheet (R44) — the document-native revise instrument. The legacy
 * /portal/proposals/[id]/revise route, ported into a charcoal DocSheet (D8)
 * that slides up over the open Proposal — an overlay, never a route (D1).
 *
 * Shows the client's feedback on this version (RevisionFeedback), takes a
 * revision summary, and opens v2 as a fresh draft via useCreateProposalRevision
 * (clone_proposal — deep-copies the proposal AND child tables; the v1
 * client_feedback is carried forward by the clone). The caller is handed the
 * new id via onOpened so it can swap the document beneath to v2 WITHOUT a route
 * change.
 *
 * Supersede-on-SEND (NOT here): we do NOT call useEnterRevision. v1 stays
 * sent/viewed and signable until the designer sends v2 — that send (send_proposal)
 * is what supersedes the chain. Opening a draft revision must not pull v1 out of
 * the client's hands.
 *
 * Dangling-draft guard (carried from the legacy page): if a higher-version row
 * is already sitting in 'draft' in this chain, reuse it instead of cloning again.
 */

import { useState } from 'react';
import {
  useProposal,
  useProposalVersions,
  useCreateProposalRevision,
} from '@/hooks/use-proposals';
import { RevisionFeedback } from '@/components/portal/revision-feedback';
import { proposalEvents } from '@/lib/analytics';
import { DocSheet } from './doc-sheet';

const labelCls =
  'font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

export function ReviseSheet({
  proposalId,
  open,
  onClose,
  onOpened,
}: {
  proposalId: string;
  open: boolean;
  onClose: () => void;
  /** Handed the new v2 draft id so the caller can swap the document beneath. */
  onOpened: (newProposalId: string) => void;
}) {
  const { data: proposal } = useProposal(proposalId) as { data: any };
  const { data: versions } = useProposalVersions(proposalId);
  const createRevision = useCreateProposalRevision();

  const [revisionSummary, setRevisionSummary] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentVersion = proposal?.version ?? 1;
  const nextVersion = currentVersion + 1;

  const handleOpenRevision = async () => {
    setError(null);
    try {
      // Dangling-draft guard: a higher-version row still in 'draft' means a
      // revision was already started — reuse it instead of cloning again.
      const existingDraft = (versions ?? []).find(
        (v) => v.status === 'draft' && (v.version ?? 0) > currentVersion,
      );
      if (existingDraft) {
        onOpened(existingDraft.id);
        onClose();
        return;
      }

      const newProposal = await createRevision.mutateAsync({
        sourceProposalId: proposalId,
        revisionSummary: revisionSummary || undefined,
      });
      proposalEvents.revisionCreated({
        sourceProposalId: proposalId,
        newProposalId: newProposal.id,
        version: newProposal.version ?? 0,
      });
      onOpened(newProposal.id);
      onClose();
    } catch (err) {
      console.error('Failed to create revision:', err);
      setError(
        err instanceof Error ? err.message : 'Could not open the revision. Please try again.',
      );
    }
  };

  const clientName = proposal?.client?.full_name || 'Client';

  return (
    <DocSheet open={open} onClose={onClose} title="Revise proposal">
      <div className="mx-auto max-w-xl">
        <p className={labelCls}>
          {proposal?.title ?? 'Proposal'} &middot; v{currentVersion}.0 &rarr; v{nextVersion}.0
        </p>
        <h2 className="mt-1 font-heading text-xl text-[var(--color-charcoal)]">Revise proposal</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
          Open a new version as a draft. v{currentVersion}.0 stays in the client&rsquo;s hands until
          you send v{nextVersion}.0 — sending the new version is what supersedes the old one.
        </p>

        {!proposal ? (
          <p className="mt-6 text-[12.5px] italic text-[var(--color-aged-oak)]">Loading…</p>
        ) : (
          <div className="mt-5 space-y-5">
            {/* Client feedback on v1 — RevisionFeedback carries its own (dark)
                ink, so it rides a paper panel to stay legible over charcoal. */}
            {proposal.client_feedback ? (
              <div className="rounded-[4px] bg-[var(--doc-paper)] p-1">
                <RevisionFeedback
                  feedback={proposal.client_feedback}
                  clientName={clientName}
                  date={proposal.updated_at}
                />
              </div>
            ) : (
              <p className="text-[12.5px] italic text-[var(--color-aged-oak)]">
                No client feedback on this version. You can still open a new version with your own
                updates.
              </p>
            )}

            {/* Revision summary */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="revise-sheet-summary">
                Revision summary (visible to client)
              </label>
              <textarea
                id="revise-sheet-summary"
                rows={3}
                value={revisionSummary}
                onChange={(e) => setRevisionSummary(e.target.value)}
                placeholder="Describe what changed and why…"
                className="w-full resize-y rounded-[4px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[13px] text-[var(--color-charcoal)] outline-none transition-colors placeholder:italic placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)]"
                style={{ minHeight: 80 }}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-[4px] border border-[rgba(196,124,92,0.4)] bg-[rgba(196,124,92,0.08)] p-3 text-[12.5px] text-[var(--color-clay)]"
              >
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-4 border-t border-[var(--color-pearl)] pt-5">
              <button
                type="button"
                onClick={handleOpenRevision}
                disabled={createRevision.isPending}
                className="rounded-[4px] bg-[var(--color-clay)] px-4 py-2 text-[12px] font-medium text-[var(--color-charcoal)] transition-opacity disabled:opacity-40"
              >
                {createRevision.isPending
                  ? 'Opening…'
                  : `Open v${nextVersion}.0 →`}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]"
              >
                Not now
              </button>
            </div>
          </div>
        )}
      </div>
    </DocSheet>
  );
}
