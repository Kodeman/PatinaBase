import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  notFound,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// POST /api/roles/[id]/clone - Clone a role (including system roles)
export async function POST(
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
  if (!body.name) return badRequest('name is required');

  try {
    // Get source role with permissions
    const { data: source } = await adminClient
      .from('roles')
      .select('*, role_permissions(permission_id)')
      .eq('id', id)
      .single();

    if (!source) return notFound('Source role not found');

    // Create new role
    const { data: newRole, error: createError } = await adminClient
      .from('roles')
      .insert({
        name: body.name,
        display_name: body.name,
        description: body.description ?? source.description,
        domain: source.domain,
        is_system: false,
        is_assignable: true,
      })
      .select()
      .single();

    if (createError) {
      if (createError.code === '23505') return badRequest('A role with this name already exists');
      return serverError(createError.message);
    }

    // Copy permissions
    const permInserts = (source.role_permissions ?? []).map((rp: any) => ({
      role_id: newRole.id,
      permission_id: rp.permission_id,
    }));

    if (permInserts.length > 0) {
      await adminClient.from('role_permissions').insert(permInserts);
    }

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'role.clone',
      resourceType: 'role',
      resourceId: newRole.id,
      newValues: { clonedFrom: id, name: body.name },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    // Re-fetch with permissions
    const { data: fullRole } = await adminClient
      .from('roles')
      .select('*, role_permissions(permissions(id, name, description, resource, action))')
      .eq('id', newRole.id)
      .single();

    if (!fullRole) return serverError('Failed to retrieve cloned role');

    return NextResponse.json({
      data: {
        id: fullRole.id,
        name: fullRole.name,
        description: fullRole.description ?? undefined,
        isSystem: false,
        createdAt: fullRole.created_at,
        updatedAt: fullRole.updated_at,
        userCount: 0,
        permissionCount: fullRole.role_permissions?.length ?? 0,
        permissions: (fullRole.role_permissions ?? [])
          .filter((rp: any) => rp.permissions)
          .map((rp: any) => ({
            id: rp.permissions.id,
            code: rp.permissions.name,
            resource: rp.permissions.resource,
            action: rp.permissions.action,
            description: rp.permissions.description ?? undefined,
          })),
      },
    }, { status: 201 });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to clone role');
  }
}
