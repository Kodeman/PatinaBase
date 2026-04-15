'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRoles } from '@/hooks/use-roles';
import {
  RoleCard,
  RoleFormDialog,
  CloneRoleDialog,
  DeleteRoleDialog,
} from '@/components/roles';
import {
  PageHeader,
  Section,
  EmptyState,
  LoadingStrata,
} from '@/components/portal';
import type { Role } from '@/services/roles';

export default function RolesPage() {
  const router = useRouter();
  const { data: roles, isLoading, error } = useRoles();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [cloningRole, setCloningRole] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);

  const systemRoles = roles?.filter((r) => r.isSystem) || [];
  const customRoles = roles?.filter((r) => !r.isSystem) || [];

  const handleViewPermissions = (role: Role) => {
    router.push(`/roles/${role.id}?tab=permissions` as any);
  };
  const handleViewUsers = (role: Role) => {
    router.push(`/roles/${role.id}?tab=users` as any);
  };

  if (isLoading) return <LoadingStrata />;
  if (error) {
    return (
      <div>
        <PageHeader title="Roles & Permissions" />
        <EmptyState label="Error" message={(error as Error).message} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Roles"
        accent="& Permissions"
        description="Manage roles and their permissions. Assign roles to users to control access."
        actions={
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Role
          </Button>
        }
      />

      <Section
        title={`System Roles`}
        className="mt-10"
        action={
          <span className="type-meta-small">{systemRoles.length} built-in</span>
        }
      >
        <p className="type-body-small mb-6 text-[var(--text-muted)]">
          Built-in roles that cannot be modified or deleted. Clone them to create custom variations.
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
      </Section>

      <Section
        title="Custom Roles"
        className="mt-10"
        action={<span className="type-meta-small">{customRoles.length} defined</span>}
      >
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
          <EmptyState
            message="No custom roles yet. Create one to define specific permission sets for your users."
          >
            <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Role
            </Button>
          </EmptyState>
        )}
      </Section>

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
      <CloneRoleDialog
        open={!!cloningRole}
        onOpenChange={(open) => !open && setCloningRole(null)}
        sourceRole={cloningRole}
      />
      <DeleteRoleDialog
        open={!!deletingRole}
        onOpenChange={(open) => !open && setDeletingRole(null)}
        role={deletingRole}
      />
    </div>
  );
}
