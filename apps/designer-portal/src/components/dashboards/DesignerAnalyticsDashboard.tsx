'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, Users, CheckCircle, AlertCircle } from 'lucide-react';

interface DesignerMetrics {
  designerId: string;
  totalClients: number;
  avgHealthScore: number;
  completedProjects: number;
  activeProjects: number;
  totalPipelineValue: number;
  completionAvgHealth: number;
  winRate: number;
}

/**
 * Designer Analytics Dashboard
 * Shows individual designer performance metrics
 */
export const DesignerAnalyticsDashboard: React.FC = () => {
  // Fetch designer metrics for current user
  const {
    data: metrics,
    isLoading,
    error,
  } = useQuery<DesignerMetrics>({
    queryKey: ['designer-analytics'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/designers/metrics');
      if (!response.ok) throw new Error('Failed to fetch designer metrics');
      return response.json();
    },
    refetchInterval: 10 * 60 * 1000, // 10 minutes
  });

  const getHealthColor = (score: number): 'default' | 'destructive' | 'secondary' | 'outline' => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    if (score >= 40) return 'outline';
    return 'destructive';
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            Unable to load analytics. Please try again later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your Performance</h1>
        <p className="text-muted-foreground">
          Track your client portfolio and project metrics
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Clients Managed */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clients Managed</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">{metrics?.totalClients || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {metrics?.activeProjects || 0} active projects
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Win Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">{metrics?.winRate || 0}%</div>
                <p className="text-xs text-muted-foreground">
                  {metrics?.completedProjects || 0} completed projects
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Avg Health Score */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Health Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">{metrics?.avgHealthScore || 0}%</div>
                <Progress
                  value={metrics?.avgHealthScore || 0}
                  className="mt-2 h-2"
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Pipeline Value */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">
                {formatCurrency(metrics?.totalPipelineValue || 0)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Project Performance</CardTitle>
            <CardDescription>Overview of your portfolio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Total Projects</span>
                    <span className="text-2xl font-bold">
                      {(metrics?.totalClients || 0) + (metrics?.activeProjects || 0)}
                    </span>
                  </div>
                  <Progress
                    value={
                      ((metrics?.completedProjects || 0) /
                        ((metrics?.totalClients || 0) + (metrics?.activeProjects || 0))) *
                      100
                    }
                    className="h-2"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="text-lg font-bold">{metrics?.completedProjects || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">In Progress</p>
                    <p className="text-lg font-bold">{metrics?.activeProjects || 0}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Health Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Client Health</CardTitle>
            <CardDescription>Quality of client relationships</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Current Avg Health</span>
                    <Badge variant={getHealthColor(metrics?.avgHealthScore || 0)}>
                      {metrics?.avgHealthScore || 0}%
                    </Badge>
                  </div>
                  <Progress value={metrics?.avgHealthScore || 0} className="h-2" />
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Completion Avg Health</span>
                    <Badge variant={getHealthColor(metrics?.completionAvgHealth || 0)}>
                      {metrics?.completionAvgHealth || 0}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average health of completed projects
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Goals & Targets */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Targets</CardTitle>
          <CardDescription>Progress toward quarterly goals</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Win Rate Target</span>
                  <span className="text-sm font-bold">{metrics?.winRate || 0}% / 80%</span>
                </div>
                <Progress value={Math.min((metrics?.winRate || 0) / 0.8, 100)} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Health Score Target</span>
                  <span className="text-sm font-bold">
                    {metrics?.avgHealthScore || 0}% / 75%
                  </span>
                </div>
                <Progress
                  value={Math.min((metrics?.avgHealthScore || 0) / 0.75, 100)}
                  className="h-2"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Client Growth</span>
                  <span className="text-sm font-bold">
                    {metrics?.totalClients || 0} clients
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Grow your client base to 50 clients this quarter
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DesignerAnalyticsDashboard;
