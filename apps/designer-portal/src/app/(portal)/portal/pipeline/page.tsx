'use client';

import { useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLeads, useProposals, useProjects } from '@patina/supabase';
import { LoadingStrata } from '@/components/portal/loading-strata';

type PipelineStage = 'leads' | 'proposals' | 'active' | 'completed';

interface PipelineItem {
  id: string;
  stage: PipelineStage;
  title: string;
  clientName: string;
  value?: number;
  lastActivity: string;
  href: string;
}

const STAGE_COLORS: Record<PipelineStage, string> = {
  leads: 'var(--color-dusty-blue, #8B9CAD)',
  proposals: 'var(--color-golden-hour, #E8C547)',
  active: 'var(--color-clay, #C4A57B)',
  completed: 'var(--color-sage, #A8B5A0)',
};

const STAGE_LABELS: Record<PipelineStage, string> = {
  leads: 'Lead',
  proposals: 'Proposal',
  active: 'Active',
  completed: 'Completed',
};

function formatValue(cents?: number): string {
  if (!cents) return '';
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(dollars >= 10000 ? 0 : 1)}k`;
  return `$${dollars.toLocaleString()}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function PipelineContent() {
  const searchParams = useSearchParams();
  const stageFilter = searchParams.get('stage') as PipelineStage | null;

  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { data: proposals, isLoading: proposalsLoading } = useProposals();
  const { data: projects, isLoading: projectsLoading } = useProjects();

  const isLoading = leadsLoading || proposalsLoading || projectsLoading;

  // Build unified pipeline items
  const items = useMemo((): PipelineItem[] => {
    const result: PipelineItem[] = [];

    // Leads
    if (leads && (!stageFilter || stageFilter === 'leads')) {
      for (const lead of leads) {
        result.push({
          id: `lead-${lead.id}`,
          stage: 'leads',
          title: lead.project_type || 'New Lead',
          clientName: lead.homeowner?.full_name || 'Unknown',
          value: undefined,
          lastActivity: lead.created_at,
          href: `/portal/leads/${lead.id}`,
        });
      }
    }

    // Proposals
    if (proposals && (!stageFilter || stageFilter === 'proposals')) {
      for (const proposal of proposals) {
        result.push({
          id: `proposal-${proposal.id}`,
          stage: 'proposals',
          title: proposal.title || 'Untitled Proposal',
          clientName: proposal.client?.full_name || 'Unknown',
          value: proposal.total_amount ? proposal.total_amount : undefined,
          lastActivity: proposal.updated_at || proposal.created_at,
          href: `/portal/proposals/${proposal.id}`,
        });
      }
    }

    // Projects
    if (projects) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const project of projects as any[]) {
        const stage: PipelineStage = project.status === 'completed' ? 'completed' : 'active';
        if (stageFilter && stageFilter !== stage) continue;

        result.push({
          id: `project-${project.id}`,
          stage,
          title: project.name || 'Untitled Project',
          clientName: project.client?.full_name || 'Unknown',
          value: project.budget ? project.budget : undefined,
          lastActivity: project.updated_at || project.created_at,
          href: `/portal/projects/${project.id}`,
        });
      }
    }

    // Sort by last activity, most recent first
    result.sort(
      (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );

    return result;
  }, [leads, proposals, projects, stageFilter]);

  if (isLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-6">
        {stageFilter ? STAGE_LABELS[stageFilter] : 'Pipeline'}
      </h1>

      {items.length === 0 ? (
        <div className="rounded-lg border border-[var(--border-default)] px-6 py-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            {stageFilter
              ? `No ${STAGE_LABELS[stageFilter].toLowerCase()} items`
              : 'No pipeline items yet'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center gap-4 rounded-md border border-transparent px-4 py-3 no-underline transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-surface)]"
            >
              {/* Stage dot */}
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: STAGE_COLORS[item.stage] }}
              />

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[0.85rem] font-medium text-[var(--text-primary)]">
                    {item.title}
                  </span>
                  <span className="font-mono text-[0.55rem] uppercase tracking-wider text-[var(--text-muted)]">
                    {STAGE_LABELS[item.stage]}
                  </span>
                </div>
                <div className="text-[0.75rem] text-[var(--text-muted)]">
                  {item.clientName}
                </div>
              </div>

              {/* Value */}
              {item.value && (
                <span className="flex-shrink-0 text-[0.78rem] font-medium text-[var(--text-primary)]">
                  {formatValue(item.value)}
                </span>
              )}

              {/* Date */}
              <span className="flex-shrink-0 font-mono text-[0.6rem] text-[var(--text-muted)]">
                {formatDate(item.lastActivity)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<LoadingStrata />}>
      <PipelineContent />
    </Suspense>
  );
}
