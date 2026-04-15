'use client';

import { useState, useEffect } from 'react';
import {
  Search,
  MoreVertical,
  Eye,
  UserPlus,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  EmptyState,
  LoadingStrata,
  StatusDot,
} from '@/components/portal';
import { useWaitlistEntries, useWaitlistStats } from '@/hooks/use-waitlist';
import { ConvertToUserDialog } from '@/components/waitlist/ConvertToUserDialog';
import { WaitlistDetailDialog } from '@/components/waitlist/WaitlistDetailDialog';
import type { WaitlistEntry } from '@/services/waitlist';

export default function WaitlistPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <LoadingStrata />;

  return <WaitlistPageContent />;
}

function WaitlistPageContent() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const { data: statsData } = useWaitlistStats();
  const { data, isLoading, isError, error } = useWaitlistEntries({
    search: search || undefined,
    status: statusFilter !== 'all' ? (statusFilter as 'pending' | 'converted') : undefined,
    role: roleFilter !== 'all' ? roleFilter : undefined,
    page,
    pageSize: 20,
  });

  const entries = data?.data || [];
  const meta = data?.meta;

  const handleAction = (entry: WaitlistEntry, action: 'convert' | 'detail') => {
    setSelectedEntry(entry);
    if (action === 'convert') setConvertDialogOpen(true);
    else setDetailDialogOpen(true);
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const conversionRate =
    statsData && statsData.total > 0
      ? Math.round((statsData.converted / statsData.total) * 100)
      : 0;

  return (
    <div>
      <PageHeader
        title="Waitlist"
        description="Manage waitlist signups and convert them to Patina users."
      />

      {statsData && (
        <MetricsRow>
          <MetricBlock label="Total Signups" value={statsData.total} />
          <MetricBlock label="Designers" value={statsData.byRole['designer'] || 0} />
          <MetricBlock label="Consumers" value={statsData.byRole['consumer'] || 0} />
          <MetricBlock
            label="Converted"
            value={statsData.converted}
            change={`${conversionRate}%`}
            trend="up"
          />
        </MetricsRow>
      )}

      <Section className="mt-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              placeholder="Search by email..."
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={roleFilter}
            onValueChange={(v) => {
              setRoleFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="designer">Designer</SelectItem>
              <SelectItem value="consumer">Consumer</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <LoadingStrata />
        ) : isError ? (
          <EmptyState
            label="Error"
            message={error instanceof Error ? error.message : 'Failed to load waitlist.'}
          />
        ) : entries.length === 0 ? (
          <EmptyState message="No waitlist entries found." />
        ) : (
          <div>
            {entries.map((entry) => {
              const isConverted = !!entry.convertedAt;
              return (
                <div
                  key={entry.id}
                  className="group flex items-center justify-between border-b border-[var(--border-subtle)] py-5 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(196,165,123,0.12)] text-[var(--accent-primary)]">
                      <span className="type-label text-[0.7rem]">
                        {entry.email.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <button
                        onClick={() => handleAction(entry, 'detail')}
                        className="type-item-name text-left hover:text-[var(--accent-primary)]"
                      >
                        {entry.email}
                      </button>
                      <div className="type-label-secondary mt-0.5">
                        Signed up {formatDate(entry.createdAt)}
                        {entry.utmCampaign && <span className="ml-2">via {entry.utmCampaign}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline">{entry.role}</Badge>
                    <Badge variant="secondary">{entry.source}</Badge>
                    <StatusDot
                      variant={isConverted ? 'success' : 'warning'}
                      label={isConverted ? 'Converted' : 'Pending'}
                    />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleAction(entry, 'detail')}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        {!isConverted && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleAction(entry, 'convert')}>
                              <ArrowRight className="mr-2 h-4 w-4" />
                              Convert to User
                            </DropdownMenuItem>
                          </>
                        )}
                        {isConverted && entry.authUserId && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <a href={`/users/${entry.authUserId}`}>
                                <UserPlus className="mr-2 h-4 w-4" />
                                View User Profile
                              </a>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
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

      <ConvertToUserDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        entry={selectedEntry}
      />
      <WaitlistDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        entry={selectedEntry}
      />
    </div>
  );
}
