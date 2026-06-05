'use client';

import { use, useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  useProposal,
  useProposalSections,
  useUpsertProposalSection,
  useUpdateProposal,
} from '@/hooks/use-proposals';
import {
  useProposalPaymentMilestones,
  useProposalScopeRooms,
  useProposalExclusions,
} from '@patina/supabase';
import type {
  ProposalPaymentMilestone,
  ProposalScopeRoom,
  ProposalExclusion,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { proposalEvents } from '@/lib/analytics';
import { StrataMark } from '@/components/portal/strata-mark';
import { Button, PageActionBar } from '@/components/portal';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { ProposalLetterhead } from '@/components/portal/proposal-letterhead';
import { ProposalSectionEditor } from '@/components/portal/proposal-section-editor';
import { ClientPicker } from '@/components/portal/client-picker';

export default function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  const { session } = useAuth();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal, isLoading: proposalLoading } = useProposal(id) as { data: any; isLoading: boolean };
  const { data: sections, isLoading: sectionsLoading } = useProposalSections(id);
  const { data: paymentMilestones } = useProposalPaymentMilestones(id) as { data: ProposalPaymentMilestone[] | undefined };
  const { data: scopeRooms } = useProposalScopeRooms(id) as { data: ProposalScopeRoom[] | undefined };
  const { data: exclusions } = useProposalExclusions(id) as { data: ProposalExclusion[] | undefined };
  const upsertSection = useUpsertProposalSection();
  const updateProposal = useUpdateProposal();

  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Status-based routing: redirect non-draft proposals to appropriate views
  useEffect(() => {
    if (!proposal || proposalLoading) return;

    switch (proposal.status) {
      case 'sent':
      case 'viewed':
        router.replace(`/portal/proposals/${id}/tracking`);
        break;
      case 'accepted':
        router.replace(`/portal/proposals/${id}/signed`);
        break;
      case 'revised':
        router.replace(`/portal/proposals/${id}/revise`);
        break;
      case 'declined':
      case 'expired':
        // Show read-only preview for terminal states
        router.replace(`/portal/proposals/${id}/preview`);
        break;
      // 'draft' stays on editor (default)
    }
  }, [proposal, proposalLoading, id, router]);

  // Track save times
  useEffect(() => {
    if (upsertSection.isSuccess || updateProposal.isSuccess) {
      setLastSaved(new Date());
    }
  }, [upsertSection.isSuccess, updateProposal.isSuccess]);

  const handleSectionUpdate = useCallback(
    (sectionId: string, updates: { title?: string; body?: string; metadata?: Record<string, unknown> }) => {
      const section = sections?.find((s) => s.id === sectionId);
      if (!section) return;

      upsertSection.mutate(
        {
          id: sectionId,
          proposalId: id,
          type: section.type,
          title: updates.title ?? section.title,
          body: updates.body ?? section.body ?? undefined,
          metadata: updates.metadata ?? section.metadata,
        },
        {
          onSuccess: () => {
            proposalEvents.sectionSaved({
              proposalId: id,
              sectionType: section.type,
              bodyLength: (updates.body ?? section.body ?? '').length,
            });
          },
        }
      );
    },
    [id, sections, upsertSection]
  );

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || proposalLoading || sectionsLoading) return <LoadingStrata />;

  if (!proposal) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Proposal not found.
      </p>
    );
  }

  const designerName = session?.user?.name || null;

  // Format last saved time
  const savedText = lastSaved
    ? `Auto-saved ${Math.round((Date.now() - lastSaved.getTime()) / 60000)} min ago`
    : 'Not yet saved';

  return (
    <div className="pt-8">
      {/* ── Editor Action Bar ── */}
      <PageActionBar
        status={{ tone: 'success', dot: true, label: savedText }}
        meta={
          <>
            <span className="type-meta-small">&middot;</span>
            <span className="type-meta-small">v{proposal.version || 1}.0</span>
            <span className="type-meta-small">&middot;</span>
            {/* The picker chip IS the client display: it shows the linked
                client (or "Link a client…") and opens the combobox on click.
                Radix handles click-outside + Escape; selecting a client fires
                the mutation and closes. */}
            <span className="inline-flex w-[220px]">
              <ClientPicker
                value={proposal.client_id ?? null}
                onChange={(clientId) => {
                  updateProposal.mutate({
                    proposalId: id,
                    updates: { client_id: clientId },
                  });
                }}
                placeholder="Link a client…"
                inlineChip
              />
            </span>
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/portal/proposals/${id}/scope`)}
            >
              Scope Builder
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                // Preview opens a read-only view
                window.open(`/portal/proposals/${id}/preview`, '_blank');
              }}
            >
              Preview as Client
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push(`/portal/proposals/${id}/send`)}
            >
              Send to Client
            </Button>
          </>
        }
      />

      {/* ── Proposal Document ── */}
      <div
        className="mx-auto rounded-lg bg-white shadow-sm"
        style={{
          maxWidth: 760,
          padding: 'clamp(1.5rem, 3vw, 2.5rem)',
          boxShadow: '0 1px 3px rgba(44,41,38,0.04), 0 8px 32px rgba(44,41,38,0.05)',
        }}
      >
        {/* Letterhead */}
        <ProposalLetterhead
          clientName={proposal.client?.full_name || null}
          date={proposal.created_at}
        />

        {/* Sections */}
        {sections && sections.length > 0 ? (
          sections.map((section, index) => (
            <div key={section.id}>
              {index > 0 && <StrataMark variant="micro" />}
              <ProposalSectionEditor
                section={section}
                onUpdate={(updates) => handleSectionUpdate(section.id, updates)}
                proposalId={id}
                proposalItems={proposal.items}
                totalAmount={proposal.total_amount || 0}
                paymentMilestones={paymentMilestones}
                scopeRooms={scopeRooms}
                exclusions={exclusions}
                clientName={proposal.client?.full_name}
                designerName={designerName}
              />
            </div>
          ))
        ) : (
          <div className="py-16 text-center">
            <p className="type-body italic text-[var(--text-muted)]">
              This proposal has no sections yet.
            </p>
            <p className="type-label-secondary mt-2">
              Go back and create this proposal from a template to get started.
            </p>
          </div>
        )}

        {/* Document footer */}
        {sections && sections.length > 0 && (
          <div className="mt-12 flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-6">
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                fontSize: '0.65rem',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              Patina
            </div>
            <span className="type-meta-small">
              {proposal.title} &middot; Proposal v{proposal.version || 1}.0
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
