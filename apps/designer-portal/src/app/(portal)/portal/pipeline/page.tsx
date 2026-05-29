'use client';

import { useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLeads, useProposals } from '@patina/supabase';
import { useProjects } from '@/hooks/use-projects';
import {
  EmptyState,
  SectionIntro,
  SurfaceKeys,
  useHelpContent,
} from '@patina/help-system';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { formatProjectType } from '@/lib/lead-format';

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

// ─── Help-system surface-key + fallback wiring per pipeline stage ─────────────
//
// The 4 stage-scoped empty-state keys are the spec-mandated variants
// (per packages/help-system/src/surfaceKeys.ts → Pipeline.ProjectListEmpty).
// The unfiltered key covers the all-stages-empty case so a first-time designer
// arriving at /portal/pipeline never sees a silent blank list.
//
// `fallback` strings are placeholder copy rendered until Sanity content lands.
// Once the CMS is populated the EmptyState wrapper takes over and the local
// fallback is no longer shown.

interface StageEmptyCopy {
  surfaceKey: string;
  fallbackHeading: string;
  fallbackDescription: string;
}

const STAGE_EMPTY_COPY: Record<PipelineStage, StageEmptyCopy> = {
  leads: {
    surfaceKey: SurfaceKeys.DesignerPortal.Pipeline.ProjectListEmpty.Leads,
    fallbackHeading: 'No leads in your pipeline',
    fallbackDescription:
      'New leads come in from the consumer app. They will land here when a homeowner reaches out.',
  },
  proposals: {
    surfaceKey: SurfaceKeys.DesignerPortal.Pipeline.ProjectListEmpty.Proposals,
    fallbackHeading: 'No proposals in flight',
    fallbackDescription:
      'Convert a lead into a proposal to start shaping the engagement.',
  },
  active: {
    surfaceKey: SurfaceKeys.DesignerPortal.Pipeline.ProjectListEmpty.Active,
    fallbackHeading: 'No active projects',
    fallbackDescription:
      'Once a proposal is signed, the project moves here so you can track its progress.',
  },
  completed: {
    surfaceKey: SurfaceKeys.DesignerPortal.Pipeline.ProjectListEmpty.Completed,
    fallbackHeading: 'No completed projects yet',
    fallbackDescription:
      'Finished projects archive here. Use them as references when scoping new work.',
  },
};

const UNFILTERED_EMPTY_COPY: StageEmptyCopy = {
  surfaceKey: SurfaceKeys.DesignerPortal.Pipeline.ProjectListEmpty.Unfiltered,
  fallbackHeading: 'Your pipeline is empty',
  fallbackDescription:
    'Leads, proposals, active projects, and completed work all surface here as you build your practice.',
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

/**
 * Renders a CMS-backed `<EmptyState>` if Sanity has content for the surface key,
 * otherwise renders a local fallback so the surface is never literally blank
 * during Sprint 1 (Sanity content is still being authored — see spec §13.4
 * "Graceful Sanity downtime").
 *
 * Why not just `<EmptyState>` alone? The Layer-1 EmptyState wrapper returns
 * null on a CMS miss without a hard fetch error, which is the right behavior
 * for an established surface but leaves first-time designers staring at an
 * empty pipeline border. Probing `useHelpContent` here lets us swap between
 * CMS-backed and local copy without ever double-rendering both, while keeping
 * the analytics / icon resolution / styling that EmptyState owns.
 */
function PipelineEmptyState({
  copy,
}: {
  copy: StageEmptyCopy;
}) {
  // Cheap CMS probe — react-query dedupes this with the fetch inside <EmptyState>,
  // so there is no extra network call.
  const { data, isLoading } = useHelpContent(copy.surfaceKey, 'emptyState');

  if (isLoading) {
    // Mirror the loading skeleton used elsewhere on the page; keep the surface
    // shape so layout does not jump.
    return (
      <div className="rounded-lg border border-[var(--border-default)] px-6 py-12 text-center">
        <p className="text-sm text-[var(--text-muted)]">…</p>
      </div>
    );
  }

  // CMS hit — defer to the canonical wrapper for icon/heading/description/cta.
  if (data) {
    return (
      <div className="rounded-lg border border-[var(--border-default)]">
        <EmptyState surfaceKey={copy.surfaceKey} />
      </div>
    );
  }

  // CMS miss (Sprint 1 default) — render the local fallback copy so the surface
  // is informative even before Sanity is populated.
  return (
    <div className="rounded-lg border border-[var(--border-default)] px-6 py-12 text-center">
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {copy.fallbackHeading}
      </p>
      <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
        {copy.fallbackDescription}
      </p>
    </div>
  );
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
        const leadTitle = formatProjectType(lead.project_type) || 'New Lead';
        result.push({
          id: `lead-${lead.id}`,
          stage: 'leads',
          title: leadTitle,
          clientName:
            lead.homeowner?.full_name ||
            lead.contact_name ||
            [lead.location_city, lead.location_state].filter(Boolean).join(', ') ||
            leadTitle,
          value: undefined,
          lastActivity: lead.created_at,
          href: `/portal/leads/${lead.id}`,
        });
      }
    }

    // Proposals
    if (proposals && (!stageFilter || stageFilter === 'proposals')) {
      for (const proposal of proposals) {
        const proposalTitle = proposal.title || 'Untitled Proposal';
        result.push({
          id: `proposal-${proposal.id}`,
          stage: 'proposals',
          title: proposalTitle,
          clientName: proposal.client?.full_name || proposal.project?.name || proposalTitle,
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

        const projectTitle = project.name || 'Untitled Project';
        const budgetCents = project.total_amount_cents ?? project.budget_cents ?? 0;
        result.push({
          id: `project-${project.id}`,
          stage,
          title: projectTitle,
          clientName: project.client?.full_name || project.client_name || projectTitle,
          value: budgetCents || undefined,
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

  // Pick the surface-key + fallback for the active empty-state variant.
  // Mapping (per surfaceKeys.ts):
  //   stageFilter='leads'      → Pipeline.ProjectListEmpty.Leads
  //   stageFilter='proposals'  → Pipeline.ProjectListEmpty.Proposals
  //   stageFilter='active'     → Pipeline.ProjectListEmpty.Active
  //   stageFilter='completed'  → Pipeline.ProjectListEmpty.Completed
  //   stageFilter=null         → Pipeline.ProjectListEmpty.Unfiltered
  const emptyCopy: StageEmptyCopy = stageFilter
    ? STAGE_EMPTY_COPY[stageFilter]
    : UNFILTERED_EMPTY_COPY;

  return (
    <div className="pt-8">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="type-section-head">
          {stageFilter ? STAGE_LABELS[stageFilter] : 'Pipeline'}
        </h1>
        {/* Cross-stage quick-create. Each stage also has its own create
            control on its dedicated page; these are conveniences from the
            unified overview. "+ Add Lead" opens the inline dialog via ?add=1. */}
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/portal/leads?add=1"
            className="text-[0.78rem] text-[var(--accent-primary)] no-underline hover:text-[var(--text-primary)]"
          >
            + Add Lead
          </Link>
          <Link
            href="/portal/proposals/new"
            className="text-[0.78rem] text-[var(--accent-primary)] no-underline hover:text-[var(--text-primary)]"
          >
            + New Proposal
          </Link>
          <Link
            href="/portal/projects/new"
            className="text-[0.78rem] text-[var(--accent-primary)] no-underline hover:text-[var(--text-primary)]"
          >
            + New Project
          </Link>
        </div>
      </div>
      <SectionIntro
        surfaceKey={SurfaceKeys.DesignerPortal.Pipeline.ProjectList}
        fallback="Track every project from first inquiry to handoff in one chronological view."
        className="mb-6 max-w-prose"
      />

      {items.length === 0 ? (
        <PipelineEmptyState copy={emptyCopy} />
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
