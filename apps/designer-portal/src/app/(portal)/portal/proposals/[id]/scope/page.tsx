'use client';

import { use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useProposal, useProposalSections, useUpsertProposalSection } from '@/hooks/use-proposals';
import {
  useProposalScopeRooms,
  useProposalPhases,
  useProposalExclusions,
  useProposalPaymentMilestones,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { PageContainer } from '@/components/portal/page-container';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { ScopeBuilderShell } from '@/components/portal/scope-builder/scope-builder-shell';

export default function ScopeBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { session } = useAuth();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal, isLoading } = useProposal(id) as { data: any; isLoading: boolean };
  const { data: rooms } = useProposalScopeRooms(id);
  const { data: phases } = useProposalPhases(id);
  const { data: exclusions } = useProposalExclusions(id);
  const { data: milestones } = useProposalPaymentMilestones(id);
  const { data: sections } = useProposalSections(id);
  const upsertSection = useUpsertProposalSection();

  const handleGenerateProposal = useCallback(async () => {
    if (!proposal || !rooms || !phases) return;

    // Map scope data into proposal sections
    // Vision section — kept as-is if exists, or create placeholder
    const hasVision = sections?.some((s) => s.type === 'vision');
    if (!hasVision) {
      await upsertSection.mutateAsync({
        proposalId: id,
        type: 'vision',
        title: 'Design Vision',
        body: `*Your vision statement for ${proposal.title} goes here.*\n\nDescribe the design direction, inspiration, and desired outcome.`,
      });
    }

    // Concept section
    const hasConcept = sections?.some((s) => s.type === 'concept');
    if (!hasConcept) {
      await upsertSection.mutateAsync({
        proposalId: id,
        type: 'concept',
        title: 'Concept Direction',
        body: 'Describe the concept approach, mood boards, and material palette.',
      });
    }

    // Space plan section with room data
    const hasSpacePlan = sections?.some((s) => s.type === 'space_plan');
    if (!hasSpacePlan) {
      const roomSummary = rooms
        .map(
          (r: { name: string; dimensions: string | null; ffe_categories: string[] }) =>
            `**${r.name}**${r.dimensions ? ` (${r.dimensions})` : ''} — ${r.ffe_categories?.length || 0} FF&E categories`
        )
        .join('\n\n');

      await upsertSection.mutateAsync({
        proposalId: id,
        type: 'space_plan',
        title: 'Rooms in Scope',
        body: roomSummary || 'No rooms defined yet.',
        metadata: {
          rooms: rooms.map((r: { id: string; name: string; budget_cents: number }) => ({
            id: r.id,
            name: r.name,
            budgetCents: r.budget_cents,
          })),
        },
      });
    }

    // Selections section
    const hasSelections = sections?.some((s) => s.type === 'selections');
    if (!hasSelections) {
      await upsertSection.mutateAsync({
        proposalId: id,
        type: 'selections',
        title: 'Product Selections & Allowances',
        body: 'Detailed FF&E selections, allowances, and TBD items are specified in the scope builder and will appear here.',
      });
    }

    // Investment section with phase fees and FF&E budget
    const hasInvestment = sections?.some((s) => s.type === 'investment');
    if (!hasInvestment) {
      const totalFees = phases.reduce(
        (sum: number, p: { fee_cents: number }) => sum + (p.fee_cents || 0),
        0
      );
      const totalFFE = rooms.reduce(
        (sum: number, r: { budget_cents: number }) => sum + (r.budget_cents || 0),
        0
      );

      await upsertSection.mutateAsync({
        proposalId: id,
        type: 'investment',
        title: 'Your Investment',
        body: `Design fees and FF&E budget are structured across ${phases.length} phases and ${rooms.length} rooms.`,
        metadata: {
          designFeeCents: totalFees,
          ffeBudgetCents: totalFFE,
          totalCents: totalFees + totalFFE,
          payment_schedule: milestones?.map(
            (m: { label: string; percentage: number; amount_cents: number }) => ({
              label: m.label,
              percent: m.percentage,
              description: `$${(m.amount_cents / 100).toLocaleString()}`,
            })
          ),
        },
      });
    }

    // Timeline section
    const hasTimeline = sections?.some((s) => s.type === 'timeline');
    if (!hasTimeline) {
      await upsertSection.mutateAsync({
        proposalId: id,
        type: 'timeline',
        title: 'Project Timeline',
        body: 'Phase timeline and milestone schedule.',
        metadata: {
          phases: phases.map(
            (p: { name: string; duration_weeks: number | null; gate_condition: string | null }) => ({
              name: p.name,
              date_range: `${p.duration_weeks || 0} weeks`,
            })
          ),
        },
      });
    }

    // Terms section with exclusions
    const hasTerms = sections?.some((s) => s.type === 'terms');
    if (!hasTerms) {
      const exclusionText = exclusions
        ?.map((e: { description: string }) => `- ${e.description}`)
        .join('\n');

      await upsertSection.mutateAsync({
        proposalId: id,
        type: 'terms',
        title: 'Terms & Conditions',
        body: `## What Is Not Included\n\n${exclusionText || 'No exclusions defined.'}\n\n## Revision Policy\n\nRevision limits are defined per phase in the timeline above. Additional revisions beyond the limit are billed at the hourly rate specified in the change order terms.`,
        metadata: {
          exclusions: exclusions?.map(
            (e: { description: string; category: string | null }) => ({
              description: e.description,
              category: e.category,
            })
          ),
        },
      });
    }

    // Navigate to the proposal editor
    router.push(`/portal/proposals/${id}`);
  }, [proposal, rooms, phases, exclusions, milestones, sections, id, router, upsertSection]);

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingStrata />
        </div>
      </PageContainer>
    );
  }

  if (!proposal) {
    return (
      <PageContainer>
        <p className="type-body-small py-20 text-center text-[var(--text-muted)]">
          Proposal not found.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: 'Proposals', href: '/portal/proposals' },
          { label: proposal.title || 'Untitled', href: `/portal/proposals/${id}` },
          { label: 'Scope Builder' },
        ]}
      />

      {/* Edit mode bar */}
      <div className="mb-6 flex items-center justify-between rounded-md bg-[rgba(196,165,123,0.06)] px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-primary)]" />
          <span className="font-mono text-[0.55rem] uppercase tracking-widest text-[var(--accent-primary)]">
            Scope Builder
          </span>
        </div>
        <span className="font-mono text-[0.55rem] uppercase tracking-widest text-green-600">
          ● Auto-saved
        </span>
      </div>

      <h2 className="mb-1 font-display text-2xl">Define Project Scope</h2>
      <p className="type-body-small mb-8 text-[var(--text-muted)]">
        Build the scope first, write the proposal second. Everything here becomes structured data
        in the proposal AND the project.
      </p>

      <ScopeBuilderShell
        proposalId={id}
        proposalTitle={proposal.title || 'Untitled'}
        onGenerateProposal={handleGenerateProposal}
      />
    </PageContainer>
  );
}
