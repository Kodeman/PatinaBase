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
  FolderOpen,
  Archive,
  CheckCircle2,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

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

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; color: string }> = {
  active: { label: 'Active', variant: 'default', color: 'bg-green-500' },
  completed: { label: 'Completed', variant: 'secondary', color: 'bg-blue-500' },
  archived: { label: 'Archived', variant: 'outline', color: 'bg-gray-500' },
};

function ProjectsMetrics({ projects }: { projects: Project[] }) {
  const total = projects.length;
  const active = projects.filter(p => p.status === 'active').length;
  const completed = projects.filter(p => p.status === 'completed').length;
  const archived = projects.filter(p => p.status === 'archived').length;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{total}</div>
          <p className="text-xs text-muted-foreground">
            Across all statuses
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active</CardTitle>
          <div className="h-3 w-3 rounded-full bg-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{active}</div>
          <p className="text-xs text-muted-foreground">
            Currently in progress
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Completed</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{completed}</div>
          <p className="text-xs text-muted-foreground">
            Successfully finished
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Archived</CardTitle>
          <Archive className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{archived}</div>
          <p className="text-xs text-muted-foreground">
            No longer active
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

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

function ProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  const status = statusConfig[project.status] || statusConfig.active;

  return (
    <Card
      className="hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => router.push(`/projects/${project.id}`)}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{project.name}</CardTitle>
            {project.notes && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {project.notes}
              </p>
            )}
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Budget */}
          {(project.budget_min || project.budget_max) && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Budget:</span>
              <span className="font-medium">
                {project.budget_min && project.budget_max
                  ? `${formatCurrency(project.budget_min)} – ${formatCurrency(project.budget_max)}`
                  : project.budget_min
                    ? `From ${formatCurrency(project.budget_min)}`
                    : `Up to ${formatCurrency(project.budget_max!)}`}
              </span>
            </div>
          )}

          {/* Timeline */}
          {(project.timeline_start || project.timeline_end) && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Timeline:</span>
              <span className="font-medium">
                {project.timeline_start && project.timeline_end
                  ? `${formatDate(project.timeline_start)} – ${formatDate(project.timeline_end)}`
                  : project.timeline_start
                    ? `Started ${formatDate(project.timeline_start)}`
                    : `Due ${formatDate(project.timeline_end!)}`}
              </span>
            </div>
          )}

          {/* Created date */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
            <span>Created {formatDate(project.created_at)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectsListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: allProjects, isLoading } = useProjects();

  const projects = (allProjects as Project[] | undefined)?.filter((project) => {
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    const matchesSearch =
      searchQuery === '' ||
      project.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.notes?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  }) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Manage and monitor all ongoing projects
          </p>
        </div>
        <Button onClick={() => router.push('/projects/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Metrics */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : allProjects && allProjects.length > 0 ? (
        <ProjectsMetrics projects={allProjects as Project[]} />
      ) : null}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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

      {/* Projects Grid */}
      {isLoading ? (
        <ProjectsListSkeleton />
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <FolderOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No projects found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Get started by creating your first project'}
            </p>
            {searchQuery === '' && statusFilter === 'all' && (
              <Button onClick={() => router.push('/projects/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Project
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
