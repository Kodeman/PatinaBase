'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useProjects, useProjectListMetrics, useUpdateProject } from '@/hooks/use-projects';
import { FilterRow } from '@/components/portal/filter-row';
import { MetricsRow } from '@/components/portal/metrics-row';
import { ProgressBar } from '@/components/portal/progress-bar';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { EmptyState } from '@/components/portal/empty-state';
import { SearchInput } from '@/components/portal/search-input';
import { StatusDot } from '@/components/portal/status-dot';
import { ViewToggle, type ViewMode } from '@/components/portal/view-toggle';
import {
  FacetedFilterPopover,
  type Facet,
  type FacetSelections,
} from '@/components/portal/faceted-filter-popover';
import { BulkActionBar, BulkActionButton } from '@/components/portal/bulk-action-bar';
import { getProjectStatusVariant } from '@/lib/project-status';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProject = any;

const VIEW_STORAGE_KEY = 'patina:projects:view';

// ── Helpers (normalize across Supabase + mock shapes) ────────────────────────

const projectName = (p: AnyProject): string => p.name || 'Untitled';
const projectBudgetCents = (p: AnyProject): number =>
  p.total_amount_cents ?? p.budget_cents ?? p.budget ?? 0;
const projectProgress = (p: AnyProject): number => p.progress ?? 0;
const projectClientName = (p: AnyProject): string =>
  p.client_name || p.client?.full_name || '';
const projectAddress = (p: AnyProject): string =>
  p.site_address || p.client_location || p.address || '';
const projectPhase = (p: AnyProject): string => p.current_phase || 'consultation';
const projectDesignerName = (p: AnyProject): string =>
  p.designer?.full_name || p.designer_name || '';
const projectUpdatedAt = (p: AnyProject): string =>
  p.updated_at || p.updatedAt || p.created_at || '';

function formatPhase(phase: string): string {
  return phase.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatBudgetCompact(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(dollars >= 10000 ? 0 : 1)}k`;
  return `$${dollars.toLocaleString()}`;
}

function formatBudget(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatRelativeDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Status filter tabs ───────────────────────────────────────────────────────

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

// ── Sort ─────────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'client' | 'phase' | 'progress' | 'budget' | 'updated';
type SortDir = 'asc' | 'desc';

function sortProjects(rows: AnyProject[], key: SortKey, dir: SortDir): AnyProject[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    let av: string | number = '';
    let bv: string | number = '';
    switch (key) {
      case 'name': av = projectName(a).toLowerCase(); bv = projectName(b).toLowerCase(); break;
      case 'client': av = projectClientName(a).toLowerCase(); bv = projectClientName(b).toLowerCase(); break;
      case 'phase': av = projectPhase(a); bv = projectPhase(b); break;
      case 'progress': av = projectProgress(a); bv = projectProgress(b); break;
      case 'budget': av = projectBudgetCents(a); bv = projectBudgetCents(b); break;
      case 'updated': av = projectUpdatedAt(a); bv = projectUpdatedAt(b); break;
    }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  return copy;
}

// ── Sortable header cell ─────────────────────────────────────────────────────

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = 'left',
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`type-meta flex items-center gap-1 text-[0.62rem] uppercase tracking-wider ${
        align === 'right' ? 'justify-end' : 'justify-start'
      } ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'} hover:text-[var(--text-primary)]`}
      style={{ background: 'transparent', border: 0 }}
    >
      {label}
      <span className="text-[0.55rem]">
        {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { data: rawProjects, isLoading } = useProjects();
  const { data: metrics } = useProjectListMetrics();
  const updateProject = useUpdateProject();
  const projects = (Array.isArray(rawProjects) ? rawProjects : []) as AnyProject[];

  const [activeFilter, setActiveFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filters, setFilters] = useState<FacetSelections>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Hydrate view mode from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === 'list' || stored === 'grid') setView(stored);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  // Tab counts
  const filterOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach((p) => {
      const key = getStatusKey(p.status);
      counts[key] = (counts[key] || 0) + 1;
    });
    return STATUS_FILTERS.map((f) => ({ ...f, count: counts[f.key] || 0 }))
      .filter((f) => f.count > 0);
  }, [projects]);

  // Available facet options (computed from data)
  const facets = useMemo<Facet[]>(() => {
    const designers = new Map<string, string>();
    const clients = new Map<string, string>();
    for (const p of projects) {
      const dName = projectDesignerName(p);
      const dId = p.designer_id || dName;
      if (dName) designers.set(dId, dName);
      const cName = projectClientName(p);
      const cId = p.client_id || cName;
      if (cName) clients.set(cId, cName);
    }
    return [
      {
        key: 'designer',
        label: 'Lead designer',
        options: Array.from(designers.entries()).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'client',
        label: 'Client',
        options: Array.from(clients.entries()).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'budget',
        label: 'Budget',
        options: [
          { value: '0-500', label: '<$500k' },
          { value: '500-1000', label: '$500k–$1M' },
          { value: '1000-5000', label: '$1M–$5M' },
          { value: '5000+', label: '$5M+' },
        ],
      },
      {
        key: 'health',
        label: 'On-track status',
        options: [
          { value: 'sage', label: 'On track' },
          { value: 'gold', label: 'Deadline approaching' },
          { value: 'terracotta', label: 'At risk' },
          { value: 'pearl', label: 'Future / on hold' },
        ],
      },
    ];
  }, [projects]);

  // Filtered + sorted rows
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return sortProjects(
      projects.filter((p) => {
        if (getStatusKey(p.status) !== activeFilter) return false;
        if (q) {
          const haystack = [projectName(p), projectClientName(p), projectAddress(p)]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        const desigSel = filters.designer ?? [];
        if (desigSel.length > 0) {
          const id = p.designer_id || projectDesignerName(p);
          if (!desigSel.includes(id)) return false;
        }
        const clientSel = filters.client ?? [];
        if (clientSel.length > 0) {
          const id = p.client_id || projectClientName(p);
          if (!clientSel.includes(id)) return false;
        }
        const budgetSel = filters.budget ?? [];
        if (budgetSel.length > 0) {
          const dollars = projectBudgetCents(p) / 100;
          const matches = budgetSel.some((bucket) => {
            switch (bucket) {
              case '0-500': return dollars < 500_000;
              case '500-1000': return dollars >= 500_000 && dollars < 1_000_000;
              case '1000-5000': return dollars >= 1_000_000 && dollars < 5_000_000;
              case '5000+': return dollars >= 5_000_000;
              default: return false;
            }
          });
          if (!matches) return false;
        }
        const healthSel = filters.health ?? [];
        if (healthSel.length > 0) {
          if (!healthSel.includes(getProjectStatusVariant(p))) return false;
        }
        return true;
      }),
      sortKey,
      sortDir
    );
  }, [projects, activeFilter, search, sortKey, sortDir, filters]);

  // Reset selection when filters/tabs change
  useEffect(() => {
    setSelected(new Set());
  }, [activeFilter, search, filters]);

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

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'client' ? 'asc' : 'desc');
    }
  };

  const bulkArchive = async () => {
    const ids = Array.from(selected);
    await Promise.all(
      ids.map((id) => updateProject.mutateAsync({ id, data: { status: 'on_hold' } }))
    );
    setSelected(new Set());
  };

  // Loading + empty states
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
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
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

      {/* Toolbar: search, filters, view toggle */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search projects by name, client, or address"
        />
        <div className="flex items-center gap-2">
          <FacetedFilterPopover facets={facets} value={filters} onChange={setFilters} />
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {/* Metrics */}
      {metricsData.length > 0 && <MetricsRow metrics={metricsData} />}

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="type-body py-8 text-center italic text-[var(--text-muted)]">
          {search || Object.values(filters).some((v) => v.length > 0)
            ? 'No projects match the current filters.'
            : 'No projects in this category.'}
        </p>
      ) : view === 'grid' ? (
        <GridView projects={filtered} selected={selected} onToggleSelect={toggleSelect} />
      ) : (
        <ListView
          projects={filtered}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          allSelected={selected.size === filtered.length}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
        />
      )}

      {/* Bulk action bar */}
      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkActionButton onClick={bulkArchive}>Move to On Hold</BulkActionButton>
        <BulkActionButton onClick={() => alert('Change lead designer — coming soon')}>
          Change Lead
        </BulkActionButton>
        <BulkActionButton onClick={() => alert('Export financials — coming soon')}>
          Export Financials
        </BulkActionButton>
        <BulkActionButton onClick={() => alert('Combined report — coming soon')}>
          Combined Report
        </BulkActionButton>
      </BulkActionBar>
    </div>
  );
}

// ── List view (sortable table) ───────────────────────────────────────────────

function ListView({
  projects,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  allSelected,
  sortKey,
  sortDir,
  onSort,
}: {
  projects: AnyProject[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  allSelected: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  return (
    <div role="table">
      {/* Header row */}
      <div
        role="row"
        className="grid items-center gap-3 border-b py-2"
        style={{
          gridTemplateColumns: '24px 2fr 1.4fr 1fr 1.4fr 1fr 0.8fr',
          borderColor: 'rgba(229, 226, 221, 0.6)',
        }}
      >
        <input
          type="checkbox"
          checked={allSelected && projects.length > 0}
          onChange={onToggleSelectAll}
          aria-label="Select all"
        />
        <SortHeader label="Project" active={sortKey === 'name'} dir={sortDir} onClick={() => onSort('name')} />
        <SortHeader label="Client" active={sortKey === 'client'} dir={sortDir} onClick={() => onSort('client')} />
        <SortHeader label="Phase" active={sortKey === 'phase'} dir={sortDir} onClick={() => onSort('phase')} />
        <SortHeader label="Progress" active={sortKey === 'progress'} dir={sortDir} onClick={() => onSort('progress')} />
        <SortHeader label="Budget" align="right" active={sortKey === 'budget'} dir={sortDir} onClick={() => onSort('budget')} />
        <SortHeader label="Updated" align="right" active={sortKey === 'updated'} dir={sortDir} onClick={() => onSort('updated')} />
      </div>

      {/* Rows */}
      {projects.map((project) => {
        const isSelected = selected.has(project.id);
        const variant = getProjectStatusVariant(project);
        return (
          <div
            key={project.id}
            role="row"
            className="grid items-center gap-3 border-b py-3 transition-colors hover:bg-[var(--bg-hover)]"
            style={{
              gridTemplateColumns: '24px 2fr 1.4fr 1fr 1.4fr 1fr 0.8fr',
              borderColor: 'rgba(229, 226, 221, 0.6)',
              background: isSelected ? 'rgba(168, 181, 160, 0.06)' : undefined,
            }}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(project.id)}
              aria-label={`Select ${projectName(project)}`}
            />
            <Link
              href={`/portal/projects/${project.id}`}
              className="flex items-center gap-2 no-underline"
            >
              <StatusDot variant={variant} size="sm" />
              <span className="font-body text-[0.92rem] font-medium text-[var(--text-primary)]">
                {projectName(project)}
              </span>
            </Link>
            <span className="type-label-secondary text-[0.82rem]">
              {projectClientName(project)}
            </span>
            <span className="type-meta-small uppercase tracking-wider">
              {formatPhase(projectPhase(project))}
            </span>
            <ProgressBar progress={projectProgress(project)} />
            <span className="text-right font-heading text-[0.95rem] font-semibold text-[var(--text-primary)]">
              {formatBudget(projectBudgetCents(project))}
            </span>
            <span className="text-right type-meta-small text-[var(--text-muted)]">
              {formatRelativeDate(projectUpdatedAt(project))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Grid view (cards) ────────────────────────────────────────────────────────

function GridView({
  projects,
  selected,
  onToggleSelect,
}: {
  projects: AnyProject[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => {
        const isSelected = selected.has(project.id);
        const variant = getProjectStatusVariant(project);
        return (
          <div
            key={project.id}
            className="group relative rounded-md border bg-[var(--bg-surface)] p-4 transition-all hover:shadow-sm"
            style={{
              borderColor: isSelected ? 'var(--text-primary)' : 'var(--border-default)',
              transitionDuration: 'var(--duration-fast)',
            }}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(project.id)}
              className="absolute right-3 top-3 z-10"
              aria-label={`Select ${projectName(project)}`}
              onClick={(e) => e.stopPropagation()}
            />
            <Link href={`/portal/projects/${project.id}`} className="block no-underline">
              <div className="mb-3 flex items-start justify-between gap-2 pr-6">
                <div className="flex min-w-0 items-baseline gap-2">
                  <StatusDot variant={variant} size="sm" />
                  <span className="truncate font-body text-[0.95rem] font-medium text-[var(--text-primary)]">
                    {projectName(project)}
                  </span>
                </div>
              </div>
              <div className="type-label-secondary mb-2 text-[0.78rem]">
                {projectClientName(project)}
              </div>
              <div className="type-meta-small mb-3 uppercase tracking-wider">
                {formatPhase(projectPhase(project))}
              </div>
              <ProgressBar progress={projectProgress(project)} />
              <div className="mt-3 flex items-baseline justify-between">
                <span className="font-heading text-[1.05rem] font-semibold text-[var(--text-primary)]">
                  {formatBudget(projectBudgetCents(project))}
                </span>
                <span className="type-meta-small text-[var(--text-muted)]">
                  {formatRelativeDate(projectUpdatedAt(project))}
                </span>
              </div>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
