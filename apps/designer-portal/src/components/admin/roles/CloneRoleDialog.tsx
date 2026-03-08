'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Copy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Textarea,
  Label,
  Badge,
} from '@patina/design-system';
import { useToast } from '@patina/design-system';
import { useCloneAdminRole } from '@/hooks/admin/use-roles';
import type { Role } from '@/hooks/admin/use-roles';

const cloneRoleSchema = z.object({
  name: z
    .string()
    .min(3, 'Name must be at least 3 characters')
    .max(50, 'Name must be at most 50 characters')
    .regex(/^[a-z][a-z0-9_]*$/, 'Name must start with a letter and contain only lowercase letters, numbers, and underscores'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
});

type CloneRoleValues = z.infer<typeof cloneRoleSchema>;

interface CloneRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceRole: Role | null;
  onSuccess?: (role: Role) => void;
}

export function CloneRoleDialog({ open, onOpenChange, sourceRole, onSuccess }: CloneRoleDialogProps) {
  const { toast } = useToast();
  const cloneRoleMutation = useCloneAdminRole();

  const form = useForm<CloneRoleValues>({
    resolver: zodResolver(cloneRoleSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open && sourceRole) {
      form.reset({
        name: `${sourceRole.name}_copy`,
        description: sourceRole.description ? `Clone of ${sourceRole.name}. ${sourceRole.description}` : `Clone of ${sourceRole.name}`,
      });
    }
  }, [open, sourceRole, form]);

  const handleSubmit = async (values: CloneRoleValues) => {
    if (!sourceRole) return;

    try {
      const newRole = await cloneRoleMutation.mutateAsync({
        sourceRoleId: sourceRole.id,
        data: values,
      });

      toast({
        title: 'Role cloned',
        description: `Role "${values.name}" has been created with ${sourceRole.permissionCount} permissions.`,
      });

      onSuccess?.(newRole);
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Failed to clone role',
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

  if (!sourceRole) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clone Role
          </DialogTitle>
          <DialogDescription>
            Create a new role based on "{formatRoleName(sourceRole.name)}" with all its permissions.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4 p-3 rounded-lg bg-muted">
          <div className="text-sm text-muted-foreground">Cloning from:</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-medium">{formatRoleName(sourceRole.name)}</span>
            <Badge variant="outline">{sourceRole.permissionCount} permissions</Badge>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">New Role Name</Label>
            <Input
              id="name"
              placeholder="e.g., custom_designer"
              {...form.register('name')}
              disabled={cloneRoleMutation.isPending}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Use lowercase letters, numbers, and underscores only.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what this role is for..."
              rows={3}
              {...form.register('description')}
              disabled={cloneRoleMutation.isPending}
            />
            {form.formState.errors.description && (
              <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={cloneRoleMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={cloneRoleMutation.isPending}>
              {cloneRoleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Clone Role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CloneRoleDialog;
