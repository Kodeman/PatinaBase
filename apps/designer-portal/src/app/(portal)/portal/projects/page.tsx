'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useProjects, useProjectListMetrics } from '@/hooks/use-projects';
import { FilterRow } from '@/components/portal/filter-row';
import { MetricsRow } from '@/components/portal/metrics-row';
import { PhaseDot } from '@/components/portal/phase-dot';
import { ProgressBar } from '@/components/portal/progress-bar';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { EmptyState } from '@/components/portal/empty-state';
import { PHASE_CONFIG, type ProjectPhase } from '@/types/project-ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProject = any;

function formatPhase(phase: string): string {
  return phase
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatBudgetCompact(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(dollars >= 10000 ? 0 : 1)}k`;
  return `$${dollars.toLocaleString()}`;
}

function formatBudget(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const STATUS_FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'proposal_sent', label: 'Proposal Sent' },
  { key: 'completed', label: 'Completed' },
  { key: 'on_hold', label: 'On Hold' },
];

function getStatusKey(status: string): string {
  switch (status) {
    case 'active':
    case 'planning':
      return 'active';
    case 'proposal_sent':
      return 'proposal_sent';
    case 'completed':
      return 'completed';
    case 'on-hold':
    case 'on_hold':
      return 'on_hold';
    default:
      return 'active';
  }
}

export default function ProjectsPage() {
  const { data: rawProjects, isLoading } = useProjects();
  const { data: metrics } = useProjectListMetrics();
  const projects = (Array.isArray(rawProjects) ? rawProjects : []) as AnyProject[];
  const [activeFilter, setActiveFilter] = useState('active');

  // Compute tab counts
  const filterOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach((p: AnyProject) => {
      const key = getStatusKey(p.status);
      counts[key] = (counts[key] || 0) + 1;
    });
    return STATUS_FILTERS.map((f) => ({
      ...f,
      count: counts[f.key] || 0,
    })).filter((f) => f.count > 0);
  }, [projects]);

  // Filtered projects
  const filtered = useMemo(() => {
    return projects.filter((p: AnyProject) => getStatusKey(p.status) === activeFilter);
  }, [projects, activeFilter]);

  // Metrics row data
  const metricsData = useMemo(() => {
    if (!metrics) return [];
    return [
      {
        label: 'Active Value',
        value: formatBudgetCompact(metrics.activeValue),
        subtitle: `across ${metrics.activeCount} projects`,
        trend: 'neutral' as const,
      },
      {
        label: 'Avg Timeline',
        value: `${metrics.avgTimeline}`,
        subtitle: 'months',
        trend: 'up' as const,
      },
      {
        label: 'Invoiced',
        value: formatBudgetCompact(metrics.invoicedMTD),
        subtitle: 'total invoiced',
        trend: 'up' as const,
      },
    ];
  }, [metrics]);

  if (isLoading) return <LoadingStrata />;

  if (projects.length === 0) {
    return (
      <div className="pt-8">
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="type-section-head">Projects</h1>
          <Link
            href="/portal/projects/new"
            className="type-btn-text rounded-[3px] bg-[var(--text-primary)] px-3 py-1.5 text-[0.8rem] text-[var(--bg-primary)] no-underline"
          >
            + New Project
          </Link>
        </div>
        <EmptyState
          title="No projects yet"
          description="Projects will appear here as you accept leads and begin working with clients."
        />
      </div>
    );
  }

  return (
    <div className="pt-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="type-section-head" style={{ fontSize: '1.5rem' }}>
          Projects
        </h1>
        <Link
          href="/portal/projects/new"
          className="type-btn-text rounded-[3px] bg-[var(--text-primary)] px-3 py-1.5 text-[0.8rem] text-[var(--bg-primary)] no-underline"
        >
          + New Project
        </Link>
      </div>

      {/* Tab filters */}
      <FilterRow options={filterOptions} active={activeFilter} onChange={setActiveFilter} />

      {/* Metrics */}
      {metricsData.length > 0 && <MetricsRow metrics={metricsData} />}

      {/* Project list */}
      {filtered.length === 0 ? (
        <p className="type-body py-8 text-center italic text-[var(--text-muted)]">
          No projects in this category.
        </p>
      ) : (
        filtered.map((project: AnyProject) => {
          const phase = (project.current_phase || 'consultation') as ProjectPhase;
          return (
            <Link
              key={project.id}
              href={`/portal/projects/${project.id}`}
              className="grid cursor-pointer gap-4 border-b py-4 no-underline transition-colors hover:bg-[var(--bg-hover)]"
              style={{
                gridTemplateColumns: '1fr auto',
                borderColor: 'rgba(229, 226, 221, 0.6)',
              }}
            >
              <div>
                <div className="mb-0.5 flex items-center gap-2">
                  <PhaseDot phase={phase} size="sm" />
                  <span className="font-body text-[0.95rem] font-medium text-[var(--text-primary)]">
                    {project.name}
                  </span>
                </div>
                <div className="type-label-secondary text-[0.82rem]">
                  {project.client_name}
                  {project.client_location ? ` · ${project.client_location}` : ''}
                  {project.startDate ? ` · Started ${formatDate(project.startDate)}` : ''}
                </div>
                <div className="mt-2 max-w-[300px] lg:max-w-[500px]">
                  <ProgressBar progress={project.progress ?? 0} />
                </div>
              </div>
              <div className="text-right">
                <div className="type-meta-small mb-1" style={{ textTransform: 'uppercase' }}>
                  {formatPhase(phase)}
                </div>
                <div className="font-heading text-[1rem] font-semibold text-[var(--text-primary)]">
                  {formatBudget(project.budget)}
                </div>
              </div>
            </Link>
          );
        })
      )}
    </div>
  );
}
