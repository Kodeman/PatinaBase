import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// POST /api/users/[id]/roles - Assign role to user
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  let body: { roleId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (!body.roleId) return badRequest('roleId is required');

  try {
    const { error } = await adminClient.from('user_roles').insert({
      user_id: id,
      role_id: body.roleId,
      granted_by: adminUser.id,
    });

    if (error) {
      if (error.code === '23505') return badRequest('User already has this role');
      return serverError(error.message);
    }

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'role.assign',
      resourceType: 'user',
      resourceId: id,
      newValues: { roleId: body.roleId, reason: body.reason },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to assign role');
  }
}

// DELETE /api/users/[id]/roles - Remove role from user
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  const url = new URL(request.url);
  const roleId = url.searchParams.get('roleId');

  // Also support roleId in body for backwards compat
  let bodyRoleId: string | undefined;
  try {
    const body = await request.json();
    bodyRoleId = body.roleId;
  } catch {
    // no body is fine
  }

  const targetRoleId = roleId ?? bodyRoleId;
  if (!targetRoleId) return badRequest('roleId is required');

  try {
    const { error } = await adminClient
      .from('user_roles')
      .delete()
      .eq('user_id', id)
      .eq('role_id', targetRoleId);

    if (error) return serverError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'role.revoke',
      resourceType: 'user',
      resourceId: id,
      newValues: { roleId: targetRoleId },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to remove role');
  }
}
