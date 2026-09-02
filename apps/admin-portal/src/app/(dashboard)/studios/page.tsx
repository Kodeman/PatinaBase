'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Plus, Filter, MoreVertical, Eye, Pause, Play, Ban, Building2 } from 'lucide-react';
import {
  PageHeader,
  Section,
  EmptyState as PortalEmptyState,
  LoadingStrata,
  StatusDot,
  DataTable,
  type Column,
  type StatusVariant,
} from '@/components/portal';
import { useStudios } from '@/hooks/use-studios';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatDate } from '@/lib/utils';
import { CreateStudioDialog } from '@/components/studios/CreateStudioDialog';
import { StudioStatusDialog, type StudioStatusAction } from '@/components/studios/StudioStatusDialog';
import type { Studio } from '@/types';
import { EmptyState, SectionIntro, SurfaceKeys, useHelpContent } from '@patina/help-system';

export default function StudiosPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <LoadingStrata />;

  return <StudiosPageContent />;
}

interface StudiosEmptyStateProps {
  isFiltered: boolean;
}

function StudiosEmptyState({ isFiltered }: StudiosEmptyStateProps) {
  const surfaceKey = isFiltered
    ? SurfaceKeys.AdminPortal.Studios.Empty.NoFilterResults
    : SurfaceKeys.AdminPortal.Studios.Empty.NoStudios;
  const fallback = isFiltered
    ? 'No studios match these filters. Adjust your search or status filter.'
    : 'No studios yet. Use Create Studio to provision one for an existing user.';

  const { data, isLoading } = useHelpContent(surfaceKey, 'emptyState');

  if (isLoading) {
    return <p className="type-body py-16 text-center italic text-[var(--text-muted)]">…</p>;
  }

  if (data) {
    return (
      <EmptyState
        surfaceKey={surfaceKey}
        icon={<Building2 className="h-8 w-8 text-[var(--text-muted)]" strokeWidth={1.5} />}
      />
    );
  }

  return <p className="type-body py-16 text-center text-[var(--text-muted)]">{fallback}</p>;
}

function statusVariantFor(status: string): StatusVariant {
  switch (status) {
    case 'active':
      return 'success';
    case 'suspended':
      return 'warning';
    case 'deactivated':
      return 'error';
    default:
      return 'neutral';
  }
}

function StudiosPageContent() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [statusDialog, setStatusDialog] = useState<{ studio: Studio; action: StudioStatusAction } | null>(
    null,
  );

  const debouncedQuery = useDebouncedValue(query, 300);

  // Any filter change invalidates the current page number — page 3 of the old
  // result set is meaningless against the new one.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, statusFilter, tierFilter]);

  const { data, isLoading, isError, error } = useStudios({
    query: debouncedQuery || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    tier: tierFilter !== 'all' ? tierFilter : undefined,
    page,
    pageSize: 20,
  });

  const studios = data?.data ?? [];
  const meta = data?.meta;

  const columns: Column<Studio>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (studio) => (
        <div>
          <div className="type-item-name">{studio.name}</div>
          <div className="type-label-secondary mt-0.5">{studio.slug}</div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (studio) => studio.owner?.email ?? '—',
    },
    {
      key: 'members',
      header: 'Members',
      render: (studio) => `${studio.memberCount}${studio.invitedCount ? ` (+${studio.invitedCount} invited)` : ''}`,
    },
    { key: 'projects', header: 'Projects', render: (studio) => studio.projectCount },
    {
      key: 'tier',
      header: 'Tier',
      render: (studio) => <Badge variant="outline">{studio.subscriptionTier}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (studio) => <StatusDot variant={statusVariantFor(studio.status)} label={studio.status} />,
    },
    { key: 'createdAt', header: 'Created', render: (studio) => formatDate(studio.createdAt) },
    {
      key: 'actions',
      header: '',
      render: (studio) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => router.push(`/studios/${studio.id}` as any)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            {studio.status === 'active' && (
              <DropdownMenuItem onClick={() => setStatusDialog({ studio, action: 'suspend' })}>
                <Pause className="mr-2 h-4 w-4" />
                Suspend
              </DropdownMenuItem>
            )}
            {studio.status === 'suspended' && (
              <DropdownMenuItem onClick={() => setStatusDialog({ studio, action: 'reactivate' })}>
                <Play className="mr-2 h-4 w-4" />
                Reactivate
              </DropdownMenuItem>
            )}
            {studio.status !== 'deactivated' && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setStatusDialog({ studio, action: 'deactivate' })}
              >
                <Ban className="mr-2 h-4 w-4" />
                Deactivate
              </DropdownMenuItem>
            )}
            {studio.status === 'deactivated' && (
              <DropdownMenuItem onClick={() => setStatusDialog({ studio, action: 'reactivate' })}>
                <Play className="mr-2 h-4 w-4" />
                Reactivate
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Studios"
        description="Manage design studios, rosters, and subscription tiers."
        actions={
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Studio
          </Button>
        }
      />

      <SectionIntro
        surfaceKey={SurfaceKeys.AdminPortal.Studios.ListIntro}
        fallback="All design studios. Suspend, reactivate, or deactivate from the row menu."
        className="-mt-4 mb-6 max-w-prose"
      />

      <Section className="mt-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              placeholder="Search studios by name, slug, or owner email..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="pending_approval">Pending Approval</SelectItem>
              <SelectItem value="deactivated">Deactivated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <LoadingStrata />
        ) : isError ? (
          <PortalEmptyState
            label="Error"
            message={error instanceof Error ? error.message : 'Failed to load studios.'}
          />
        ) : studios.length === 0 ? (
          <StudiosEmptyState
            isFiltered={
              Boolean(debouncedQuery.trim()) || statusFilter !== 'all' || tierFilter !== 'all'
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={studios}
            getKey={(studio) => studio.id}
            onRowHref={(studio) => `/studios/${studio.id}`}
          />
        )}

        {meta && meta.total > meta.pageSize && (
          <div className="mt-6 flex items-center justify-between border-t border-[var(--border-default)] pt-4">
            <div className="type-meta-small">
              Showing {(meta.page - 1) * meta.pageSize + 1} to{' '}
              {Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * meta.pageSize >= meta.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Section>

      <CreateStudioDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      {statusDialog && (
        <StudioStatusDialog
          studioId={statusDialog.studio.id}
          studioName={statusDialog.studio.name}
          action={statusDialog.action}
          open={!!statusDialog}
          onOpenChange={(open) => !open && setStatusDialog(null)}
        />
      )}
    </div>
  );
}
