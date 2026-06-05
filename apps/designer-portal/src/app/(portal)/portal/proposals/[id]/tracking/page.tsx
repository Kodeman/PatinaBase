'use client';

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useProposal,
  useProposalEngagement,
  useProposalEngagementStats,
} from '@/hooks/use-proposals';
import { useSendProposal, useDuplicateProposal, useEnterRevision } from '@patina/supabase';
import { getProposalStatusDisplay } from '@/lib/proposal-status';
import { MetricsRow } from '@/components/portal/metrics-row';
import { Button, PageActionBar } from '@/components/portal';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { EngagementTimeline } from '@/components/portal/engagement-timeline';
import { SectionEngagement } from '@/components/portal/section-engagement';
import { InsightPanel } from '@/components/portal/insight-panel';
import { StrataMark } from '@/components/portal/strata-mark';

/** Map a proposal status to a PageActionBar badge tone. */
function proposalStatusToTone(
  status: string
): 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'accent' {
  switch (status) {
    case 'accepted':
      return 'success';
    case 'viewed':
      return 'warning';
    case 'sent':
      return 'info';
    case 'declined':
    case 'expired':
      return 'error';
    case 'revised':
      return 'accent';
    default:
      return 'neutral';
  }
}

function formatDaysRemaining(validUntil: string | null): string {
  if (!validUntil) return '';
  const remaining = Math.ceil(
    (new Date(validUntil).getTime() - Date.now()) / 86400000
  );
  if (remaining <= 0) return 'Expired';
  return `${remaining} day${remaining !== 1 ? 's' : ''} remaining`;
}

function formatMinutes(seconds: number): string {
  return `${Math.round(seconds / 60)}`;
}

function generateInsight(
  stats: { mostViewedSection: string | null; sectionBreakdown: Array<{ sectionType: string; totalSeconds: number; viewCount: number }> } | null,
  viewerName: string
): string {
  if (!stats || !stats.mostViewedSection) {
    return 'No engagement data yet. The client has not viewed the proposal.';
  }

  const top = stats.sectionBreakdown[0];
  if (!top) return '';

  const sectionLabel = top.sectionType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  if (top.viewCount >= 3) {
    return `${viewerName} has viewed the ${sectionLabel.toLowerCase()} ${top.viewCount} times and spent the most time there. They may want to discuss specific pieces or see alternates. Consider a follow-up message about the ${sectionLabel.toLowerCase()}.`;
  }

  if (top.totalSeconds > 120) {
    return `${viewerName} spent over ${Math.round(top.totalSeconds / 60)} minutes on the ${sectionLabel.toLowerCase()} section. This suggests strong interest \u2014 a good place to start a follow-up conversation.`;
  }

  return `${viewerName} has been reviewing your proposal. The ${sectionLabel.toLowerCase()} section received the most attention so far.`;
}

export default function ProposalTrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal, isLoading: proposalLoading } = useProposal(id) as { data: any; isLoading: boolean };
  const { data: events } = useProposalEngagement(id);
  const { data: stats } = useProposalEngagementStats(id);
  const sendProposal = useSendProposal();
  const duplicateProposal = useDuplicateProposal();
  const enterRevision = useEnterRevision();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [revising, setRevising] = useState(false);

  const metrics = useMemo(() => {
    if (!stats || !proposal) return [];

    const daysText = formatDaysRemaining(proposal.valid_until);

    return [
      {
        label: 'Times Opened',
        value: `${stats.timesOpened}`,
        subtitle: stats.lastOpenedAt
          ? `Last: ${new Date(stats.lastOpenedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : 'Not yet opened',
        trend: 'neutral' as const,
      },
      {
        label: 'Total Reading Time',
        value: formatMinutes(stats.totalReadingSeconds),
        subtitle: `across ${stats.timesOpened} session${stats.timesOpened !== 1 ? 's' : ''}`,
        trend: 'neutral' as const,
      },
      {
        label: 'Most Viewed',
        value: stats.mostViewedSection
          ? stats.mostViewedSection.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
          : '\u2014',
        subtitle: stats.sectionBreakdown[0]
          ? `${Math.floor(stats.sectionBreakdown[0].totalSeconds / 60)}:${(stats.sectionBreakdown[0].totalSeconds % 60).toString().padStart(2, '0')}`
          : '',
        trend: 'neutral' as const,
      },
      {
        label: 'Status',
        value: proposal.status === 'viewed' ? 'Awaiting Signature' : proposal.status.replace(/\b\w/g, (c: string) => c.toUpperCase()),
        subtitle: daysText,
        trend: (daysText.includes('Expired') ? 'down' : 'neutral') as 'up' | 'down' | 'neutral',
      },
    ];
  }, [stats, proposal]);

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || proposalLoading) return <LoadingStrata />;
  if (!proposal) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Proposal not found.
      </p>
    );
  }

  const viewerName = proposal.client?.full_name || 'The client';
  const total = ((proposal.total_amount || 0) / 100).toLocaleString();

  return (
    <div className="pt-8">
      <PageActionBar
        status={{
          tone: proposalStatusToTone(proposal.status),
          label: getProposalStatusDisplay(proposal.status).label,
        }}
        meta={
          <span className="type-label-secondary">
            {[
              proposal.client?.full_name,
              proposal.sent_at &&
                `Sent ${new Date(proposal.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
              `v${proposal.version || 1}.0`,
              `$${total}`,
              proposal.valid_until &&
                `Expires ${new Date(proposal.valid_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
            ]
              .filter(Boolean)
              .join(' \u00B7 ')}
          </span>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={revising}
              onClick={async () => {
                setRevising(true);
                try {
                  await enterRevision.mutateAsync({ proposalId: id });
                  router.push(`/portal/proposals/${id}/revise`);
                } catch {
                  setRevising(false);
                }
              }}
            >
              {revising ? 'Starting revision…' : 'Revise'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={resending || resent}
              onClick={async () => {
                setResending(true);
                try {
                  await sendProposal.mutateAsync({ proposalId: id });
                  setResent(true);
                  setTimeout(() => setResent(false), 3000);
                } finally {
                  setResending(false);
                }
              }}
            >
              {resending ? 'Resending…' : resent ? 'Resent ✓' : 'Resend'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={duplicating}
              onClick={async () => {
                setDuplicating(true);
                try {
                  const created = await duplicateProposal.mutateAsync(id);
                  router.push(`/portal/proposals/${(created as { id: string }).id}`);
                } catch {
                  setDuplicating(false);
                }
              }}
            >
              {duplicating ? 'Duplicating…' : 'Duplicate'}
            </Button>
          </>
        }
      />

      {/* Metrics */}
      {metrics.length > 0 && <MetricsRow metrics={metrics} />}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        {/* Left: Activity Timeline */}
        <div>
          <h3
            className="mb-4 border-b border-[var(--border-subtle)] pb-2"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              fontSize: '1.25rem',
              lineHeight: 1.35,
            }}
          >
            Activity Timeline
          </h3>
          <EngagementTimeline events={events || []} />
        </div>

        {/* Right: Section Engagement */}
        <div>
          <h3
            className="mb-4 border-b border-[var(--border-subtle)] pb-2"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              fontSize: '1.25rem',
              lineHeight: 1.35,
            }}
          >
            Section Engagement
          </h3>
          <SectionEngagement sections={stats?.sectionBreakdown || []} />

          <StrataMark variant="micro" />

          <InsightPanel>
            {generateInsight(stats || null, viewerName)}
          </InsightPanel>
        </div>
      </div>
    </div>
  );
}
