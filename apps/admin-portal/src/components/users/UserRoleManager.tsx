'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Shield, Plus, X, Lock, Loader2 } from 'lucide-react';
import { useRoles } from '@/hooks/use-roles';
import { useAssignRole, useRevokeRole } from '@/hooks/use-users';
import { toast } from 'sonner';
import type { User } from '@/types';
import type { Role } from '@/services/roles';

interface UserRoleManagerProps {
  user: User;
}

export function UserRoleManager({ user }: UserRoleManagerProps) {
  const [roleToRemove, setRoleToRemove] = useState<{ id: string; name: string } | null>(null);
  const [isAddingRole, setIsAddingRole] = useState(false);

  const { data: allRoles = [], isLoading: rolesLoading } = useRoles();
  const assignRole = useAssignRole();
  const revokeRole = useRevokeRole();

  // Get user's current role IDs
  const userRoleIds = user.roles?.map((r: any) => r.roleId || r.role?.id || r.id) || [];

  // Filter out roles the user already has
  const availableRoles = allRoles.filter((role: Role) => !userRoleIds.includes(role.id));

  const handleAddRole = async (roleId: string) => {
    try {
      await assignRole.mutateAsync({
        userId: user.id,
        roleId,
        reason: `Role assigned by admin`,
      });
      toast.success('Role assigned successfully');
      setIsAddingRole(false);
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to assign role';
      toast.error(message);
      console.error('Assign role error:', error);
    }
  };

  const handleRemoveRole = async () => {
    if (!roleToRemove) return;

    try {
      await revokeRole.mutateAsync({
        userId: user.id,
        roleId: roleToRemove.id,
        reason: `Role removed by admin`,
      });
      toast.success('Role removed successfully');
      setRoleToRemove(null);
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to remove role';
      toast.error(message);
      console.error('Revoke role error:', error);
    }
  };

  const isPending = assignRole.isPending || revokeRole.isPending;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Assigned Roles</CardTitle>
              <CardDescription>
                Manage roles for this user. Roles determine permissions and access levels.
              </CardDescription>
            </div>
            {!isAddingRole && availableRoles.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddingRole(true)}
                disabled={isPending}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Role
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isAddingRole && (
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg border bg-muted/50">
              <Select
                onValueChange={handleAddRole}
                disabled={assignRole.isPending}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a role to add..." />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role: Role) => (
                    <SelectItem key={role.id} value={role.id}>
                      <div className="flex items-center gap-2">
                        {role.isSystem && <Lock className="h-3 w-3 text-muted-foreground" />}
                        <span>{role.name.replace(/_/g, ' ')}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsAddingRole(false)}
                disabled={assignRole.isPending}
              >
                Cancel
              </Button>
              {assignRole.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
            </div>
          )}

          {rolesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : user.roles && user.roles.length > 0 ? (
            <div className="space-y-3">
              {user.roles.map((userRole: any) => {
                const role = userRole.role || userRole;
                const roleId = userRole.roleId || role.id;
                const roleName = role.name || 'Unknown Role';
                const isSystem = role.isSystem;

                return (
                  <div
                    key={roleId}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-primary/10 p-2">
                        <Shield className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{roleName.replace(/_/g, ' ')}</p>
                          {isSystem && (
                            <Badge variant="outline" className="gap-1">
                              <Lock className="h-3 w-3" />
                              System
                            </Badge>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-sm text-muted-foreground">{role.description}</p>
                        )}
                        {role.permissions && role.permissions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {role.permissions.slice(0, 5).map((perm: any) => (
                              <Badge key={perm.id || perm.code} variant="secondary" className="text-xs">
                                {perm.code || perm.name}
                              </Badge>
                            ))}
                            {role.permissions.length > 5 && (
                              <Badge variant="secondary" className="text-xs">
                                +{role.permissions.length - 5} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setRoleToRemove({ id: roleId, name: roleName })}
                      disabled={isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No roles assigned to this user</p>
              {availableRoles.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setIsAddingRole(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Role
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!roleToRemove} onOpenChange={() => setRoleToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the <strong>{roleToRemove?.name.replace(/_/g, ' ')}</strong> role
              from this user? This will revoke all permissions associated with this role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeRole.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveRole}
              disabled={revokeRole.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeRole.isPending ? 'Removing...' : 'Remove Role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
