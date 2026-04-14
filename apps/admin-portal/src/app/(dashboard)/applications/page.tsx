'use client';

import { useState } from 'react';
import { Inbox, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

function statusBadgeVariant(status: ApplicationStatus): 'default' | 'success' | 'destructive' | 'warning' | 'secondary' {
  switch (status) {
    case 'approved':
      return 'success';
    case 'rejected':
      return 'destructive';
    case 'in_review':
      return 'warning';
    case 'archived':
      return 'secondary';
    default:
      return 'default';
  }
}

export default function ApplicationsPage() {
  const [type, setType] = useState<ApplicationType>('designer');
  const [status, setStatus] = useState<ApplicationStatus | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Inbox className="h-7 w-7" />
            Applications
          </h1>
          <p className="text-muted-foreground">
            Review, respond to, and onboard designer and maker applicants from patina.cloud.
          </p>
        </div>
      </div>

      <Tabs value={type} onValueChange={(v) => setType(v as ApplicationType)}>
        <TabsList>
          <TabsTrigger value="designer">Designers</TabsTrigger>
          <TabsTrigger value="maker">Makers</TabsTrigger>
        </TabsList>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((s) => (
            <Button
              key={s.value}
              variant={status === s.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatus(s.value)}
            >
              {s.label}
            </Button>
          ))}
          <div className="ml-auto relative w-full sm:w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={type === 'designer' ? 'Search name, email, company' : 'Search brand, contact, email'}
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <TabsContent value="designer" className="mt-6">
          <DesignerList
            status={status}
            search={search}
            onSelect={setSelectedId}
          />
        </TabsContent>
        <TabsContent value="maker" className="mt-6">
          <MakerList status={status} search={search} onSelect={setSelectedId} />
        </TabsContent>
      </Tabs>

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

  if (isLoading) return <LoadingCard />;
  if (isError) return <ErrorCard message={error instanceof Error ? error.message : 'Failed to load'} />;

  const rows = data?.data ?? [];
  if (rows.length === 0) return <EmptyCard />;

  return (
    <div className="grid gap-3">
      {rows.map((app) => (
        <DesignerRow key={app.id} app={app} onSelect={onSelect} />
      ))}
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

  if (isLoading) return <LoadingCard />;
  if (isError) return <ErrorCard message={error instanceof Error ? error.message : 'Failed to load'} />;

  const rows = data?.data ?? [];
  if (rows.length === 0) return <EmptyCard />;

  return (
    <div className="grid gap-3">
      {rows.map((app) => (
        <MakerRow key={app.id} app={app} onSelect={onSelect} />
      ))}
    </div>
  );
}

function DesignerRow({
  app,
  onSelect,
}: {
  app: DesignerApplication;
  onSelect: (id: string) => void;
}) {
  const name = [app.first_name, app.last_name].filter(Boolean).join(' ');
  return (
    <Card className="cursor-pointer transition-colors hover:bg-accent/40" onClick={() => onSelect(app.id)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{name || 'Unnamed applicant'}</CardTitle>
            <CardDescription className="truncate">
              {app.email}
              {app.company ? ` · ${app.company}` : ''}
            </CardDescription>
          </div>
          <Badge variant={statusBadgeVariant(app.status)}>{app.status.replace('_', ' ')}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground flex items-center justify-between gap-4">
        <span className="truncate">
          {app.motivation ? app.motivation.slice(0, 120) : 'No motivation provided'}
        </span>
        <span className="whitespace-nowrap">{formatDate(app.created_at)}</span>
      </CardContent>
    </Card>
  );
}

function MakerRow({
  app,
  onSelect,
}: {
  app: MakerApplication;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="cursor-pointer transition-colors hover:bg-accent/40" onClick={() => onSelect(app.id)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{app.brand_name || 'Unnamed brand'}</CardTitle>
            <CardDescription className="truncate">
              {app.contact_name}
              {app.contact_name ? ` · ` : ''}
              {app.email}
            </CardDescription>
          </div>
          <Badge variant={statusBadgeVariant(app.status)}>{app.status.replace('_', ' ')}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground flex items-center justify-between gap-4">
        <span className="truncate">
          {app.description ? app.description.slice(0, 120) : 'No description provided'}
        </span>
        <span className="whitespace-nowrap">{formatDate(app.created_at)}</span>
      </CardContent>
    </Card>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="py-8 text-center text-muted-foreground">Loading applications…</CardContent>
    </Card>
  );
}

function EmptyCard() {
  return (
    <Card>
      <CardContent className="py-8 text-center text-muted-foreground">
        No applications in this status.
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-destructive">
        <p className="font-medium">Failed to load applications</p>
        <p className="text-sm text-muted-foreground mt-1">{message}</p>
      </CardContent>
    </Card>
  );
}
