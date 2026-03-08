'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { PermissionGrid } from './PermissionGrid';
import { usePermissionsGrouped, useCreateRole, useUpdateRole, useReplacePermissions } from '@/hooks/use-roles';
import type { Role } from '@/services/roles';

const roleFormSchema = z.object({
  name: z
    .string()
    .min(3, 'Name must be at least 3 characters')
    .max(50, 'Name must be at most 50 characters')
    .regex(/^[a-z][a-z0-9_]*$/, 'Name must start with a letter and contain only lowercase letters, numbers, and underscores'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
});

type RoleFormValues = z.infer<typeof roleFormSchema>;

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role | null; // null for create mode, Role for edit mode
  onSuccess?: (role: Role) => void;
}

export function RoleFormDialog({ open, onOpenChange, role, onSuccess }: RoleFormDialogProps) {
  const isEditMode = !!role;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('details');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

  const { data: permissionsData, isLoading: isLoadingPermissions } = usePermissionsGrouped();
  const createRoleMutation = useCreateRole();
  const updateRoleMutation = useUpdateRole();
  const replacePermissionsMutation = useReplacePermissions();

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  // Reset form when dialog opens/closes or role changes
  useEffect(() => {
    if (open) {
      if (role) {
        form.reset({
          name: role.name,
          description: role.description || '',
        });
        setSelectedPermissions(new Set(role.permissions?.map((p) => p.id) || []));
      } else {
        form.reset({ name: '', description: '' });
        setSelectedPermissions(new Set());
      }
      setActiveTab('details');
    }
  }, [open, role, form]);

  const isSubmitting =
    createRoleMutation.isPending ||
    updateRoleMutation.isPending ||
    replacePermissionsMutation.isPending;

  const handleSubmit = async (values: RoleFormValues) => {
    try {
      if (isEditMode && role) {
        // Update role details
        await updateRoleMutation.mutateAsync({
          roleId: role.id,
          data: values,
        });

        // Update permissions separately
        await replacePermissionsMutation.mutateAsync({
          roleId: role.id,
          permissionIds: Array.from(selectedPermissions),
        });

        toast({
          title: 'Role updated',
          description: `Role "${values.name}" has been updated successfully.`,
        });
      } else {
        // Create new role with permissions
        const newRole = await createRoleMutation.mutateAsync({
          ...values,
          permissionIds: Array.from(selectedPermissions),
        });

        toast({
          title: 'Role created',
          description: `Role "${values.name}" has been created successfully.`,
        });

        if (newRole) onSuccess?.(newRole);
      }

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: isEditMode ? 'Failed to update role' : 'Failed to create role',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Role' : 'Create New Role'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update the role details and permissions.'
              : 'Create a new custom role with specific permissions.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-1 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="permissions">
                Permissions ({selectedPermissions.size})
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-auto mt-4">
              <TabsContent value="details" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="name">Role Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., project_manager"
                    {...form.register('name')}
                    disabled={isSubmitting}
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Use lowercase letters, numbers, and underscores only. Must start with a letter.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe what this role is for..."
                    rows={3}
                    {...form.register('description')}
                    disabled={isSubmitting}
                  />
                  {form.formState.errors.description && (
                    <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="permissions" className="mt-0">
                {isLoadingPermissions ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : permissionsData?.groups ? (
                  <PermissionGrid
                    groups={permissionsData.groups}
                    selectedPermissions={selectedPermissions}
                    onSelectionChange={setSelectedPermissions}
                    disabled={isSubmitting}
                  />
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    Failed to load permissions
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="mt-4 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditMode ? 'Save Changes' : 'Create Role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default RoleFormDialog;
