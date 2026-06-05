'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useClients, useClientStats } from '@patina/supabase';
import type { DesignerClient, ClientLifecycleStage } from '@patina/supabase';
import { SearchInput } from '@/components/portal/search-input';
import { FilterRow } from '@/components/portal/filter-row';
import { MetricsRow } from '@/components/portal/metrics-row';
import { ClientListItem } from '@/components/portal/client-list-item';
import { AddClientDialog } from '@/components/portal/add-client-dialog';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { ListPageHeader } from '@/components/portal/list-page-header';
import { PortalButton } from '@/components/portal/button';
// F1.6 — Designer Clients migrated to ambient + reactive help-system layers
// per spec §12.4. SectionIntro renders the inline `fallback` until Sanity
// content ships. EmptyState renders nothing on a clean CMS miss (spec §13.4
// graceful absence), so the page would go blank for first-time designers.
// To avoid that, we keep the local fallback copy in a small wrapper, same
// pattern as F1.2 Pipeline (see pipeline/page.tsx → PipelineEmptyState).
// Analytics events `help.section_intro.shown` and `help.empty_state.shown`
// fire automatically via window.posthog on first CMS hit.
import {
  EmptyState,
  SectionIntro,
  SurfaceKeys,
  useHelpContent,
} from '@patina/help-system';
import { Users, Search } from 'lucide-react';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

function formatCurrency(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}k`;
}

// ─── Empty-state fallback wiring (F1.6) ───────────────────────────────────────
//
// `EmptyState` returns null on a CMS miss without error, which would leave the
// list silently blank during Sprint 2 while Sanity is still being authored.
// To avoid the silent-blank pitfall, probe `useHelpContent` first — if it
// misses, render local fallback copy; if it hits, defer to the CMS-backed
// EmptyState wrapper which handles icon/heading/description/CTA. Same pattern
// as F1.2 Pipeline (PipelineEmptyState).

interface ClientsEmptyCopy {
  surfaceKey: string;
  icon: React.ReactNode;
  fallbackHeading: string;
  fallbackDescription: string;
}

function ClientsEmptyState({ copy }: { copy: ClientsEmptyCopy }) {
  // Cheap CMS probe — react-query dedupes with the fetch inside <EmptyState>,
  // so this is not an extra network call.
  const { data, isLoading } = useHelpContent(copy.surfaceKey, 'emptyState');

  if (isLoading) {
    return (
      <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
        …
      </p>
    );
  }

  if (data) {
    // CMS hit — let the canonical wrapper own the layout.
    return <EmptyState surfaceKey={copy.surfaceKey} icon={copy.icon} />;
  }

  // CMS miss (Sprint 2 default) — render the local fallback so first-time
  // designers see helpful copy instead of a blank page.
  return (
    <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
      {copy.fallbackHeading}
    </p>
  );
}

const stageFilters: { key: string; label: string }[] = [
  { key: 'all', label: 'All Clients' },
  { key: 'lead', label: 'Leads' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'nurture', label: 'Nurture' },
];

function ClientDirectoryContent() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Auto-open the Add Client dialog when ?add=1 is present (e.g. from sub-nav action)
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setAddDialogOpen(true);
    }
  }, [searchParams]);

  const filters = stageFilter !== 'all' ? { status: stageFilter } : undefined;
  const { data: rawClients, isLoading } = useClients(filters);
  const { data: stats } = useClientStats();
  const clients = (Array.isArray(rawClients) ? rawClients : []) as DesignerClient[];

  // Client-side search filter
  const filtered = search
    ? clients.filter((c) => {
        const name = c.client?.full_name || c.client_name || '';
        const email = c.client?.email || c.client_email || '';
        const q = search.toLowerCase();
        return name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
      })
    : clients;

  // Build filter options with counts
  const filterOptions = stageFilters.map((f) => ({
    ...f,
    count:
      f.key === 'all'
        ? stats?.total
        : stats?.[f.key as keyof typeof stats] as number | undefined,
  }));

  // Build metrics
  const metrics = stats
    ? [
        {
          label: 'Active Clients',
          value: String(stats.active),
          subtitle: `$${Math.round(stats.activeProjectValue / 100).toLocaleString()} in active projects`,
          trend: 'neutral' as const,
        },
        {
          label: 'Lifetime Revenue',
          value: `$${Math.round(stats.totalRevenue / 100).toLocaleString()}`,
          subtitle: `across ${stats.totalProjects} completed projects`,
          trend: 'up' as const,
        },
        {
          label: 'Avg. Satisfaction',
          value: stats.avgSatisfaction > 0 ? stats.avgSatisfaction.toFixed(1) : '\u2014',
          subtitle: stats.reviewCount > 0 ? `from ${stats.reviewCount} reviews` : 'no reviews yet',
          trend: 'up' as const,
        },
        {
          label: 'Referral Rate',
          value: `${stats.referralRate}%`,
          trend: 'up' as const,
        },
      ]
    : [];

  return (
    <div className="pt-8">
      <ListPageHeader
        title="Clients"
        subtitle={
          /* CMS-authored section intro, with inline fallback until Sanity ships */
          <SectionIntro
            surfaceKey={SurfaceKeys.DesignerPortal.Clients.ListIntro}
            fallback="Your active and past clients."
            className="max-w-prose"
          />
        }
        actions={
          <PortalButton variant="secondary" onClick={() => setAddDialogOpen(true)}>
            + Add Client
          </PortalButton>
        }
      />

      {/* Search */}
      <div className="mb-4" style={{ maxWidth: '360px' }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search clients…"
        />
      </div>

      {/* Filter tabs */}
      <FilterRow
        options={filterOptions}
        active={stageFilter}
        onChange={setStageFilter}
      />

      {/* Metrics */}
      {metrics.length > 0 && <MetricsRow metrics={metrics} />}

      {/* Inline add form */}
      <AddClientDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} />

      {/* Client list */}
      {isLoading ? (
        <LoadingStrata />
      ) : filtered.length > 0 ? (
        <div>
          {filtered.map((client) => {
            const name =
              client.client?.full_name ||
              client.client_name ||
              client.client_email ||
              'Unknown Client';
            const stage = (client.status || 'active') as ClientLifecycleStage;

            return (
              <ClientListItem
                key={client.id}
                id={client.id}
                name={name}
                initials={getInitials(name)}
                projectDescription={client.notes?.split('\n')[0]?.slice(0, 50) || undefined}
                location={client.location || undefined}
                stage={stage}
                stageDetail={
                  stage === 'active'
                    ? `${client.total_projects || 0} active project${(client.total_projects || 0) !== 1 ? 's' : ''}`
                    : stage === 'nurture' && client.last_contacted_at
                      ? `Last contact: ${new Date(client.last_contacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                      : undefined
                }
                financialValue={
                  client.total_revenue > 0
                    ? formatCurrency(client.total_revenue)
                    : undefined
                }
                financialLabel={
                  stage === 'active'
                    ? 'Project value'
                    : stage === 'completed' || stage === 'nurture'
                      ? 'Lifetime value'
                      : stage === 'proposal'
                        ? 'Proposal value'
                        : stage === 'lead'
                          ? 'Budget range'
                          : undefined
                }
              />
            );
          })}
        </div>
      ) : (
        // Two distinct empty-state surfaces — different copy for "no clients
        // yet at all" vs. "your search returned nothing." Per spec §6.2 these
        // are tracked as separate surface keys so authors can iterate
        // independently in Sanity.
        <ClientsEmptyState
          copy={
            search
              ? {
                  surfaceKey:
                    SurfaceKeys.DesignerPortal.Clients.Empty.NoSearchResults,
                  icon: <Search className="h-12 w-12" />,
                  fallbackHeading: 'No clients match your search.',
                  fallbackDescription:
                    'Try a different name or email, or clear the search to see everyone.',
                }
              : {
                  surfaceKey:
                    SurfaceKeys.DesignerPortal.Clients.Empty.NoClients,
                  icon: <Users className="h-12 w-12" />,
                  fallbackHeading: 'No clients yet.',
                  fallbackDescription:
                    'Add your first client to start tracking the relationship.',
                }
          }
        />
      )}

    </div>
  );
}

export default function ClientDirectoryPage() {
  return (
    <Suspense fallback={<LoadingStrata />}>
      <ClientDirectoryContent />
    </Suspense>
  );
}
