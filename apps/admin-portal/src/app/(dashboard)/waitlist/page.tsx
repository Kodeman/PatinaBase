'use client';

import { useState, useEffect } from 'react';
import {
  Search,
  MoreVertical,
  Eye,
  ArrowRight,
  Filter,
  UserPlus,
  AlertCircle,
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
} from '@/components/portal';
import { useWaitlistEntries, useWaitlistStats } from '@/hooks/use-waitlist';
import { ConvertToUserDialog } from '@/components/waitlist/ConvertToUserDialog';
import { WaitlistDetailPanel } from '@/components/waitlist/WaitlistDetailPanel';
import type {
  QualificationStage,
  WaitlistEntry,
} from '@/services/waitlist';

const STAGE_FILTERS: { value: QualificationStage | 'all'; label: string }[] = [
  { value: 'all', label: 'All stages' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'nurture', label: 'Nurture' },
  { value: 'converted', label: 'Converted' },
  { value: 'disqualified', label: 'Disqualified' },
];

const STAGE_BADGE: Record<QualificationStage, { label: string; className: string }> = {
  new: {
    label: 'New',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  },
  contacted: {
    label: 'Contacted',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  },
  qualified: {
    label: 'Qualified',
    className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  },
  nurture: {
    label: 'Nurture',
    className: 'bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200',
  },
  converted: {
    label: 'Converted',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  },
  disqualified: {
    label: 'Disqualified',
    className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  },
};

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
  const [stageFilter, setStageFilter] = useState<QualificationStage | 'all'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  const { data: statsData } = useWaitlistStats();
  const { data, isLoading, isError, error } = useWaitlistEntries({
    search: search || undefined,
    stage: stageFilter !== 'all' ? stageFilter : undefined,
    role: roleFilter !== 'all' ? roleFilter : undefined,
    assignedTo: assignedToMe ? 'me' : undefined,
    hasOverdueFollowUp: overdueOnly || undefined,
    page,
    pageSize: 20,
  });

  const entries = data?.data || [];
  const meta = data?.meta;

  const openDetail = (entry: WaitlistEntry) => {
    setSelectedEntry(entry);
    setDetailPanelOpen(true);
  };

  const openConvert = (entry: WaitlistEntry) => {
    setSelectedEntry(entry);
    setConvertDialogOpen(true);
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const formatFollowUp = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const overdue = d < now;
    const text = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { text, overdue };
  };

  const conversionRate =
    statsData && statsData.total > 0
      ? Math.round((statsData.converted / statsData.total) * 100)
      : 0;

  return (
    <div>
      <PageHeader
        title="Waitlist"
        description="Track prospects from patina.cloud and qualify them into Patina users."
      />

      {statsData && (
        <MetricsRow>
          <MetricBlock label="Total signups" value={statsData.total} />
          <MetricBlock label="New" value={statsData.byStage?.new ?? 0} />
          <MetricBlock label="Qualified" value={statsData.byStage?.qualified ?? 0} />
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
          <div className="relative min-w-[240px] flex-1">
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
            value={stageFilter}
            onValueChange={(v) => {
              setStageFilter(v as QualificationStage | 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGE_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
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
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="designer">Designer</SelectItem>
              <SelectItem value="consumer">Client</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={assignedToMe ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setAssignedToMe((v) => !v);
              setPage(1);
            }}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Mine
          </Button>
          <Button
            variant={overdueOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setOverdueOnly((v) => !v);
              setPage(1);
            }}
          >
            <AlertCircle className="mr-2 h-4 w-4" />
            Overdue
            {statsData?.overdueFollowUps ? (
              <Badge variant="secondary" className="ml-2">
                {statsData.overdueFollowUps}
              </Badge>
            ) : null}
          </Button>
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
              const stageMeta = STAGE_BADGE[entry.qualificationStage] ?? STAGE_BADGE.new;
              const followUp = entry.nextFollowUpAt ? formatFollowUp(entry.nextFollowUpAt) : null;
              const displayName = entry.fullName || entry.email;
              return (
                <div
                  key={entry.id}
                  className="group flex items-center justify-between border-b border-[var(--border-subtle)] py-5 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <button
                    onClick={() => openDetail(entry)}
                    className="flex flex-1 items-center gap-4 text-left"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(196,165,123,0.12)] text-[var(--accent-primary)]">
                      <span className="type-label text-[0.7rem]">
                        {entry.email.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="type-item-name truncate hover:text-[var(--accent-primary)]">
                        {displayName}
                      </div>
                      <div className="type-label-secondary mt-0.5 truncate">
                        {entry.fullName ? entry.email + ' · ' : ''}
                        Signed up {formatDate(entry.createdAt)}
                        {entry.companyName && <span className="ml-2">· {entry.companyName}</span>}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-3">
                    {followUp && (
                      <span
                        className={`type-label-secondary text-xs ${followUp.overdue ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground'}`}
                        title="Next follow-up"
                      >
                        {followUp.overdue ? 'Overdue · ' : 'Follow-up · '}
                        {followUp.text}
                      </span>
                    )}
                    <Badge variant="outline">{entry.role}</Badge>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${stageMeta.className}`}
                    >
                      {stageMeta.label}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDetail(entry)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Open
                        </DropdownMenuItem>
                        {!entry.convertedAt && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openConvert(entry)}>
                              <ArrowRight className="mr-2 h-4 w-4" />
                              Convert to user
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

      <WaitlistDetailPanel
        open={detailPanelOpen}
        onOpenChange={setDetailPanelOpen}
        entryId={selectedEntry?.id ?? null}
        onRequestConvert={(entry) => {
          setSelectedEntry(entry);
          setConvertDialogOpen(true);
        }}
      />
      <ConvertToUserDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        entry={selectedEntry}
      />
    </div>
  );
}
