'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, AlertCircle, Pause, Play, Ban, Pencil } from 'lucide-react';
import { useStudio } from '@/hooks/use-studios';
import { useBreadcrumbLastLabel } from '@/contexts/breadcrumb-context';
import { formatDateTime } from '@/lib/utils';
import { EditStudioDialog } from '@/components/studios/EditStudioDialog';
import { StudioStatusDialog, type StudioStatusAction } from '@/components/studios/StudioStatusDialog';
import { StudioRoster } from '@/components/studios/StudioRoster';
import { StudioProjectsList } from '@/components/studios/StudioProjectsList';
import { StudioActivityFeed } from '@/components/studios/StudioActivityFeed';

export default function StudioDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studioId = params.id as string;

  const { data: studio, isLoading, error } = useStudio(studioId);
  useBreadcrumbLastLabel(studio ? studio.name : null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<StudioStatusAction | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/studios')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="text-muted-foreground">Loading studio details...</div>
        </div>
      </div>
    );
  }

  if (error || !studio) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/studios')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Studio Not Found</h1>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load studio details. The studio may not exist or you may not have permission
            to view it.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'suspended':
        return 'warning';
      case 'deactivated':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 pt-12 animate-section-enter">
        <div className="mb-2 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/studios')}
            className="h-auto p-0 hover:bg-transparent"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="type-meta-small">Studios</span>
          </Button>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="type-page-title">{studio.name}</h1>
              <Badge variant={getStatusVariant(studio.status)}>{studio.status}</Badge>
              <Badge variant="outline">{studio.subscriptionTier}</Badge>
            </div>
            <p className="type-body mt-3 text-[var(--text-muted)]">
              {studio.slug} · Owner: {studio.owner?.email ?? 'Unknown'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            {studio.status === 'active' && (
              <Button variant="outline" onClick={() => setStatusAction('suspend')}>
                <Pause className="mr-2 h-4 w-4" />
                Suspend
              </Button>
            )}
            {(studio.status === 'suspended' || studio.status === 'deactivated') && (
              <Button onClick={() => setStatusAction('reactivate')}>
                <Play className="mr-2 h-4 w-4" />
                Reactivate
              </Button>
            )}
            {studio.status !== 'deactivated' && (
              <Button variant="destructive" onClick={() => setStatusAction('deactivate')}>
                <Ban className="mr-2 h-4 w-4" />
                Deactivate
              </Button>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Studio Information</CardTitle>
              <CardDescription>Profile details and metadata</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{studio.name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Slug</p>
                  <p className="font-mono text-sm">{studio.slug}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={getStatusVariant(studio.status)}>{studio.status}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Tier</p>
                  <Badge variant="outline">{studio.subscriptionTier}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Owner</p>
                  <p className="font-medium">{studio.owner?.email ?? 'Unknown'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Studio ID</p>
                  <p className="font-mono text-sm">{studio.id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Website</p>
                  <p className="font-medium">{studio.website || 'Not set'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{studio.email || 'Not set'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{studio.phone || 'Not set'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Members</p>
                  <p className="font-medium">
                    {studio.memberCount} active · {studio.invitedCount} invited
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Projects</p>
                  <p className="font-medium">{studio.projectCount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">{formatDateTime(studio.createdAt)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Last Updated</p>
                  <p className="font-medium">{formatDateTime(studio.updatedAt)}</p>
                </div>
                {studio.description && (
                  <div className="col-span-2 space-y-1">
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p className="font-medium">{studio.description}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roster">
          <StudioRoster studioId={studioId} studioName={studio.name} />
        </TabsContent>

        <TabsContent value="projects">
          <StudioProjectsList studioId={studioId} />
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>High-signal events synced from the audit bus</CardDescription>
            </CardHeader>
            <CardContent>
              <StudioActivityFeed studioId={studioId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EditStudioDialog studio={studio} open={editDialogOpen} onOpenChange={setEditDialogOpen} />
      {statusAction && (
        <StudioStatusDialog
          studioId={studio.id}
          studioName={studio.name}
          action={statusAction}
          open={!!statusAction}
          onOpenChange={(open) => !open && setStatusAction(null)}
        />
      )}
    </div>
  );
}
