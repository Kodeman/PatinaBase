'use client';

import { useState } from 'react';
import { Search, Inbox } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  PageHeader,
  FilterTabs,
  ListRow,
  Section,
  EmptyState as PortalEmptyState,
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
// F2 admin-portal help-system migration. The portal-local `EmptyState`
// primitive is aliased as `PortalEmptyState` so it remains in use for the
// error path (label + transient message) while CMS-backed `EmptyState`
// owns the "no applications match this status" surface. Voice is utility:
// "No applications waiting" not "Your applicant pool is quiet."
import { EmptyState, SectionIntro, SurfaceKeys, useHelpContent } from '@patina/help-system';

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

      {/* Page-level intro. CMS-authored; explains the queue mechanics so
          an operator knows what "Pending" / "In Review" / "Approved"
          actually transition between. */}
      <SectionIntro
        surfaceKey={SurfaceKeys.AdminPortal.Applications.ListIntro}
        fallback="The applicant queue. Filter by status, then open a row to act."
        className="-mt-4 mb-6 max-w-prose"
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

// ─── Empty-state wrapper (F2 admin-portal applications) ──────────────────────
//
// Single CMS surface (no-applications-in-this-status) — falls back to inline
// copy until Sanity content lands. Both the Designer and Maker list paths
// route through this wrapper so the operator sees the same authored copy
// regardless of which application type they're filtered to.

function ApplicationsEmptyState() {
  const surfaceKey = SurfaceKeys.AdminPortal.Applications.Empty.NoApplications;
  const { data, isLoading } = useHelpContent(surfaceKey, 'emptyState');

  if (isLoading) {
    return (
      <p className="type-body py-16 text-center italic text-[var(--text-muted)]">…</p>
    );
  }

  if (data) {
    return (
      <EmptyState
        surfaceKey={surfaceKey}
        icon={<Inbox className="h-8 w-8 text-[var(--text-muted)]" strokeWidth={1.5} />}
      />
    );
  }

  return (
    <p className="type-body py-16 text-center text-[var(--text-muted)]">
      No applications in this status.
    </p>
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
      <PortalEmptyState
        label="Error"
        message={error instanceof Error ? error.message : 'Failed to load applications.'}
      />
    );

  const rows = data?.data ?? [];
  if (rows.length === 0) return <ApplicationsEmptyState />;

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
      <PortalEmptyState
        label="Error"
        message={error instanceof Error ? error.message : 'Failed to load applications.'}
      />
    );

  const rows = data?.data ?? [];
  if (rows.length === 0) return <ApplicationsEmptyState />;

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
