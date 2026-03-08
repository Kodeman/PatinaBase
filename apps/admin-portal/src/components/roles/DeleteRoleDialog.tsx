'use client';

import { useState } from 'react';
import { Loader2, AlertTriangle, Trash2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useDeleteRole } from '@/hooks/use-roles';
import type { Role } from '@/services/roles';

interface DeleteRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onSuccess?: () => void;
}

export function DeleteRoleDialog({ open, onOpenChange, role, onSuccess }: DeleteRoleDialogProps) {
  const { toast } = useToast();
  const [forceDelete, setForceDelete] = useState(false);
  const deleteRoleMutation = useDeleteRole();

  const handleDelete = async () => {
    if (!role) return;

    try {
      const result = await deleteRoleMutation.mutateAsync({
        roleId: role.id,
        force: forceDelete,
      });

      toast({
        title: 'Role deleted',
        description: result?.usersAffected && result.usersAffected > 0
          ? `Role "${result.deletedRole}" has been deleted. ${result.usersAffected} users were affected.`
          : `Role "${result?.deletedRole || role.name}" has been deleted.`,
      });

      onSuccess?.();
      onOpenChange(false);
      setForceDelete(false);
    } catch (error: any) {
      toast({
        title: 'Failed to delete role',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const formatRoleName = (name: string) => {
    return name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (!role) return null;

  const hasUsers = role.userCount > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Delete Role
          </AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the role "{formatRoleName(role.name)}"?
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasUsers && (
          <div className="my-4 p-4 rounded-lg border border-warning bg-warning/10">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
              <div>
                <div className="font-medium text-warning-foreground">
                  This role has {role.userCount} assigned {role.userCount === 1 ? 'user' : 'users'}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Deleting this role will remove it from all assigned users. Consider reassigning
                  users to another role first.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Checkbox
                    id="forceDelete"
                    checked={forceDelete}
                    onCheckedChange={(checked) => setForceDelete(checked === true)}
                  />
                  <Label htmlFor="forceDelete" className="text-sm">
                    I understand and want to delete this role anyway
                  </Label>
                </div>
              </div>
            </div>
          </div>
        )}

        {!hasUsers && (
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. The role and its permission assignments will be
            permanently removed.
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteRoleMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteRoleMutation.isPending || (hasUsers && !forceDelete)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteRoleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete Role
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default DeleteRoleDialog;
