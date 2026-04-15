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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Activity, Eye, UserPlus, Users, Mail, Info } from 'lucide-react';

interface PostHogStats {
  pageviewsLast7d: number;
  pageviewsLast30d: number;
  signupsLast7d: number;
  signupsLast30d: number;
  uniqueVisitorsLast7d: number;
  identifiedUsersLast30d: number;
  newsletterSignupsLast7d: number;
  waitlistSignupsLast7d: number;
  topEvents: Array<{ event: string; count: number }>;
  signupsByPlatform: Array<{ platform: string; count: number }>;
}

interface StatsResponse {
  configured: boolean;
  message?: string;
  stats?: PostHogStats;
}

const numberFormatter = new Intl.NumberFormat('en-US');

export const PostHogStatsWidget: React.FC = () => {
  const { data, isLoading, error } = useQuery<StatsResponse>({
    queryKey: ['posthog-stats'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/posthog');
      if (!response.ok) throw new Error('Failed to fetch PostHog stats');
      return response.json();
    },
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            PostHog Analytics
          </CardTitle>
          <CardDescription>Loading cross-platform engagement data…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            PostHog Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              Unable to load PostHog stats. Check the admin-portal server logs.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data?.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            PostHog Analytics
          </CardTitle>
          <CardDescription>Cross-platform engagement + signup funnel</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p>{data?.message || 'PostHog is not configured yet.'}</p>
              <p className="text-xs text-muted-foreground">
                Generate a personal API key at{' '}
                <code className="px-1 py-0.5 bg-muted rounded">
                  https://us.posthog.com/settings/user-api-keys
                </code>{' '}
                and add <code>POSTHOG_PERSONAL_API_KEY</code> to the admin-portal <code>.env</code>.
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const stats = data.stats!;

  return (
    <div className="space-y-4">
      {/* Headline stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            PostHog Analytics
          </CardTitle>
          <CardDescription>Cross-platform engagement across website, designer, admin, and client portals</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile
              icon={<Eye className="h-4 w-4 text-muted-foreground" />}
              label="Pageviews (7d)"
              value={stats.pageviewsLast7d}
              footnote={`${numberFormatter.format(stats.pageviewsLast30d)} in 30d`}
            />
            <StatTile
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
              label="Unique visitors (7d)"
              value={stats.uniqueVisitorsLast7d}
              footnote={`${numberFormatter.format(stats.identifiedUsersLast30d)} identified in 30d`}
            />
            <StatTile
              icon={<UserPlus className="h-4 w-4 text-muted-foreground" />}
              label="Signups (7d)"
              value={stats.signupsLast7d}
              footnote={`${numberFormatter.format(stats.signupsLast30d)} in 30d`}
            />
            <StatTile
              icon={<Mail className="h-4 w-4 text-muted-foreground" />}
              label="Newsletter + waitlist (7d)"
              value={stats.newsletterSignupsLast7d + stats.waitlistSignupsLast7d}
              footnote={`NL ${stats.newsletterSignupsLast7d} · WL ${stats.waitlistSignupsLast7d}`}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top events */}
        <Card>
          <CardHeader>
            <CardTitle>Top Events (last 7 days)</CardTitle>
            <CardDescription>What users are doing across all surfaces</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            ) : (
              <div className="space-y-2">
                {stats.topEvents.map((row) => (
                  <div key={row.event} className="flex items-center justify-between text-sm">
                    <code className="text-xs">{row.event}</code>
                    <Badge variant="secondary">{numberFormatter.format(row.count)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Signups by platform */}
        <Card>
          <CardHeader>
            <CardTitle>Signups by Platform (30d)</CardTitle>
            <CardDescription>Where conversions are happening</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.signupsByPlatform.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No signup events captured yet. Signups from website, designer-portal, and client-portal will appear here once users sign up.
              </p>
            ) : (
              <div className="space-y-2">
                {stats.signupsByPlatform.map((row) => (
                  <div key={row.platform} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{row.platform}</span>
                    <Badge>{numberFormatter.format(row.count)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

interface StatTileProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  footnote?: string;
}

const StatTile: React.FC<StatTileProps> = ({ icon, label, value, footnote }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {icon}
    </div>
    <div className="text-2xl font-bold">{numberFormatter.format(value)}</div>
    {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
  </div>
);

export default PostHogStatsWidget;
