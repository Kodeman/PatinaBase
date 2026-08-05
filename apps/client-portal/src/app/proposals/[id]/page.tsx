'use client';

import { use, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, Download, Loader2 } from 'lucide-react';
import {
  useStudioIdentity,
} from '@patina/supabase';
import { FeatureAnnouncementCoachmark, SurfaceKeys } from '@patina/help-system';
import { useClientProposal } from '@/hooks/use-proposals-client';
import { useClientCommercialDocument } from '@/hooks/use-commercial-client';
import { commercialSummaryFromProposal } from '@/lib/commercial-documents';
import { useHelpStateReady } from '@/components/help/help-state-setup';
import { ProposalDocument } from '@/components/proposal-document';
import { ProposalDeclineDialog } from '@/components/proposals/ProposalDeclineDialog';
import { ProposalRequestChangeDialog } from '@/components/proposals/ProposalRequestChangeDialog';
import { ProposalClarifyButton } from '@/components/proposals/ProposalClarifyButton';
import { QueryFailure } from '@/components/query-failure';
import { CommercialDeclineDialog, CommercialDocumentShell } from '@/components/commercial-document-shell';
import { CommercialNotificationRecovery } from '@/components/commercial-notification-recovery';

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
  const {
    data: proposal,
    bundle,
    isLoading: proposalLoading,
    isError: proposalError,
    refetch: refetchProposal,
  } = useClientProposal(id);
  const { data: commercialBundle } = useClientCommercialDocument(id);
  const sections = bundle?.sections ?? [];
  const paymentMilestones = bundle?.payment_milestones ?? [];
  const phases = bundle?.phases ?? [];
  const exclusions = bundle?.exclusions ?? [];
  const scopeRooms = bundle?.scope_rooms ?? [];
  const boards = bundle?.boards ?? [];
  const { data: identity } = useStudioIdentity(
    proposal?.project_id
      ? { projectId: proposal.project_id }
      : { designerId: proposal?.designer_id }
  );
  const [declineOpen, setDeclineOpen] = useState(false);
  const [requestChangeOpen, setRequestChangeOpen] = useState(false);

  // Proposal-view welcome (help-desk Wave 1, T1d). Anchored to the page
  // header row because it is the only element that renders on every proposal
  // state — the sign / request-change action block only exists while the
  // proposal is actionable (not on signed / declined / expired renders).
  // Gated on help-state hydration so a dismissal made on another device is
  // respected before the one-shot coachmark decides to show.
  const helpStateReady = useHelpStateReady();
  const welcomeAnchorRef = useRef<HTMLDivElement>(null);

  if (proposalLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (proposalError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <QueryFailure
          title="Unable to load this proposal"
          message="The proposal could not be opened just now. Try again before asking your designer for another copy."
          onRetry={refetchProposal}
        />
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

  const commercial = commercialBundle?.document ?? commercialSummaryFromProposal(proposal);
  const isLegacy = commercial.kind === 'legacy';
  const isSigned = commercial.state === 'executed';
  const isExpiredStatus = commercial.state === 'expired';
  const isDeclined = commercial.state === 'declined';
  // Legacy rows can reach 'superseded' via the cutover RPC even though their
  // proposal.status never changes. Non-legacy documents already render their
  // own superseded messaging inside CommercialDocumentShell, so this banner
  // is scoped to legacy to avoid a duplicate.
  const isSuperseded = isLegacy && commercial.state === 'superseded';

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
    commercial.state === 'sent' && !isPassedExpiry;

  // C3 — the per-line verdict loop is offered while the proposal is live for
  // review and the per-proposal gate (proposals.feedback_enabled, 00267) is on.
  const feedbackEnabled =
    isActionable && (proposal as { feedback_enabled?: boolean }).feedback_enabled !== false;

  const proposalAudit = proposal as unknown as {
    signed_at?: string | null;
    signed_by_name?: string | null;
    declined_at?: string | null;
    decline_reason?: string | null;
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {helpStateReady && (
        <FeatureAnnouncementCoachmark
          featureKey="client-portal/proposals/welcome"
          surfaceKey={SurfaceKeys.ClientPortal.Proposals.Welcome}
          anchorRef={welcomeAnchorRef as RefObject<HTMLElement>}
          persona="consumer"
          side="bottom"
          fallbackTitle="Your proposal"
          fallbackBody="Read at your pace. Anything your designer needs from you sits highlighted — nothing commits until you sign."
        />
      )}

      <div
        ref={welcomeAnchorRef}
        className="proposal-print-hide mb-6 flex items-center justify-between"
      >
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

      {isLegacy && isSigned && proposalAudit.signed_at && (
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

      {isSuperseded && (
        <div
          className="proposal-print-hide mb-6 flex items-center gap-2 rounded-[3px] border px-4 py-3"
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border-default)',
          }}
          data-testid="proposal-superseded-banner"
        >
          <Clock className="h-4 w-4 text-[var(--text-muted)]" />
          <p className="type-body-small text-[var(--text-primary)]">
            This edition was replaced and can no longer be signed.
            {commercial.replacementProposalId ? (
              <>
                {' '}<Link className="text-[var(--accent-primary)]" href={`/proposals/${commercial.replacementProposalId}`}>
                  Open the current edition.
                </Link>
              </>
            ) : (
              ' Ask your studio for the current edition.'
            )}
          </p>
        </div>
      )}

      {commercialBundle && !isLegacy ? (
        <CommercialDocumentShell bundle={commercialBundle} />
      ) : (
        <ProposalDocument
          proposal={proposal}
          sections={sections}
          trackEngagement={!isSigned}
          paymentMilestones={paymentMilestones}
          phases={phases}
          exclusions={exclusions}
          scopeRooms={scopeRooms}
          boards={[]}
          resolvedBoards={boards}
          moodBoardSurface="client_proposal"
          feedbackEnabled={feedbackEnabled}
          sharedByStudio={identity?.name ?? undefined}
        />
      )}

      {commercialBundle && !isLegacy && (
        <CommercialNotificationRecovery document={commercialBundle.document} />
      )}

      {isActionable && (
        <div className="proposal-print-hide mx-auto mt-6 flex max-w-[760px] flex-col gap-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="type-body-small text-[var(--text-body)]">
            {isLegacy
              ? 'Your designer will send a new agreement to move this forward — questions and change requests still work in the meantime.'
              : commercial.kind === 'design_services'
                ? 'Sign to record your consent. The agreement becomes effective only after the studio countersigns.'
                : commercial.kind === 'furnishings_authorization'
                  ? 'Authorize only the named furnishing lines, quantities, and client prices shown here.'
                  : commercial.kind === 'service_addendum'
                    ? 'Sign to accept these additional design-services terms.'
                    : 'Ready to move forward? Sign to confirm the proposal.'}
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
            {!isLegacy && (
              <Link
                href={`/proposals/${proposal.id}/sign`}
                className="inline-flex items-center gap-2 rounded-[3px] bg-patina-charcoal px-5 py-2.5 text-sm font-medium text-white no-underline transition hover:opacity-90"
              >
                {commercial.kind === 'furnishings_authorization' ? 'Authorize furnishings' : 'Sign document'}
              </Link>
            )}
          </div>
        </div>
      )}

      {isLegacy ? (
        <ProposalDeclineDialog
          proposalId={proposal.id}
          open={declineOpen}
          onOpenChange={setDeclineOpen}
        />
      ) : (
        <CommercialDeclineDialog
          proposalId={proposal.id}
          projectId={proposal.project_id}
          open={declineOpen}
          onOpenChange={setDeclineOpen}
        />
      )}

      <ProposalRequestChangeDialog
        proposalId={proposal.id}
        open={requestChangeOpen}
        onOpenChange={setRequestChangeOpen}
      />
    </div>
  );
}
