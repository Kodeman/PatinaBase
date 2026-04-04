'use client';

import { useScopeBuilderSummary } from '@patina/supabase';
import { RoomsInScope } from './rooms-in-scope';
import { FFEScheduleBuilder } from './ffe-schedule-builder';
import { PhaseBuilder } from './phase-builder';
import { ExclusionsList } from './exclusions-list';
import { PaymentMilestonesBuilder } from './payment-milestones-builder';
import { ChangeOrderTermsEditor } from './change-order-terms-editor';

interface ScopeBuilderShellProps {
  proposalId: string;
  proposalTitle: string;
  onGenerateProposal: () => void;
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function ScopeBuilderShell({
  proposalId,
  proposalTitle,
  onGenerateProposal,
}: ScopeBuilderShellProps) {
  const { data: summary } = useScopeBuilderSummary(proposalId);

  const totalProjectCents = (summary?.totalBudgetCents || 0) + (summary?.totalDesignFeeCents || 0);

  return (
    <div>
      {/* Summary Card */}
      {summary && (
        <div className="mb-8 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="type-meta text-[var(--accent-primary)]">Scope Summary</span>
            <span className="font-mono text-xs text-[var(--text-muted)]">Auto-saved</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            <div>
              <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
                Rooms
              </span>
              <p className="font-display text-lg">{summary.totalRooms}</p>
            </div>
            <div>
              <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
                FF&E Items
              </span>
              <p className="font-display text-lg">{summary.totalFFEItems}</p>
            </div>
            <div>
              <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
                FF&E Budget
              </span>
              <p className="font-display text-lg">{formatDollars(summary.totalBudgetCents)}</p>
            </div>
            <div>
              <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
                Design Fees
              </span>
              <p className="font-display text-lg">{formatDollars(summary.totalDesignFeeCents)}</p>
            </div>
            <div>
              <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
                Phases
              </span>
              <p className="font-display text-lg">{summary.totalPhases}</p>
            </div>
            <div>
              <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
                Est. Duration
              </span>
              <p className="font-display text-lg">{summary.estimatedWeeks} wk</p>
            </div>
          </div>
        </div>
      )}

      {/* Section: Rooms */}
      <section className="mb-10">
        <div className="mb-4 border-b border-[var(--border-default)] pb-2">
          <h3 className="font-display text-lg font-medium">Rooms in Scope</h3>
        </div>
        <RoomsInScope proposalId={proposalId} />
      </section>

      {/* Divider */}
      <div className="my-8 flex flex-col gap-1.5">
        <div className="h-[1.5px] w-[60px] rounded bg-[var(--text-primary)]" />
        <div className="h-[1.5px] w-[48px] rounded bg-[var(--accent-primary)] opacity-70" />
        <div className="h-[1.5px] w-[36px] rounded bg-[var(--accent-primary)] opacity-35" />
      </div>

      {/* Section: FF&E */}
      <section className="mb-10">
        <div className="mb-1">
          <h3 className="font-display text-lg font-medium">Preliminary FF&E Schedule</h3>
        </div>
        <p className="type-body-small mb-4 text-[var(--text-muted)]">
          Items are either Fixed (specific product selected), Allowance (budget range, product TBD),
          or TBD (category only). Allowances show the client a budget with flexibility built in.
        </p>
        <FFEScheduleBuilder proposalId={proposalId} />
      </section>

      <div className="my-8 flex flex-col gap-1.5">
        <div className="h-[1.5px] w-[60px] rounded bg-[var(--text-primary)]" />
        <div className="h-[1.5px] w-[48px] rounded bg-[var(--accent-primary)] opacity-70" />
        <div className="h-[1.5px] w-[36px] rounded bg-[var(--accent-primary)] opacity-35" />
      </div>

      {/* Section: Phases */}
      <section className="mb-10">
        <div className="mb-1">
          <h3 className="font-display text-lg font-medium">Phase Structure & Fees</h3>
        </div>
        <p className="type-body-small mb-4 text-[var(--text-muted)]">
          Define which phases are included, fee per phase, deliverables, and revision limits.
          This becomes both the proposal timeline AND the project phase structure.
        </p>
        <PhaseBuilder proposalId={proposalId} />
      </section>

      <div className="my-8 flex flex-col gap-1.5">
        <div className="h-[1.5px] w-[60px] rounded bg-[var(--text-primary)]" />
        <div className="h-[1.5px] w-[48px] rounded bg-[var(--accent-primary)] opacity-70" />
        <div className="h-[1.5px] w-[36px] rounded bg-[var(--accent-primary)] opacity-35" />
      </div>

      {/* Section: Exclusions */}
      <section className="mb-10">
        <div className="mb-1">
          <h3 className="font-display text-lg font-medium">Exclusions & Boundaries</h3>
        </div>
        <p className="type-body-small mb-4 text-[var(--text-muted)]">
          What is explicitly NOT included. This is the scope creep firewall.
          Each exclusion appears in the proposal terms and in the project scope card.
        </p>
        <ExclusionsList proposalId={proposalId} />
      </section>

      <div className="my-8 flex flex-col gap-1.5">
        <div className="h-[1.5px] w-[60px] rounded bg-[var(--text-primary)]" />
        <div className="h-[1.5px] w-[48px] rounded bg-[var(--accent-primary)] opacity-70" />
        <div className="h-[1.5px] w-[36px] rounded bg-[var(--accent-primary)] opacity-35" />
      </div>

      {/* Section: Payment Milestones */}
      <section className="mb-10">
        <div className="mb-1">
          <h3 className="font-display text-lg font-medium">Payment Milestones</h3>
        </div>
        <p className="type-body-small mb-4 text-[var(--text-muted)]">
          Tied to phase gates. Invoices auto-generate when milestones are reached.
        </p>
        <PaymentMilestonesBuilder proposalId={proposalId} totalCents={totalProjectCents} />
      </section>

      <div className="my-8 flex flex-col gap-1.5">
        <div className="h-[1.5px] w-[60px] rounded bg-[var(--text-primary)]" />
        <div className="h-[1.5px] w-[48px] rounded bg-[var(--accent-primary)] opacity-70" />
        <div className="h-[1.5px] w-[36px] rounded bg-[var(--accent-primary)] opacity-35" />
      </div>

      {/* Section: Change Order Terms */}
      <section className="mb-10">
        <div className="mb-1">
          <h3 className="font-display text-lg font-medium">Change Order Process</h3>
        </div>
        <p className="type-body-small mb-4 text-[var(--text-muted)]">
          Defined upfront in the proposal terms. When a client requests scope changes, this is the process.
        </p>
        <ChangeOrderTermsEditor proposalId={proposalId} />
      </section>

      {/* Generate Proposal CTA */}
      <div className="flex gap-3 border-t border-[var(--border-default)] pt-6">
        <button
          onClick={onGenerateProposal}
          className="rounded-[3px] bg-[var(--accent-primary)] px-6 py-3 font-body text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          Generate Proposal from Scope →
        </button>
        <button className="type-btn-text rounded-[3px] border border-[var(--border-default)] px-5 py-3 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]">
          Save Scope as Draft
        </button>
      </div>
    </div>
  );
}
