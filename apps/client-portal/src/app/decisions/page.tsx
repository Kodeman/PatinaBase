'use client';

import { PROJECT_APPROVAL_CONTRACT, useAllDecisions } from '@patina/supabase';
import type { ClientDecision } from '@patina/supabase';
import { DecisionCardClient } from '@/components/decision-card-client';
import { isClientActionableDecision } from '@/hooks/use-decisions-client';
import { StrataMark } from '@/components/strata-mark';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ProjectApprovalSummaryForDecision } from '@/components/approvals/project-approval-summary';

function DecisionListRow({
  decision,
  compact = false,
}: {
  decision: ClientDecision;
  compact?: boolean;
}) {
  if (
    decision.approval_contract === PROJECT_APPROVAL_CONTRACT &&
    decision.project_id
  ) {
    return (
      <ProjectApprovalSummaryForDecision
        projectId={decision.project_id}
        decisionId={decision.id}
        fallbackTitle={decision.title}
        compact={compact}
      />
    );
  }

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
  const { data: decisions, isLoading } = useAllDecisions();

  const now = new Date();
  const projectApprovals = (decisions ?? []).filter(
    (d: ClientDecision) =>
      d.approval_contract === PROJECT_APPROVAL_CONTRACT && !!d.project_id,
  );
  const activeProjectApprovals = projectApprovals.filter(
    (d: ClientDecision) => d.status === 'draft' || d.status === 'pending',
  );
  const closedProjectApprovals = projectApprovals.filter(
    (d: ClientDecision) => d.status === 'responded' || d.status === 'expired',
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

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
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

      {!isLoading && activeProjectApprovals.length === 0 && closedProjectApprovals.length === 0 && pending.length === 0 && resolved.length === 0 && (
        <div className="py-16 text-center">
          <p className="type-body-small">No decisions yet. Your designer will send choices here when they need your input.</p>
        </div>
      )}

      {activeProjectApprovals.length > 0 && (
        <section className="mt-8" aria-labelledby="project-approvals-heading">
          <h2 id="project-approvals-heading" className="type-meta mb-4 text-patina-terracotta">
            Project approvals ({activeProjectApprovals.length})
          </h2>
          <div className="space-y-0">
            {activeProjectApprovals.map((decision: ClientDecision) => (
              <DecisionListRow key={decision.id} decision={decision} />
            ))}
          </div>
        </section>
      )}

      {/* Overdue decisions */}
      {overdue.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4 text-patina-terracotta">
            Overdue ({overdue.length})
          </h2>
          <div className="space-y-0">
            {overdue.map((decision: ClientDecision) => (
              <DecisionListRow key={decision.id} decision={decision} />
            ))}
          </div>
        </section>
      )}

      {/* Awaiting response decisions */}
      {awaiting.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4">
            Awaiting Your Response ({awaiting.length})
          </h2>
          <div className="space-y-0">
            {awaiting.map((decision: ClientDecision) => (
              <DecisionListRow key={decision.id} decision={decision} />
            ))}
          </div>
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
          <div className="space-y-0">
            {pendingHandled.map((decision: ClientDecision) => (
              <DecisionListRow key={decision.id} decision={decision} />
            ))}
          </div>
        </section>
      )}

      {(activeProjectApprovals.length > 0 || pending.length > 0) &&
        (closedProjectApprovals.length > 0 || resolved.length > 0) && (
        <StrataMark variant="mini" />
      )}

      {/* Resolved decisions */}
      {(closedProjectApprovals.length > 0 || resolved.length > 0) && (
        <section className={pending.length === 0 ? 'mt-10' : 'mt-2'}>
          <h2 className="type-meta mb-4">
            History ({closedProjectApprovals.length + resolved.length})
          </h2>
          <div className="space-y-0">
            {closedProjectApprovals.map((decision: ClientDecision) => (
              <DecisionListRow key={decision.id} decision={decision} compact />
            ))}
            {resolved.map((decision: ClientDecision) => (
              <DecisionListRow key={decision.id} decision={decision} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
