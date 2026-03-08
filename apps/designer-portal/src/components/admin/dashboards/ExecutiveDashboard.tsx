'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@patina/design-system';
import {
  Alert,
  AlertDescription,
  Badge,
  Skeleton
} from '@patina/design-system';
import { AlertTriangle, TrendingUp, Users, DollarSign, Clock } from 'lucide-react';

interface DashboardKPIs {
  pipelineValue: number;
  avgHealthScore: number;
  activeClients: number;
  avgCycleTimeDays: number;
  totalLeads: number;
  newContracts: number;
  timestamp: string;
}

interface HealthTier {
  riskTier: string;
  clientCount: number;
  avgHealthScore: number;
  criticalCount: number;
  warningCount: number;
}

interface AtRiskClient {
  clientId: string;
  fullName: string;
  email: string;
  companyName: string;
  healthScore: number;
  riskTier: string;
  primaryConcern: string;
  lifecycleStage: string;
}

/**
 * Executive Dashboard Component
 * Displays high-level business metrics and health overview
 */
export const ExecutiveDashboard: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('7d');

  // Fetch KPIs
  const {
    data: kpis,
    isLoading: kpisLoading,
    error: kpisError,
  } = useQuery<DashboardKPIs>({
    queryKey: ['executive-kpis'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/executive/kpis');
      if (!response.ok) throw new Error('Failed to fetch KPIs');
      return response.json();
    },
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch health distribution
  const {
    data: healthDistribution,
    isLoading: healthLoading,
  } = useQuery<HealthTier[]>({
    queryKey: ['health-distribution'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/health/distribution');
      if (!response.ok) throw new Error('Failed to fetch health distribution');
      return response.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  // Fetch at-risk clients
  const {
    data: atRiskClients,
    isLoading: atRiskLoading,
  } = useQuery<AtRiskClient[]>({
    queryKey: ['at-risk-clients'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/clients/at-risk?limit=5');
      if (!response.ok) throw new Error('Failed to fetch at-risk clients');
      return response.json();
    },
    refetchInterval: 10 * 60 * 1000, // 10 minutes
  });

  const getRiskColor = (riskTier: string): 'destructive' | 'warning' | 'secondary' | 'success' | 'default' => {
    switch (riskTier?.toLowerCase()) {
      case 'critical':
        return 'destructive';
      case 'at_risk':
        return 'warning';
      case 'at_watch':
        return 'secondary';
      case 'healthy':
        return 'success';
      default:
        return 'default';
    }
  };

  const getHealthStatus = (score: number): string => {
    if (score >= 80) return 'Healthy';
    if (score >= 60) return 'At Watch';
    if (score >= 40) return 'At Risk';
    return 'Critical';
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (kpisError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Failed to load dashboard data. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Executive Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your CRM health and business metrics
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pipeline Value */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pipeline Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(kpis?.pipelineValue || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Active clients: {kpis?.activeClients}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Health Score */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Health Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">{kpis?.avgHealthScore}%</div>
                <p className="text-xs text-muted-foreground">
                  {getHealthStatus(kpis?.avgHealthScore || 0)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Active Clients */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">{kpis?.activeClients}</div>
                <p className="text-xs text-muted-foreground">
                  {kpis?.newContracts} new this month
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Cycle Time */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Cycle Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">{kpis?.avgCycleTimeDays}d</div>
                <p className="text-xs text-muted-foreground">
                  From lead to completion
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health Distribution */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Client Health Distribution</CardTitle>
            <CardDescription>Risk tier breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {healthDistribution?.map((tier) => (
                  <div key={tier.riskTier} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">
                          {tier.riskTier.replace('_', ' ')}
                        </span>
                        <Badge variant={getRiskColor(tier.riskTier)}>
                          {tier.clientCount} clients
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        Avg: {tier.avgHealthScore}%
                      </span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      {tier.criticalCount > 0 && (
                        <Badge variant="destructive">
                          {tier.criticalCount} critical
                        </Badge>
                      )}
                      {tier.warningCount > 0 && (
                        <Badge variant="secondary">
                          {tier.warningCount} warning
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Leads</p>
              {kpisLoading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <p className="text-2xl font-bold">{kpis?.totalLeads}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">New Contracts</p>
              {kpisLoading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <p className="text-2xl font-bold">{kpis?.newContracts}</p>
              )}
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">Last updated</p>
              <p className="text-xs font-mono">
                {kpis?.timestamp
                  ? new Date(kpis.timestamp).toLocaleTimeString()
                  : 'Loading...'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* At-Risk Clients */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            At-Risk Clients
          </CardTitle>
          <CardDescription>Clients requiring immediate attention</CardDescription>
        </CardHeader>
        <CardContent>
          {atRiskLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {atRiskClients && atRiskClients.length > 0 ? (
                atRiskClients.map((client) => (
                  <div
                    key={client.clientId}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{client.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {client.companyName}
                      </p>
                      <div className="flex gap-2 text-xs">
                        <Badge variant={getRiskColor(client.riskTier)}>
                          {client.riskTier.replace('_', ' ')}
                        </Badge>
                        <span className="text-muted-foreground">
                          Concern: {client.primaryConcern.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{client.healthScore}%</p>
                      <p className="text-xs text-muted-foreground">Health Score</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No at-risk clients - great news!
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ExecutiveDashboard;
