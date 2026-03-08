'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Shield, Users, Key, Pencil, Copy, Trash2, Lock, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useRole, useRoleUsers, usePermissionsGrouped } from '@/hooks/use-roles';
import {
  RoleFormDialog,
  CloneRoleDialog,
  DeleteRoleDialog,
  PermissionGrid,
} from '@/components/roles';
import type { Role } from '@/services/roles';

export default function RoleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleId = params.roleId as string;

  const initialTab = searchParams.get('tab') || 'permissions';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Dialog states
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Queries
  const { data: role, isLoading: isLoadingRole, error: roleError } = useRole(roleId);
  const { data: usersData, isLoading: isLoadingUsers } = useRoleUsers(roleId, 1, 50);
  const { data: permissionsData, isLoading: isLoadingPermissions } = usePermissionsGrouped();

  const formatRoleName = (name: string) => {
    return name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (isLoadingRole) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (roleError || !role) {
    return (
      <div className="py-24 text-center">
        <p className="text-destructive">Failed to load role</p>
        <p className="text-sm text-muted-foreground mt-2">
          {(roleError as Error)?.message || 'Role not found'}
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/roles">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Roles
          </Link>
        </Button>
      </div>
    );
  }

  // Get selected permission IDs for the grid
  const selectedPermissionIds = new Set(role.permissions?.map((p) => p.id) || []);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/roles">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Shield className={role.isSystem ? 'h-8 w-8 text-primary' : 'h-8 w-8 text-muted-foreground'} />
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              {formatRoleName(role.name)}
              {role.isSystem && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" />
                        System
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      System roles cannot be modified or deleted, but can be cloned.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </h1>
          </div>
          <p className="text-muted-foreground mt-1">
            {role.description || 'No description provided'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!role.isSystem && (
            <Button variant="outline" onClick={() => setIsEditDialogOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
          <Button variant="outline" onClick={() => setIsCloneDialogOpen(true)}>
            <Copy className="mr-2 h-4 w-4" />
            Clone
          </Button>
          {!role.isSystem && (
            <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{role.userCount}</div>
            <p className="text-xs text-muted-foreground">
              {role.userCount === 1 ? 'user has this role' : 'users have this role'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Permissions</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{role.permissionCount}</div>
            <p className="text-xs text-muted-foreground">
              of {permissionsData?.total || 0} total permissions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(role.createdAt)}</div>
            <p className="text-xs text-muted-foreground">
              Last updated {formatDate(role.updatedAt)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="permissions" className="gap-2">
            <Key className="h-4 w-4" />
            Permissions ({role.permissionCount})
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users ({role.userCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Assigned Permissions</CardTitle>
              <CardDescription>
                {role.isSystem
                  ? 'View the permissions assigned to this system role.'
                  : 'Manage the permissions assigned to this role.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingPermissions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : permissionsData?.groups ? (
                <PermissionGrid
                  groups={permissionsData.groups}
                  selectedPermissions={selectedPermissionIds}
                  onSelectionChange={() => {}}
                  readOnly
                />
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  Failed to load permissions
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Assigned Users</CardTitle>
              <CardDescription>
                Users who have been assigned this role.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingUsers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : usersData?.data && usersData.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Assigned By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersData.data.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatarUrl} />
                              <AvatarFallback>
                                {user.displayName?.charAt(0) || user.email?.charAt(0) || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">
                              {user.displayName || 'Unnamed User'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(user.assignedAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.assignedBy || 'System'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No users have been assigned this role yet.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <RoleFormDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        role={role}
      />

      <CloneRoleDialog
        open={isCloneDialogOpen}
        onOpenChange={setIsCloneDialogOpen}
        sourceRole={role}
        onSuccess={(newRole) => router.push(`/roles/${newRole.id}`)}
      />

      <DeleteRoleDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        role={role}
        onSuccess={() => router.push('/roles')}
      />
    </div>
  );
}
