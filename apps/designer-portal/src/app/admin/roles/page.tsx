'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Shield, Loader2 } from 'lucide-react';
import { Button, Divider } from '@patina/design-system';
import { useAdminRoles } from '@/hooks/admin';
import {
  RoleCard,
  RoleFormDialog,
  CloneRoleDialog,
  DeleteRoleDialog,
} from '@/components/admin/roles';
import type { Role } from '@/services/admin';

export default function RolesPage() {
  const router = useRouter();
  const { data: roles, isLoading, error } = useAdminRoles();

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [cloningRole, setCloningRole] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);

  // Separate system and custom roles
  const systemRoles = roles?.filter((r) => r.isSystem) || [];
  const customRoles = roles?.filter((r) => !r.isSystem) || [];

  const handleViewPermissions = (role: Role) => {
    router.push(`/admin/roles/${role.id}?tab=permissions`);
  };

  const handleViewUsers = (role: Role) => {
    router.push(`/admin/roles/${role.id}?tab=users`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-24 text-center">
        <p className="text-destructive">Failed to load roles</p>
        <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Shield className="h-8 w-8" />
            Roles & Permissions
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage roles and their permissions. Assign roles to users to control access.
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Role
        </Button>
      </div>

      {/* System Roles */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xl font-semibold">System Roles</h2>
          <span className="text-sm text-muted-foreground">({systemRoles.length})</span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          These are built-in roles that cannot be modified or deleted. You can clone them to create custom variations.
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {systemRoles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              onClone={() => setCloningRole(role)}
              onViewUsers={() => handleViewUsers(role)}
              onViewPermissions={() => handleViewPermissions(role)}
            />
          ))}
        </div>
      </section>

      <Divider />

      {/* Custom Roles */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xl font-semibold">Custom Roles</h2>
          <span className="text-sm text-muted-foreground">({customRoles.length})</span>
        </div>
        {customRoles.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {customRoles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                onEdit={() => setEditingRole(role)}
                onClone={() => setCloningRole(role)}
                onDelete={() => setDeletingRole(role)}
                onViewUsers={() => handleViewUsers(role)}
                onViewPermissions={() => handleViewPermissions(role)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-semibold">No custom roles yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Create a custom role to define specific permission sets for your users.
            </p>
            <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Role
            </Button>
          </div>
        )}
      </section>

      {/* Create/Edit Dialog */}
      <RoleFormDialog
        open={isCreateDialogOpen || !!editingRole}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingRole(null);
          }
        }}
        role={editingRole}
      />

      {/* Clone Dialog */}
      <CloneRoleDialog
        open={!!cloningRole}
        onOpenChange={(open) => !open && setCloningRole(null)}
        sourceRole={cloningRole}
      />

      {/* Delete Dialog */}
      <DeleteRoleDialog
        open={!!deletingRole}
        onOpenChange={(open) => !open && setDeletingRole(null)}
        role={deletingRole}
      />
    </div>
  );
}
