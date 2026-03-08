'use client';

import { useState } from 'react';
import Link from 'next/link';
import { projectsApi } from '@/lib/api-client';
import { useProjects } from '@/hooks/use-projects';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ProjectStatusBadge,
  ProgressRing,
  Card,
  Button,
  Input,
  Skeleton,
  Badge,
} from '@patina/design-system';
import {
  Search,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Plus,
  FolderOpen,
  TrendingUp,
  Clock,
  Users,
  DollarSign,
} from 'lucide-react';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Project {
  id: string;
  name: string;
  clientName: string;
  status: 'planning' | 'active' | 'on-hold' | 'completed';
  budget: number;
  startDate: string;
  endDate?: string;
  progress: number;
  tasks: { total: number; completed: number };
}

export default function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading } = useProjects({ status: statusFilter === 'all' ? undefined : statusFilter });

  // Mock data - replace with real API data
  const mockProjects: Project[] = [
    {
      id: '1',
      name: 'Modern Living Room Redesign',
      clientName: 'Sarah Johnson',
      status: 'active',
      budget: 7500000,
      startDate: '2024-01-15',
      endDate: '2024-03-30',
      progress: 65,
      tasks: { total: 12, completed: 8 },
    },
    {
      id: '2',
      name: 'Kitchen Renovation',
      clientName: 'Michael Chen',
      status: 'planning',
      budget: 12000000,
      startDate: '2024-02-01',
      endDate: '2024-05-15',
      progress: 20,
      tasks: { total: 18, completed: 4 },
    },
    {
      id: '3',
      name: 'Office Space Makeover',
      clientName: 'Emily Davis',
      status: 'completed',
      budget: 5000000,
      startDate: '2023-11-01',
      endDate: '2024-01-15',
      progress: 100,
      tasks: { total: 10, completed: 10 },
    },
  ];

  const projects = mockProjects.filter((p) =>
    statusFilter === 'all' ? true : p.status === statusFilter
  ).filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.clientName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusConfig = (status: Project['status']) => {
    switch (status) {
      case 'active':
        return { variant: 'solid' as const, color: 'primary' as const, icon: TrendingUp, label: 'Active' };
      case 'planning':
        return { variant: 'subtle' as const, color: 'neutral' as const, icon: Clock, label: 'Planning' };
      case 'on-hold':
        return { variant: 'solid' as const, color: 'error' as const, icon: AlertCircle, label: 'On Hold' };
      case 'completed':
        return { variant: 'solid' as const, color: 'success' as const, icon: CheckCircle2, label: 'Completed' };
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Projects</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Manage and track all your design projects
            </p>
          </div>
          <Link href="/projects/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <FolderOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Projects</p>
                <p className="text-xl font-bold">{projects.length}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Active</p>
                <p className="text-xl font-bold">
                  {projects.filter((p) => p.status === 'active').length}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Completed</p>
                <p className="text-xl font-bold">
                  {projects.filter((p) => p.status === 'completed').length}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                <DollarSign className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Budget</p>
                <p className="text-xl font-bold">
                  {formatCurrency(projects.reduce((sum, p) => sum + p.budget, 0))}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Projects</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="planning">Planning</TabsTrigger>
          <TabsTrigger value="on-hold">On Hold</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="mt-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-6">
                  <Skeleton className="h-6 w-64 mb-4" />
                  <Skeleton className="h-4 w-full" />
                </Card>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <Card className="p-12 text-center">
              <FolderOpen className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 mb-4">No projects found</p>
              <Link href="/projects/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Project
                </Button>
              </Link>
            </Card>
          ) : (
            <div className="grid gap-4">
              {projects.map((project) => {
                const statusConfig = getStatusConfig(project.status);
                const StatusIcon = statusConfig.icon;

                return (
                  <Card key={project.id} className="p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Link href={`/projects/${project.id}`}>
                            <h3 className="text-lg font-semibold hover:text-purple-600 transition-colors">
                              {project.name}
                            </h3>
                          </Link>
                          <Badge variant={statusConfig.variant} color={statusConfig.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{project.clientName}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>{formatDate(project.startDate)}</span>
                            {project.endDate && (
                              <>
                                <span>-</span>
                                <span>{formatDate(project.endDate)}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4" />
                            <span>{formatCurrency(project.budget)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          Progress: {project.tasks.completed}/{project.tasks.total} tasks
                        </span>
                        <span className="font-medium">{project.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-purple-600 h-2 rounded-full transition-all"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-4 flex gap-2">
                      <Link href={`/projects/${project.id}`}>
                        <Button variant="outline" size="sm">
                          View Details
                        </Button>
                      </Link>
                      <Link href={`/projects/${project.id}/tasks`}>
                        <Button variant="ghost" size="sm">
                          Tasks
                        </Button>
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
