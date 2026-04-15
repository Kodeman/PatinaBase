'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  PageHeader,
  FilterTabs,
  ListRow,
  Section,
  EmptyState,
  StatusDot,
  LoadingStrata,
  type StatusVariant,
} from '@/components/portal';
import { formatDate } from '@/lib/utils';
import {
  useDesignerApplications,
  useMakerApplications,
} from '@/hooks/use-applications';
import type {
  ApplicationStatus,
  ApplicationType,
  DesignerApplication,
  MakerApplication,
} from '@/services/applications';
import { ApplicationDetailDrawer } from '@/components/applications/ApplicationDetailDrawer';

const STATUS_TABS: Array<{ value: ApplicationStatus | 'all'; label: string }> = [
  { value: 'pending', label: 'New' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

const TYPE_TABS: Array<{ value: ApplicationType; label: string }> = [
  { value: 'designer', label: 'Designers' },
  { value: 'maker', label: 'Makers' },
];

function statusVariant(status: ApplicationStatus): StatusVariant {
  switch (status) {
    case 'approved':
    case 'active':
      return 'success';
    case 'rejected':
      return 'error';
    case 'in_review':
    case 'waitlisted':
      return 'warning';
    case 'onboarding':
    case 'archived':
      return 'neutral';
    default:
      return 'info';
  }
}

export default function ApplicationsPage() {
  const [type, setType] = useState<ApplicationType>('designer');
  const [status, setStatus] = useState<ApplicationStatus | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Review, respond to, and onboard designer and maker applicants from patina.cloud."
      />

      <div className="mt-8">
        <FilterTabs items={TYPE_TABS} value={type} onChange={setType} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <FilterTabs
          items={STATUS_TABS}
          value={status}
          onChange={setStatus}
          className="border-b-0"
        />
        <div className="relative ml-auto w-full sm:w-[280px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            placeholder={
              type === 'designer'
                ? 'Search name, email, company'
                : 'Search brand, contact, email'
            }
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Section className="mt-8">
        {type === 'designer' ? (
          <DesignerList status={status} search={search} onSelect={setSelectedId} />
        ) : (
          <MakerList status={status} search={search} onSelect={setSelectedId} />
        )}
      </Section>

      <ApplicationDetailDrawer
        type={type}
        applicationId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function DesignerList({
  status,
  search,
  onSelect,
}: {
  status: ApplicationStatus | 'all';
  search: string;
  onSelect: (id: string) => void;
}) {
  const { data, isLoading, isError, error } = useDesignerApplications({
    status,
    search: search.trim() || undefined,
    page: 1,
    pageSize: 50,
  });

  if (isLoading) return <LoadingStrata />;
  if (isError)
    return (
      <EmptyState
        label="Error"
        message={error instanceof Error ? error.message : 'Failed to load applications.'}
      />
    );

  const rows = data?.data ?? [];
  if (rows.length === 0) return <EmptyState message="No applications in this status." />;

  return (
    <div>
      {rows.map((app) => {
        const name = [app.first_name, app.last_name].filter(Boolean).join(' ');
        return (
          <ListRow
            key={app.id}
            onClick={() => onSelect(app.id)}
            title={name || 'Unnamed applicant'}
            meta={[
              app.email,
              app.company,
              app.motivation ? app.motivation.slice(0, 80) : undefined,
            ]}
            right={
              <>
                <span className="type-meta-small whitespace-nowrap">{formatDate(app.created_at)}</span>
                <StatusDot variant={statusVariant(app.status)} label={app.status.replace('_', ' ')} />
              </>
            }
          />
        );
      })}
    </div>
  );
}

function MakerList({
  status,
  search,
  onSelect,
}: {
  status: ApplicationStatus | 'all';
  search: string;
  onSelect: (id: string) => void;
}) {
  const { data, isLoading, isError, error } = useMakerApplications({
    status,
    search: search.trim() || undefined,
    page: 1,
    pageSize: 50,
  });

  if (isLoading) return <LoadingStrata />;
  if (isError)
    return (
      <EmptyState
        label="Error"
        message={error instanceof Error ? error.message : 'Failed to load applications.'}
      />
    );

  const rows = data?.data ?? [];
  if (rows.length === 0) return <EmptyState message="No applications in this status." />;

  return (
    <div>
      {rows.map((app: MakerApplication) => (
        <ListRow
          key={app.id}
          onClick={() => onSelect(app.id)}
          title={app.brand_name || 'Unnamed brand'}
          meta={[
            app.contact_name,
            app.email,
            app.description ? app.description.slice(0, 80) : undefined,
          ]}
          right={
            <>
              <span className="type-meta-small whitespace-nowrap">{formatDate(app.created_at)}</span>
              <StatusDot variant={statusVariant(app.status)} label={app.status.replace('_', ' ')} />
            </>
          }
        />
      ))}
    </div>
  );
}
