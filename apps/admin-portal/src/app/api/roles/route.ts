import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// Helper to map DB role to API response shape
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

// GET /api/roles - List all roles with user and permission counts
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  try {
    const { data: roles, error } = await adminClient
      .from('roles')
      .select('*, role_permissions(permissions(id, name, description, resource, action))')
      .order('created_at', { ascending: true });

    if (error) return serverError(error.message);

    // Get user counts per role
    const { data: userCounts } = await adminClient
      .from('user_roles')
      .select('role_id');

    const countMap = new Map<string, number>();
    for (const uc of userCounts ?? []) {
      countMap.set(uc.role_id, (countMap.get(uc.role_id) ?? 0) + 1);
    }

    const result = (roles ?? []).map((r: any) => mapRole(r, countMap.get(r.id) ?? 0));

    return NextResponse.json({ data: result });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to list roles');
  }
}

// POST /api/roles - Create a custom role
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;

  let body: { name?: string; description?: string; domain?: string; permissionIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (!body.name) return badRequest('name is required');

  try {
    const { data: role, error } = await adminClient
      .from('roles')
      .insert({
        name: body.name,
        display_name: body.name,
        description: body.description ?? null,
        domain: (body.domain ?? 'admin') as any,
        is_system: false,
        is_assignable: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return badRequest('A role with this name already exists');
      return serverError(error.message);
    }

    // Assign permissions if provided
    if (body.permissionIds && body.permissionIds.length > 0) {
      const permInserts = body.permissionIds.map((pid) => ({
        role_id: role.id,
        permission_id: pid,
      }));
      await adminClient.from('role_permissions').insert(permInserts);
    }

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'role.create',
      resourceType: 'role',
      resourceId: role.id,
      newValues: { name: body.name, permissionIds: body.permissionIds },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    // Re-fetch with permissions
    const { data: fullRole } = await adminClient
      .from('roles')
      .select('*, role_permissions(permissions(id, name, description, resource, action))')
      .eq('id', role.id)
      .single();

    return NextResponse.json({ data: mapRole(fullRole, 0) }, { status: 201 });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to create role');
  }
}
