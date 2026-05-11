'use client';

import { useState, useEffect } from 'react';
import { useScopeBuilderSummary, useProposal, useUpdateProposal } from '@patina/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { RoomsInScope } from './rooms-in-scope';
import { FFEScheduleBuilder } from './ffe-schedule-builder';
import { PaletteBuilder } from './palette-builder';
import { PhaseBuilder } from './phase-builder';
import { ExclusionsList } from './exclusions-list';
import { PaymentMilestonesBuilder } from './payment-milestones-builder';
import { ChangeOrderTermsEditor } from './change-order-terms-editor';

interface ScopeBuilderShellProps {
  proposalId: string;
  proposalTitle: string;
  onGenerateProposal: () => void;
}

type Tab = 'rooms' | 'ffe' | 'palette' | 'phases' | 'exclusions' | 'payments' | 'terms';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'rooms', label: 'Rooms' },
  { value: 'ffe', label: 'FF&E' },
  { value: 'palette', label: 'Palette' },
  { value: 'phases', label: 'Phases' },
  { value: 'exclusions', label: 'Exclusions' },
  { value: 'payments', label: 'Payments' },
  { value: 'terms', label: 'Terms' },
];

const VALID_TABS = new Set<Tab>(TABS.map((t) => t.value));

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
  proposalTitle: _proposalTitle,
  onGenerateProposal,
}: ScopeBuilderShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: Tab = tabParam && VALID_TABS.has(tabParam as Tab) ? (tabParam as Tab) : 'rooms';

  const { data: summary } = useScopeBuilderSummary(proposalId);
  const totalProjectCents = (summary?.totalBudgetCents || 0) + (summary?.totalDesignFeeCents || 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal } = useProposal(proposalId) as { data: any };
  const updateProposal = useUpdateProposal();
  const [addressDraft, setAddressDraft] = useState('');
  useEffect(() => {
    if (proposal?.project_address !== undefined && proposal?.project_address !== null) {
      setAddressDraft(proposal.project_address);
    }
  }, [proposal?.project_address]);
  const commitAddress = () => {
    const next = addressDraft.trim();
    if ((proposal?.project_address ?? '') === next) return;
    updateProposal.mutate({ proposalId, updates: { project_address: next || null } });
  };

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div>
      {/* Summary Card */}
      {summary && (
        <div className="mb-6 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="type-meta text-[var(--accent-primary)]">Scope Summary</span>
            <span className="font-mono text-xs text-[var(--text-muted)]">Auto-saved</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            <div>
              <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">Rooms</span>
              <p className="font-display text-lg">{summary.totalRooms}</p>
            </div>
            <div>
              <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">FF&E Items</span>
              <p className="font-display text-lg">{summary.totalFFEItems}</p>
            </div>
            <div>
              <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">FF&E Budget</span>
              <p className="font-display text-lg">{formatDollars(summary.totalBudgetCents)}</p>
            </div>
            <div>
              <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">Design Fees</span>
              <p className="font-display text-lg">{formatDollars(summary.totalDesignFeeCents)}</p>
            </div>
            <div>
              <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">Phases</span>
              <p className="font-display text-lg">{summary.totalPhases}</p>
            </div>
            <div>
              <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">Est. Duration</span>
              <p className="font-display text-lg">{summary.estimatedWeeks} wk</p>
            </div>
          </div>
        </div>
      )}

      {/* Project basics — site address (carries forward to project.site_address on activation) */}
      <div className="mb-6 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
        <label
          htmlFor="project-address"
          className="mb-2 block font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]"
        >
          Site Address
        </label>
        <input
          id="project-address"
          type="text"
          value={addressDraft}
          onChange={(e) => setAddressDraft(e.target.value)}
          onBlur={commitAddress}
          placeholder="123 Main St, City, ST 00000"
          className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
        />
        <p className="mt-2 type-body-small text-[var(--text-muted)]">
          Captured here so the activated project picks it up automatically.
        </p>
      </div>

      {/* Tab strip */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-[var(--border-default)]">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.value
                ? 'border-b-2 border-[var(--accent-primary)] text-[var(--accent-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-default)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'rooms' && (
        <section>
          <div className="mb-4">
            <h3 className="font-display text-lg font-medium">Rooms in Scope</h3>
          </div>
          <RoomsInScope proposalId={proposalId} />
        </section>
      )}

      {tab === 'ffe' && (
        <section>
          <div className="mb-1">
            <h3 className="font-display text-lg font-medium">Preliminary FF&E Schedule</h3>
          </div>
          <p className="type-body-small mb-4 text-[var(--text-muted)]">
            Items are either Fixed (specific product selected), Allowance (budget range, product TBD), or TBD
            (category only). Allowances show the client a budget with flexibility built in.
          </p>
          <FFEScheduleBuilder proposalId={proposalId} />
        </section>
      )}

      {tab === 'palette' && (
        <section>
          <div className="mb-1">
            <h3 className="font-display text-lg font-medium">Color Palette</h3>
          </div>
          <p className="type-body-small mb-4 text-[var(--text-muted)]">
            Capture colors three ways: extract from an inspiration image, search a brand catalog, or pick manually.
          </p>
          <PaletteBuilder proposalId={proposalId} />
        </section>
      )}

      {tab === 'phases' && (
        <section>
          <div className="mb-1">
            <h3 className="font-display text-lg font-medium">Phase Structure & Fees</h3>
          </div>
          <p className="type-body-small mb-4 text-[var(--text-muted)]">
            Define which phases are included, fee per phase, deliverables, and revision limits. This becomes both
            the proposal timeline AND the project phase structure.
          </p>
          <PhaseBuilder proposalId={proposalId} />
        </section>
      )}

      {tab === 'exclusions' && (
        <section>
          <div className="mb-1">
            <h3 className="font-display text-lg font-medium">Exclusions & Boundaries</h3>
          </div>
          <p className="type-body-small mb-4 text-[var(--text-muted)]">
            What is explicitly NOT included. This is the scope creep firewall. Each exclusion appears in the proposal
            terms and in the project scope card.
          </p>
          <ExclusionsList proposalId={proposalId} />
        </section>
      )}

      {tab === 'payments' && (
        <section>
          <div className="mb-1">
            <h3 className="font-display text-lg font-medium">Payment Milestones</h3>
          </div>
          <p className="type-body-small mb-4 text-[var(--text-muted)]">
            Tied to phase gates. Invoices auto-generate when milestones are reached.
          </p>
          <PaymentMilestonesBuilder proposalId={proposalId} totalCents={totalProjectCents} />
        </section>
      )}

      {tab === 'terms' && (
        <section>
          <div className="mb-1">
            <h3 className="font-display text-lg font-medium">Change Order Process</h3>
          </div>
          <p className="type-body-small mb-4 text-[var(--text-muted)]">
            Defined upfront in the proposal terms. When a client requests scope changes, this is the process.
          </p>
          <ChangeOrderTermsEditor proposalId={proposalId} />
        </section>
      )}

      {/* Generate Proposal CTA */}
      <div className="mt-10 flex gap-3 border-t border-[var(--border-default)] pt-6">
        <button
          onClick={onGenerateProposal}
          className="rounded-[3px] bg-[var(--accent-primary)] px-6 py-3 font-body text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          Generate Proposal from Scope →
        </button>
      </div>
    </div>
  );
}
