'use client';

import {
  PROJECT_APPROVAL_CONTRACT,
  useAllDecisions,
  useMyProjectApprovalReviews,
} from '@patina/supabase';
import type { ClientDecision, ProjectApprovalReview } from '@patina/supabase';
import { DecisionCardClient } from '@/components/decision-card-client';
import { isClientActionableDecision } from '@/hooks/use-decisions-client';
import { StrataMark } from '@/components/strata-mark';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ProjectApprovalSummary } from '@/components/approvals/project-approval-summary';

function LegacyDecisionListRow({
  decision,
  compact = false,
}: {
  decision: ClientDecision;
  compact?: boolean;
}) {
  return (
    <div className="border-b border-[var(--border-default)] pb-3">
      <DecisionCardClient decision={decision} compact={compact} />
      <Link
        href={`/decisions/${decision.id}`}
        className="type-meta mt-2 inline-flex min-h-11 items-center underline"
      >
        Open decision and discussion
      </Link>
    </div>
  );
}

export default function ClientDecisionsPage() {
  const {
    data: decisions,
    isLoading: legacyLoading,
  } = useAllDecisions();
  const {
    data: projectApprovalReviews,
    isLoading: projectApprovalsLoading,
    isError: projectApprovalsError,
  } = useMyProjectApprovalReviews();

  const now = new Date();
  const projectApprovals = projectApprovalReviews ?? [];
  const activeProjectApprovals = projectApprovals.filter(
    (approval: ProjectApprovalReview) =>
      approval.disposition === 'active' &&
      (approval.lifecycleStatus === 'draft' ||
        approval.lifecycleStatus === 'pending'),
  );
  const closedProjectApprovals = projectApprovals.filter(
    (approval: ProjectApprovalReview) =>
      !activeProjectApprovals.includes(approval),
  );
  const legacyDecisions = (decisions ?? []).filter(
    (d: ClientDecision) => d.approval_contract !== PROJECT_APPROVAL_CONTRACT,
  );
  const pending = legacyDecisions.filter(
    (d: ClientDecision) => d.status === 'pending'
  );
  // The client's "your move" pile: selections + sign-offs in their court.
  const pendingMine = pending.filter(isClientActionableDecision);
  // Track 5 — pending coordination items the client can read but isn't acting on
  // (RFIs / submittals / punch items, or anything in the designer / GC / vendor
  // court). Shown quietly, read-only, as "your designer is handling this".
  const pendingHandled = pending.filter((d) => !isClientActionableDecision(d));
  const overdue = pendingMine.filter(
    (d) => d.due_date && new Date(d.due_date) < now
  );
  const awaiting = pendingMine.filter(
    (d) => !d.due_date || new Date(d.due_date) >= now
  );
  const resolved = legacyDecisions.filter(
    (d: ClientDecision) => d.status === 'responded'
  );
  const isLoading = legacyLoading || projectApprovalsLoading;
  const hasAnyDecision =
    activeProjectApprovals.length > 0 ||
    closedProjectApprovals.length > 0 ||
    pending.length > 0 ||
    resolved.length > 0;

  return (
    <main className="mx-auto min-w-0 max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="type-page-title">
        Your Decisions
      </h1>
      <p className="type-body mt-2">
        Choices your designer needs from you to keep your project moving forward.
      </p>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      )}

      {!isLoading && projectApprovalsError && (
        <p role="alert" className="type-body-small mt-8 text-[var(--color-error)]">
          Project approvals could not be read just now. Refresh before taking action.
        </p>
      )}

      {!isLoading && !projectApprovalsError && !hasAnyDecision && (
        <div className="py-16 text-center">
          <p className="type-body-small">No decisions yet. Your designer will send choices here when they need your input.</p>
        </div>
      )}

      {activeProjectApprovals.length > 0 && (
        <section className="mt-8" aria-labelledby="project-approvals-heading">
          <h2 id="project-approvals-heading" className="type-meta mb-4 text-patina-terracotta">
            Project approvals ({activeProjectApprovals.length})
          </h2>
          <ul aria-label="Project approvals" className="min-w-0 list-none space-y-0 p-0">
            {activeProjectApprovals.map((approval: ProjectApprovalReview) => (
              <li key={approval.decisionId} className="min-w-0">
                <ProjectApprovalSummary approval={approval} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Overdue decisions */}
      {overdue.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4 text-patina-terracotta">
            Overdue ({overdue.length})
          </h2>
          <ul className="list-none space-y-0 p-0">
            {overdue.map((decision: ClientDecision) => (
              <li key={decision.id}>
                <LegacyDecisionListRow decision={decision} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Awaiting response decisions */}
      {awaiting.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4">
            Awaiting Your Response ({awaiting.length})
          </h2>
          <ul className="list-none space-y-0 p-0">
            {awaiting.map((decision: ClientDecision) => (
              <li key={decision.id}>
                <LegacyDecisionListRow decision={decision} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Track 5 — coordination items your designer is carrying for you.
          Read-only mirror: visible so nothing ages in the dark, but clearly
          not the client's to act on. */}
      {pendingHandled.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-1 text-[var(--text-muted)]">
            Your Designer Is Handling ({pendingHandled.length})
          </h2>
          <p className="type-body-small mb-4 text-[var(--text-muted)]">
            In progress with your designer — no action needed from you.
          </p>
          <ul className="list-none space-y-0 p-0">
            {pendingHandled.map((decision: ClientDecision) => (
              <li key={decision.id}>
                <LegacyDecisionListRow decision={decision} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {(activeProjectApprovals.length > 0 || pending.length > 0) &&
        (closedProjectApprovals.length > 0 || resolved.length > 0) && (
        <StrataMark variant="mini" />
      )}

      {/* Resolved decisions */}
      {(closedProjectApprovals.length > 0 || resolved.length > 0) && (
        <section className={pending.length === 0 && activeProjectApprovals.length === 0 ? 'mt-10' : 'mt-2'}>
          <h2 className="type-meta mb-4">
            History ({closedProjectApprovals.length + resolved.length})
          </h2>
          <ul className="min-w-0 list-none space-y-0 p-0">
            {closedProjectApprovals.map((approval: ProjectApprovalReview) => (
              <li key={approval.decisionId} className="min-w-0">
                <ProjectApprovalSummary approval={approval} compact />
              </li>
            ))}
            {resolved.map((decision: ClientDecision) => (
              <li key={decision.id}>
                <LegacyDecisionListRow decision={decision} compact />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
