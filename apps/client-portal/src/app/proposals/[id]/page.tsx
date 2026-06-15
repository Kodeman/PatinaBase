'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, Download, Loader2 } from 'lucide-react';
import {
  useProposalSections,
  useProposalPaymentMilestones,
  useProposalPhases,
  useProposalExclusions,
  useProposalScopeRooms,
  useBoards,
} from '@patina/supabase';
import { useClientProposal } from '@/hooks/use-proposals-client';
import { ProposalDocument } from '@/components/proposal-document';
import { ProposalDeclineDialog } from '@/components/proposals/ProposalDeclineDialog';
import { ProposalRequestChangeDialog } from '@/components/proposals/ProposalRequestChangeDialog';
import { ProposalClarifyButton } from '@/components/proposals/ProposalClarifyButton';

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
  const { data: paymentMilestones } = useProposalPaymentMilestones(id);
  const { data: phases } = useProposalPhases(id);
  const { data: exclusions } = useProposalExclusions(id);
  const { data: scopeRooms } = useProposalScopeRooms(id);
  // RLS restricts board reads to non-draft proposals the client is on.
  const { data: boards } = useBoards(id);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [requestChangeOpen, setRequestChangeOpen] = useState(false);

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

  const isSigned = proposal.status === 'accepted';
  const isExpiredStatus = proposal.status === 'expired';
  const isDeclined = proposal.status === 'declined';

  // Expiry gate: a proposal can still carry status "sent"/"viewed" past its
  // valid_until date if the server-side expiry job hasn't run yet. Treat a
  // passed valid_until as expired for actionability, but only when the
  // proposal isn't already signed or explicitly expired.
  const isPassedExpiry =
    !isSigned &&
    !isExpiredStatus &&
    !!proposal.valid_until &&
    !Number.isNaN(new Date(proposal.valid_until).getTime()) &&
    new Date(proposal.valid_until).getTime() < Date.now();

  const isExpired = isExpiredStatus || isPassedExpiry;
  const isActionable =
    (proposal.status === 'sent' || proposal.status === 'viewed') && !isPassedExpiry;

  const proposalAudit = proposal as unknown as {
    signed_at?: string | null;
    signed_by_name?: string | null;
    declined_at?: string | null;
    decline_reason?: string | null;
  };

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

      {isSigned && proposalAudit.signed_at && (
        <div
          className="proposal-print-hide mb-6 flex items-center gap-2 rounded-[3px] border border-patina-sage/30 px-4 py-3"
          style={{ background: 'rgba(122, 155, 118, 0.06)' }}
        >
          <CheckCircle2 className="h-4 w-4 text-patina-sage" />
          <p className="type-body-small text-[var(--text-primary)]">
            Signed by {proposalAudit.signed_by_name ?? 'you'} on{' '}
            {formatDate(proposalAudit.signed_at)}.
          </p>
        </div>
      )}

      {isExpired && (
        <div
          className="proposal-print-hide mb-6 flex items-center gap-2 rounded-[3px] border px-4 py-3"
          style={{
            background: 'rgba(0,0,0,0.03)',
            borderColor: 'var(--border-default)',
          }}
          data-testid="proposal-expired-banner"
        >
          <Clock className="h-4 w-4 text-[var(--text-muted)]" />
          <p className="type-body-small text-[var(--text-primary)]">
            This proposal has expired
            {proposal.valid_until ? ` on ${formatDate(proposal.valid_until)}` : ''}. Contact your
            designer to renew.
          </p>
        </div>
      )}

      {isDeclined && (
        <div
          className="proposal-print-hide mb-6 flex items-center gap-2 rounded-[3px] border px-4 py-3"
          style={{
            background: 'rgba(199, 123, 110, 0.05)',
            borderColor: 'rgba(199, 123, 110, 0.25)',
          }}
        >
          <p className="type-body-small text-[var(--text-primary)]">
            You declined this proposal
            {proposalAudit.declined_at ? ` on ${formatDate(proposalAudit.declined_at)}` : ''}.
            {proposalAudit.decline_reason ? ` Reason: ${proposalAudit.decline_reason}` : ''}
          </p>
        </div>
      )}

      <ProposalDocument
        proposal={proposal}
        sections={sections ?? []}
        trackEngagement={!isSigned}
        paymentMilestones={paymentMilestones ?? []}
        phases={phases ?? []}
        exclusions={exclusions ?? []}
        scopeRooms={scopeRooms ?? []}
        boards={boards ?? []}
      />

      {isActionable && (
        <div className="proposal-print-hide mx-auto mt-6 flex max-w-[760px] flex-col gap-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="type-body-small text-[var(--text-body)]">
            Ready to move forward? Sign to confirm scope and kick off your project.
          </p>
          <div className="flex flex-wrap gap-2">
            {proposal.project_id && <ProposalClarifyButton projectId={proposal.project_id} />}
            <button
              type="button"
              onClick={() => setRequestChangeOpen(true)}
              className="inline-flex items-center justify-center rounded-[3px] border border-[var(--border-default)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-surface)]"
              data-testid="proposal-request-change-trigger"
            >
              Request a change
            </button>
            <button
              type="button"
              onClick={() => setDeclineOpen(true)}
              className="inline-flex items-center justify-center rounded-[3px] border border-[var(--border-default)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-surface)]"
              data-testid="proposal-decline-trigger"
            >
              Decline
            </button>
            <Link
              href={`/proposals/${proposal.id}/sign`}
              className="inline-flex items-center gap-2 rounded-[3px] bg-patina-charcoal px-5 py-2.5 text-sm font-medium text-white no-underline transition hover:opacity-90"
            >
              Sign proposal
            </Link>
          </div>
        </div>
      )}

      <ProposalDeclineDialog
        proposalId={proposal.id}
        open={declineOpen}
        onOpenChange={setDeclineOpen}
      />

      <ProposalRequestChangeDialog
        proposalId={proposal.id}
        open={requestChangeOpen}
        onOpenChange={setRequestChangeOpen}
      />
    </div>
  );
}
