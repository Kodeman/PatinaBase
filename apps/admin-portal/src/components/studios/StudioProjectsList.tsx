'use client';

import { DataTable, type Column, LoadingStrata } from '@/components/portal';
import { useStudioProjects } from '@/hooks/use-studios';
import { formatDate } from '@/lib/utils';
import type { StudioProject } from '@/types';

interface StudioProjectsListProps {
  studioId: string;
}

export function StudioProjectsList({ studioId }: StudioProjectsListProps) {
  const { data, isLoading } = useStudioProjects(studioId);

  if (isLoading) return <LoadingStrata />;

  const projects = data?.data ?? [];

  const columns: Column<StudioProject>[] = [
    { key: 'name', header: 'Name', render: (p) => p.name },
    { key: 'status', header: 'Status', render: (p) => p.status ?? '—' },
    { key: 'createdAt', header: 'Created', render: (p) => formatDate(p.createdAt) },
  ];

  return (
    <DataTable
      columns={columns}
      rows={projects}
      getKey={(p) => p.id}
      emptyMessage="No projects for this studio yet."
    />
  );
}
