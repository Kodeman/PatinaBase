'use client';

import { Badge } from '@/components/ui/badge';
import { DataTable, type Column, LoadingStrata, StatusDot, type StatusVariant } from '@/components/portal';
import { useUserStudios } from '@/hooks/use-users';
import type { UserStudioMembership } from '@/types';

interface UserStudiosTabProps {
  userId: string;
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

export function UserStudiosTab({ userId }: UserStudiosTabProps) {
  const { data: memberships, isLoading } = useUserStudios(userId);

  if (isLoading) return <LoadingStrata />;

  const columns: Column<UserStudioMembership>[] = [
    { key: 'name', header: 'Studio', render: (m) => m.organizationName },
    {
      key: 'status',
      header: 'Status',
      render: (m) => <StatusDot variant={statusVariantFor(m.organizationStatus)} label={m.organizationStatus} />,
    },
    { key: 'role', header: 'Tier', render: (m) => <Badge variant="outline">{m.role}</Badge> },
    { key: 'membershipStatus', header: 'Membership', render: (m) => m.status },
    { key: 'title', header: 'Title', render: (m) => m.staffRole || m.jobTitle || '—' },
  ];

  return (
    <DataTable
      columns={columns}
      rows={memberships ?? []}
      getKey={(m) => m.organizationId}
      onRowHref={(m) => `/studios/${m.organizationId}`}
      emptyMessage="This user isn't a member of any studio."
    />
  );
}
