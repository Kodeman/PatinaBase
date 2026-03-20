import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  mapUserToResponse,
  badRequest,
  notFound,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// GET /api/users/[id] - Get single user
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  try {
    const { data: authData, error: authError } =
      await adminClient.auth.admin.getUserById(id);
    if (authError || !authData.user) return notFound('User not found');

    const [profileRes, rolesRes] = await Promise.all([
      adminClient.from('profiles').select('display_name, avatar_url').eq('id', id).single(),
      adminClient
        .from('user_roles')
        .select('roles!inner(id, name, description, role_permissions(permissions(id, name, description, resource, action)))')
        .eq('user_id', id),
    ]);

    return NextResponse.json({
      data: mapUserToResponse(
        authData.user,
        profileRes.data,
        (rolesRes.data ?? []).map((r: any) => r.roles)
      ),
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to get user');
  }
}

// PATCH /api/users/[id] - Update user
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  let body: { email?: string; displayName?: string; avatarUrl?: string; emailVerified?: boolean };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  try {
    // Update auth user fields
    const authUpdates: Record<string, unknown> = {};
    if (body.email) authUpdates.email = body.email;
    if (body.emailVerified !== undefined) authUpdates.email_confirm = body.emailVerified;

    if (Object.keys(authUpdates).length > 0) {
      const { error } = await adminClient.auth.admin.updateUserById(id, authUpdates);
      if (error) return badRequest(error.message);
    }

    // Update profile fields
    const profileUpdates: Record<string, unknown> = {};
    if (body.displayName !== undefined) profileUpdates.display_name = body.displayName;
    if (body.avatarUrl !== undefined) profileUpdates.avatar_url = body.avatarUrl;

    if (Object.keys(profileUpdates).length > 0) {
      await adminClient.from('profiles').upsert({ id, ...profileUpdates });
    }

    // Audit log
    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'user.update',
      resourceType: 'user',
      resourceId: id,
      newValues: body,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    // Re-fetch and return updated user
    const { data: authData, error: fetchError } = await adminClient.auth.admin.getUserById(id);
    if (fetchError || !authData?.user) return serverError('Failed to re-fetch user after update');

    const [profileRes, rolesRes] = await Promise.all([
      adminClient.from('profiles').select('display_name, avatar_url').eq('id', id).single(),
      adminClient
        .from('user_roles')
        .select('roles!inner(id, name, description)')
        .eq('user_id', id),
    ]);

    return NextResponse.json({
      data: mapUserToResponse(
        authData.user,
        profileRes.data,
        (rolesRes.data ?? []).map((r: any) => r.roles)
      ),
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to update user');
  }
}

// DELETE /api/users/[id] - Delete user
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  if (id === adminUser.id) {
    return badRequest('Cannot delete your own account');
  }

  try {
    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'user.delete',
      resourceType: 'user',
      resourceId: id,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    const { error } = await adminClient.auth.admin.deleteUser(id);
    if (error) return serverError(error.message);

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to delete user');
  }
}
