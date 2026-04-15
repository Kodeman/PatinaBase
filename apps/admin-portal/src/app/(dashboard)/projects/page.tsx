'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProjects } from '@patina/supabase';
import {
  Plus,
  Search,
  Filter,
  Calendar,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  ListRow,
  StatusDot,
  type StatusVariant,
} from '@/components/portal';

interface Project {
  id: string;
  name: string;
  notes?: string | null;
  status: 'active' | 'completed' | 'archived';
  budget_min?: number | null;
  budget_max?: number | null;
  timeline_start?: string | null;
  timeline_end?: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  client_profile_id?: string | null;
}

const statusVariantFor = (status: string): StatusVariant => {
  if (status === 'active') return 'success';
  if (status === 'completed') return 'info';
  return 'neutral';
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ProjectsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: allProjects, isLoading } = useProjects();

  const projects =
    (allProjects as Project[] | undefined)?.filter((project) => {
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
      const matchesSearch =
        searchQuery === '' ||
        project.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.notes?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    }) || [];

  const allProjectsArr = (allProjects as Project[] | undefined) ?? [];
  const total = allProjectsArr.length;
  const active = allProjectsArr.filter((p) => p.status === 'active').length;
  const completed = allProjectsArr.filter((p) => p.status === 'completed').length;
  const archived = allProjectsArr.filter((p) => p.status === 'archived').length;

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Manage and monitor all ongoing projects."
        actions={
          <Button onClick={() => router.push('/projects/new' as any)}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        }
      />

      {isLoading ? (
        <div className="mt-10">
          <LoadingStrata />
        </div>
      ) : total > 0 ? (
        <MetricsRow>
          <MetricBlock label="Total Projects" value={total} />
          <MetricBlock label="Active" value={active} trend="up" change={`${active} ongoing`} />
          <MetricBlock label="Completed" value={completed} />
          <MetricBlock label="Archived" value={archived} />
        </MetricsRow>
      ) : null}

      <Section className="mt-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <LoadingStrata />
        ) : projects.length === 0 ? (
          <EmptyState
            message={
              searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters.'
                : 'No projects yet. Create your first project.'
            }
          >
            {!searchQuery && statusFilter === 'all' && (
              <Button className="mt-4" onClick={() => router.push('/projects/new' as any)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Project
              </Button>
            )}
          </EmptyState>
        ) : (
          <div>
            {projects.map((project) => {
              const budget =
                project.budget_min && project.budget_max
                  ? `${formatCurrency(project.budget_min)} – ${formatCurrency(project.budget_max)}`
                  : project.budget_min
                    ? `From ${formatCurrency(project.budget_min)}`
                    : project.budget_max
                      ? `Up to ${formatCurrency(project.budget_max)}`
                      : undefined;
              const timeline =
                project.timeline_start && project.timeline_end
                  ? `${formatDate(project.timeline_start)} – ${formatDate(project.timeline_end)}`
                  : project.timeline_start
                    ? `From ${formatDate(project.timeline_start)}`
                    : project.timeline_end
                      ? `Due ${formatDate(project.timeline_end)}`
                      : undefined;

              return (
                <ListRow
                  key={project.id}
                  href={`/projects/${project.id}`}
                  title={project.name}
                  meta={[
                    project.notes ? project.notes.slice(0, 90) : undefined,
                    budget && (
                      <span className="inline-flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {budget}
                      </span>
                    ),
                    timeline && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {timeline}
                      </span>
                    ),
                  ]}
                  right={
                    <StatusDot variant={statusVariantFor(project.status)} label={project.status} />
                  }
                />
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
