import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// DELETE /api/users/[id]/sessions/[sessionId] - Revoke a single user session.
// GET /api/users/[id]/sessions returns the user's MFA factors as a session
// proxy (see sibling route.ts) — sessionId here is that factor id.
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; sessionId: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id, sessionId } = await context.params;

  try {
    const { error } = await (
      adminClient.auth.admin as unknown as {
        mfa: {
          deleteFactor: (args: {
            id: string;
            userId: string;
          }) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      }
    ).mfa.deleteFactor({ id: sessionId, userId: id });

    if (error) return serverError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'user.sessions.revoke',
      resourceType: 'user',
      resourceId: id,
      metadata: { sessionId },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to revoke session');
  }
}
