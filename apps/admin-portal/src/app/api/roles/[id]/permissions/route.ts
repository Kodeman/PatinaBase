import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  notFound,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// GET /api/roles/[id]/permissions - Get permissions for a role
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  try {
    const { data, error } = await adminClient
      .from('role_permissions')
      .select('permissions(id, name, description, resource, action)')
      .eq('role_id', id);

    if (error) return serverError(error.message);

    const permissions = (data ?? [])
      .filter((rp: any) => rp.permissions)
      .map((rp: any) => ({
        id: rp.permissions.id,
        code: rp.permissions.name,
        resource: rp.permissions.resource,
        action: rp.permissions.action,
        description: rp.permissions.description ?? undefined,
      }));

    return NextResponse.json({ data: permissions });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to get role permissions');
  }
}

// PUT /api/roles/[id]/permissions - Replace all permissions on a role
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  let body: { permissionIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (!body.permissionIds) return badRequest('permissionIds is required');

  try {
    const { data: role } = await adminClient.from('roles').select('is_system').eq('id', id).single();
    if (!role) return notFound('Role not found');
    if (role.is_system) return badRequest('Cannot modify permissions on system roles');

    // Delete existing and insert new
    await adminClient.from('role_permissions').delete().eq('role_id', id);

    if (body.permissionIds.length > 0) {
      const inserts = body.permissionIds.map((pid) => ({
        role_id: id,
        permission_id: pid,
      }));
      const { error } = await adminClient.from('role_permissions').insert(inserts);
      if (error) return serverError(error.message);
    }

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'role.permissions.replace',
      resourceType: 'role',
      resourceId: id,
      newValues: { permissionIds: body.permissionIds },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    // Re-fetch role with new permissions
    const { data: fullRole } = await adminClient
      .from('roles')
      .select('*, role_permissions(permissions(id, name, description, resource, action))')
      .eq('id', id)
      .single();

    return NextResponse.json({ data: fullRole });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to replace permissions');
  }
}

// POST /api/roles/[id]/permissions - Add permissions to role
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  let body: { permissionIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (!body.permissionIds || body.permissionIds.length === 0) {
    return badRequest('permissionIds is required');
  }

  try {
    const { data: role } = await adminClient.from('roles').select('is_system').eq('id', id).single();
    if (!role) return notFound('Role not found');
    if (role.is_system) return badRequest('Cannot modify permissions on system roles');

    const inserts = body.permissionIds.map((pid) => ({
      role_id: id,
      permission_id: pid,
    }));

    // Use upsert to handle duplicates gracefully
    const { error } = await adminClient
      .from('role_permissions')
      .upsert(inserts, { onConflict: 'role_id,permission_id' });

    if (error) return serverError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'role.permissions.add',
      resourceType: 'role',
      resourceId: id,
      newValues: { permissionIds: body.permissionIds },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    const { data: fullRole } = await adminClient
      .from('roles')
      .select('*, role_permissions(permissions(id, name, description, resource, action))')
      .eq('id', id)
      .single();

    return NextResponse.json({ data: fullRole });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to add permissions');
  }
}

// DELETE /api/roles/[id]/permissions - Remove permissions from role
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  let body: { permissionIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (!body.permissionIds || body.permissionIds.length === 0) {
    return badRequest('permissionIds is required');
  }

  try {
    const { data: role } = await adminClient.from('roles').select('is_system').eq('id', id).single();
    if (!role) return notFound('Role not found');
    if (role.is_system) return badRequest('Cannot modify permissions on system roles');

    const { error } = await adminClient
      .from('role_permissions')
      .delete()
      .eq('role_id', id)
      .in('permission_id', body.permissionIds);

    if (error) return serverError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'role.permissions.remove',
      resourceType: 'role',
      resourceId: id,
      newValues: { permissionIds: body.permissionIds },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to remove permissions');
  }
}
