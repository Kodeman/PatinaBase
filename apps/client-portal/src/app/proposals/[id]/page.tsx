'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { useProposalSections } from '@patina/supabase';
import { useClientProposal } from '@/hooks/use-proposals-client';
import { ProposalDocument } from '@/components/proposal-document';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function ClientProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: proposal, isLoading: proposalLoading } = useClientProposal(id);
  const { data: sections, isLoading: sectionsLoading } = useProposalSections(id);

  if (proposalLoading || sectionsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="type-body-small">Proposal not found.</p>
        <Link
          href="/proposals"
          className="mt-4 inline-flex items-center gap-1 type-meta text-[var(--accent-primary)] no-underline hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to proposals
        </Link>
      </div>
    );
  }

  const canSign = proposal.status === 'sent' || proposal.status === 'viewed';
  const isSigned = proposal.status === 'accepted';

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="proposal-print-hide mb-6 flex items-center justify-between">
        <Link
          href="/proposals"
          className="inline-flex items-center gap-1.5 type-meta no-underline transition hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Proposals
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--border-default)] px-3 py-1.5 type-meta no-underline transition hover:text-[var(--text-primary)]"
        >
          <Download className="h-3.5 w-3.5" />
          Download PDF
        </button>
      </div>

      {isSigned && (proposal as { signed_at?: string }).signed_at && (
        <div
          className="proposal-print-hide mb-6 flex items-center gap-2 rounded-[3px] border border-patina-sage/30 px-4 py-3"
          style={{ background: 'rgba(122, 155, 118, 0.06)' }}
        >
          <CheckCircle2 className="h-4 w-4 text-patina-sage" />
          <p className="type-body-small text-[var(--text-primary)]">
            Signed by{' '}
            {(proposal as { signed_by_name?: string }).signed_by_name ?? 'you'} on{' '}
            {formatDate((proposal as { signed_at: string }).signed_at)}.
          </p>
        </div>
      )}

      <ProposalDocument
        proposal={proposal}
        sections={sections ?? []}
        trackEngagement={!isSigned}
      />

      {canSign && (
        <div className="proposal-print-hide mx-auto mt-6 flex max-w-[760px] items-center justify-between gap-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-4">
          <p className="type-body-small text-[var(--text-body)]">
            Ready to move forward? Sign to confirm scope and kick off your project.
          </p>
          <Link
            href={`/proposals/${proposal.id}/sign`}
            className="inline-flex items-center gap-2 rounded-[3px] bg-patina-charcoal px-5 py-2.5 text-sm font-medium text-white no-underline transition hover:opacity-90"
          >
            Sign proposal
          </Link>
        </div>
      )}
    </div>
  );
}
