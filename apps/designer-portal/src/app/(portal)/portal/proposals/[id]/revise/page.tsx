'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useProposal,
  useProposalVersions,
  useCreateProposalRevision,
  useUpdateProposal,
} from '@/hooks/use-proposals';
import { getProposalStatusDisplay } from '@/lib/proposal-status';
import { RevisionFeedback } from '@/components/portal/revision-feedback';
import { VersionTag } from '@/components/portal/version-tag';
import { PageActionBar } from '@/components/portal';
import { Button } from '@/components/ui/controls';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { proposalEvents } from '@/lib/analytics';

export default function ReviseProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal, isLoading } = useProposal(id) as { data: any; isLoading: boolean };
  const { data: versions } = useProposalVersions(id);
  const createRevision = useCreateProposalRevision();
  const updateProposal = useUpdateProposal();

  const [revisionSummary, setRevisionSummary] = useState('');

  const handleOpenEditor = async () => {
    try {
      // Create a new revision from this proposal
      const newProposal = await createRevision.mutateAsync({
        sourceProposalId: id,
        revisionSummary: revisionSummary || undefined,
      });
      proposalEvents.revisionCreated({
        sourceProposalId: id,
        newProposalId: newProposal.id,
        version: newProposal.version ?? 0,
      });
      router.push(`/portal/proposals/${newProposal.id}`);
    } catch (err) {
      console.error('Failed to create revision:', err);
    }
  };

  const handleCancelRevision = async () => {
    try {
      await updateProposal.mutateAsync({
        proposalId: id,
        updates: { status: 'sent' } as never,
      });
      router.push(`/portal/proposals/${id}`);
    } catch (err) {
      console.error('Failed to cancel revision:', err);
    }
  };

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
  if (!proposal) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Proposal not found.
      </p>
    );
  }

  const total = ((proposal.total_amount || 0) / 100).toLocaleString();
  const currentVersion = proposal.version || 1;
  const nextVersion = currentVersion + 1;

  return (
    <div className="pt-8">
      <PageActionBar
        status={{
          tone: 'accent',
          label: getProposalStatusDisplay('revised').label,
        }}
        meta={
          <span className="type-label-secondary">
            {proposal.title} &middot; {proposal.client?.full_name || 'Client'} &middot; ${total} &middot; v{currentVersion}.0 &rarr; v{nextVersion}.0
          </span>
        }
      />

      <h1 className="type-section-head mb-6" style={{ fontSize: '1.5rem' }}>
        Revise Proposal
      </h1>

      {/* Client feedback */}
      {proposal.client_feedback && (
        <div className="mb-8">
          <RevisionFeedback
            feedback={proposal.client_feedback}
            clientName={proposal.client?.full_name || 'Client'}
            date={proposal.updated_at}
          />
        </div>
      )}

      {!proposal.client_feedback && (
        <div
          className="mb-8 rounded-md border border-[var(--color-pearl)] p-5"
        >
          <p
            className="italic"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.88rem',
              color: 'var(--text-muted)',
            }}
          >
            No client feedback recorded. You can still create a new version with your own updates.
          </p>
        </div>
      )}

      {/* Revision summary */}
      <div className="mb-8 max-w-[520px]">
        <div className="mb-1.5 flex flex-col gap-1.5">
          <label
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
            }}
          >
            Revision Summary (visible to client)
          </label>
          <textarea
            rows={3}
            value={revisionSummary}
            onChange={(e) => setRevisionSummary(e.target.value)}
            placeholder="Describe what changed and why..."
            className="resize-y rounded border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
            style={{ fontFamily: 'var(--font-body)', minHeight: 80 }}
          />
        </div>
      </div>

      {/* Version history */}
      {versions && versions.length > 0 && (
        <div className="mb-6 flex items-center gap-2">
          <span className="type-meta-small">Version History:</span>
          <VersionTag version={nextVersion} label="current draft" active />
          {versions.map((v) => (
            <VersionTag
              key={v.id}
              version={v.version}
              label={
                v.sent_at
                  ? `sent ${new Date(v.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : v.status
              }
              onClick={() => router.push(`/portal/proposals/${v.id}/preview`)}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="primary"
          onClick={handleOpenEditor}
          disabled={createRevision.isPending}
        >
          {createRevision.isPending ? 'Creating...' : 'Open Editor \u2192'}
        </Button>
        {versions && versions.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => {
              // View the most recent sent version
              const sentVersion = versions.find((v) => v.status === 'sent' || v.status === 'viewed');
              if (sentVersion) router.push(`/portal/proposals/${sentVersion.id}/preview`);
            }}
          >
            View v{currentVersion}.0
          </Button>
        )}
        <Button variant="ghost" onClick={handleCancelRevision}>
          Cancel Revision
        </Button>
      </div>
    </div>
  );
}
