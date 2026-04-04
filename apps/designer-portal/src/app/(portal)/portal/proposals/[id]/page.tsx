'use client';

import { use, useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  useProposal,
  useProposalSections,
  useUpsertProposalSection,
  useUpdateProposal,
} from '@/hooks/use-proposals';
import { useAuth } from '@/hooks/use-auth';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { StrataMark } from '@/components/portal/strata-mark';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { ProposalLetterhead } from '@/components/portal/proposal-letterhead';
import { ProposalSectionEditor } from '@/components/portal/proposal-section-editor';

export default function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { session } = useAuth();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal, isLoading: proposalLoading } = useProposal(id) as { data: any; isLoading: boolean };
  const { data: sections, isLoading: sectionsLoading } = useProposalSections(id);
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

      upsertSection.mutate({
        id: sectionId,
        proposalId: id,
        type: section.type,
        title: updates.title ?? section.title,
        body: updates.body ?? section.body ?? undefined,
        metadata: updates.metadata ?? section.metadata,
      });
    },
    [id, sections, upsertSection]
  );

  if (proposalLoading || sectionsLoading) return <LoadingStrata />;

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
      <Breadcrumb
        items={[
          { label: 'Proposals', href: '/portal/proposals' },
          { label: proposal.title },
        ]}
      />

      {/* ── Editor Toolbar ── */}
      <div className="mb-6 flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.55rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-sage)',
            }}
          >
            {'\u25CF'} {savedText}
          </span>
          <span className="type-meta-small">&middot;</span>
          <span className="type-meta-small">v{proposal.version || 1}.0</span>
        </div>
        <div className="flex gap-2">
          <PortalButton
            variant="ghost"
            onClick={() => router.push(`/portal/proposals/${id}/scope`)}
          >
            Scope Builder
          </PortalButton>
          <PortalButton
            variant="secondary"
            onClick={() => {
              // Preview opens a read-only view
              window.open(`/portal/proposals/${id}/preview`, '_blank');
            }}
          >
            Preview as Client
          </PortalButton>
          <PortalButton
            variant="primary"
            onClick={() => router.push(`/portal/proposals/${id}/send`)}
            className="!bg-[var(--accent-primary)]"
          >
            Send to Client
          </PortalButton>
        </div>
      </div>

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
                proposalItems={proposal.items}
                totalAmount={proposal.total_amount || 0}
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
