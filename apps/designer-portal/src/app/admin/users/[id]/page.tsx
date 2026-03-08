'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Alert,
  AlertDescription,
} from '@patina/design-system';
import {
  ArrowLeft,
  Shield,
  Mail,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Ban,
  Pause,
  Play,
} from 'lucide-react';
import { useAdminUser } from '@/hooks/admin';
import { formatDate, formatDateTime, cn } from '@/lib/utils';
import {
  SessionList,
  SuspendUserDialog,
  BanUserDialog,
  ActivateUserDialog,
  VerifyEmailDialog,
} from '@/components/admin/users';
import { userActivityByUserId } from '@/data/mock-admin';
import { formatDistanceToNow } from 'date-fns';

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const { data: user, isLoading, error } = useAdminUser(userId);

  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [verifyEmailDialogOpen, setVerifyEmailDialogOpen] = useState(false);
  const activityEvents = user ? userActivityByUserId[user.id] ?? userActivityByUserId.default : [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/users')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="text-muted-foreground">Loading user details...</div>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/users')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">User Not Found</h1>
        </div>
        <Alert variant="solid" color="error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load user details. The user may not exist or you may not have permission to
            view this user.
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
      case 'banned':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/users')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold tracking-tight">{user.email}</h1>
              <Badge variant={getStatusVariant(user.status)}>{user.status}</Badge>
              {user.emailVerified ? (
                <Badge variant="solid" color="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Verified
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Unverified
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {user.displayName || 'No display name'} • User ID: {user.id}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {user.status === 'active' && (
            <>
              <Button variant="outline" onClick={() => setSuspendDialogOpen(true)}>
                <Pause className="mr-2 h-4 w-4" />
                Suspend
              </Button>
              <Button variant="destructive" onClick={() => setBanDialogOpen(true)}>
                <Ban className="mr-2 h-4 w-4" />
                Ban
              </Button>
            </>
          )}
          {(user.status === 'suspended' || user.status === 'banned') && (
            <Button onClick={() => setActivateDialogOpen(true)}>
              <Play className="mr-2 h-4 w-4" />
              Reactivate
            </Button>
          )}
          {!user.emailVerified && (
            <Button variant="outline" onClick={() => setVerifyEmailDialogOpen(true)}>
              <Mail className="mr-2 h-4 w-4" />
              Verify Email
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>User Information</CardTitle>
              <CardDescription>Basic account details and metadata</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Email</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{user.email}</p>
                    {user.emailVerified ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Display Name</p>
                  <p className="font-medium">{user.displayName || 'Not set'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={getStatusVariant(user.status)}>{user.status}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">User ID</p>
                  <p className="font-mono text-sm">{user.id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Sub (Auth ID)</p>
                  <p className="font-mono text-sm">{user.sub}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Avatar</p>
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="Avatar" className="h-10 w-10 rounded-full" />
                  ) : (
                    <p className="text-sm text-muted-foreground">No avatar</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">{formatDateTime(user.createdAt)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Last Updated</p>
                  <p className="font-medium">{formatDateTime(user.updatedAt)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Roles & Permissions Tab */}
        <TabsContent value="roles" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assigned Roles</CardTitle>
              <CardDescription>
                Roles determine what actions this user can perform
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user.roles && user.roles.length > 0 ? (
                <div className="space-y-4">
                  {user.roles.map((role) => (
                    <div
                      key={role.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-primary/10 p-2">
                          <Shield className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{role.name}</p>
                          {role.description && (
                            <p className="text-sm text-muted-foreground">{role.description}</p>
                          )}
                          {role.permissions && role.permissions.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {role.permissions.map((perm) => (
                                <Badge key={perm.id} variant="outline" className="text-xs">
                                  {perm.code}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No roles assigned to this user
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions">
          <SessionList userId={userId} />
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>High-signal events synced from the audit bus</CardDescription>
            </CardHeader>
            <CardContent>
              {activityEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No activity logged for this user yet.
                </div>
              ) : (
                <div className="space-y-6">
                  {activityEvents.map((event, index) => (
                    <div key={event.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            'h-2.5 w-2.5 rounded-full',
                            event.tone === 'success' && 'bg-success',
                            event.tone === 'warning' && 'bg-warning',
                            event.tone === 'destructive' && 'bg-destructive',
                            event.tone === 'info' && 'bg-primary'
                          )}
                        />
                        {index !== activityEvents.length - 1 && (
                          <div className="mt-1 h-full w-px bg-border" />
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-medium">{event.title}</p>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{event.description}</p>
                        <p className="text-xs text-muted-foreground">{event.context}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <SuspendUserDialog
        userId={userId}
        userEmail={user.email}
        open={suspendDialogOpen}
        onOpenChange={setSuspendDialogOpen}
      />
      <BanUserDialog
        userId={userId}
        userEmail={user.email}
        open={banDialogOpen}
        onOpenChange={setBanDialogOpen}
      />
      <ActivateUserDialog
        userId={userId}
        userEmail={user.email}
        currentStatus={user.status}
        open={activateDialogOpen}
        onOpenChange={setActivateDialogOpen}
      />
      <VerifyEmailDialog
        userId={userId}
        userEmail={user.email}
        open={verifyEmailDialogOpen}
        onOpenChange={setVerifyEmailDialogOpen}
      />
    </div>
  );
}
