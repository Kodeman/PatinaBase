import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// GET /api/users/[id]/sessions - Get user sessions
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  try {
    // Query sessions from auth schema via service role RPC
    // The auth.sessions table is not directly accessible via PostgREST,
    // so we use a raw SQL query through rpc or return user factor info
    const { data: authUser, error: userError } = await adminClient.auth.admin.getUserById(id);
    if (userError) return serverError(userError.message);

    // Return user's factor information as session proxy
    const factors = authUser.user?.factors ?? [];
    const sessions = factors.map((f: any) => ({
      id: f.id,
      userId: id,
      factorType: f.factor_type,
      status: f.status,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    }));

    return NextResponse.json({ data: sessions });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to get sessions');
  }
}

// DELETE /api/users/[id]/sessions - Revoke all user sessions
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  try {
    // Force session invalidation by updating app_metadata
    const { error } = await adminClient.auth.admin.updateUserById(id, {
      app_metadata: { sessions_revoked_at: new Date().toISOString() },
    });

    if (error) return serverError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'user.sessions.revoke_all',
      resourceType: 'user',
      resourceId: id,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to revoke sessions');
  }
}
