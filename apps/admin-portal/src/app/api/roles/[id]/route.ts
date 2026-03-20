import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  notFound,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

function mapRole(role: any, userCount?: number) {
  return {
    id: role.id,
    name: role.name,
    description: role.description ?? undefined,
    isSystem: role.is_system,
    createdAt: role.created_at,
    updatedAt: role.updated_at,
    userCount: userCount ?? 0,
    permissionCount: role.role_permissions?.length ?? 0,
    permissions: (role.role_permissions ?? [])
      .filter((rp: any) => rp.permissions)
      .map((rp: any) => ({
        id: rp.permissions.id,
        code: rp.permissions.name,
        resource: rp.permissions.resource,
        action: rp.permissions.action,
        description: rp.permissions.description ?? undefined,
      })),
  };
}

// GET /api/roles/[id] - Get single role
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  try {
    const { data: role, error } = await adminClient
      .from('roles')
      .select('*, role_permissions(permissions(id, name, description, resource, action))')
      .eq('id', id)
      .single();

    if (error || !role) return notFound('Role not found');

    const { count } = await adminClient
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role_id', id);

    return NextResponse.json({ data: mapRole(role, count ?? 0) });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to get role');
  }
}

// PUT /api/roles/[id] - Update role (custom roles only)
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  try {
    const { data: existing } = await adminClient
      .from('roles')
      .select('is_system')
      .eq('id', id)
      .single();

    if (!existing) return notFound('Role not found');
    if (existing.is_system) return badRequest('Cannot modify system roles');

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      updates.name = body.name;
      updates.display_name = body.name;
    }
    if (body.description !== undefined) updates.description = body.description;

    const { error } = await adminClient
      .from('roles')
      .update(updates)
      .eq('id', id);

    if (error) return serverError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'role.update',
      resourceType: 'role',
      resourceId: id,
      newValues: body,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    const { data: role } = await adminClient
      .from('roles')
      .select('*, role_permissions(permissions(id, name, description, resource, action))')
      .eq('id', id)
      .single();

    const { count } = await adminClient
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role_id', id);

    return NextResponse.json({ data: mapRole(role, count ?? 0) });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to update role');
  }
}

// DELETE /api/roles/[id] - Delete role (custom roles only)
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  try {
    const { data: existing } = await adminClient
      .from('roles')
      .select('name, is_system')
      .eq('id', id)
      .single();

    if (!existing) return notFound('Role not found');
    if (existing.is_system) return badRequest('Cannot delete system roles');

    const { count: userCount } = await adminClient
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role_id', id);

    if ((userCount ?? 0) > 0 && !force) {
      return badRequest(`Role is assigned to ${userCount} user(s). Use force=true to delete anyway.`);
    }

    const { error } = await adminClient.from('roles').delete().eq('id', id);
    if (error) return serverError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'role.delete',
      resourceType: 'role',
      resourceId: id,
      oldValues: { name: existing.name },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      data: { success: true, deletedRole: existing.name, usersAffected: userCount ?? 0 },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to delete role');
  }
}
