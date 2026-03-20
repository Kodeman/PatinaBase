import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// POST /api/users/[id]/suspend - Suspend user (temporary ban)
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  if (id === adminUser.id) {
    return badRequest('Cannot suspend your own account');
  }

  let reason: string | undefined;
  try {
    const body = await request.json();
    reason = body.reason;
  } catch {
    // no body is fine
  }

  try {
    // Suspend = temporary ban (30 days)
    const { error } = await adminClient.auth.admin.updateUserById(id, {
      ban_duration: '720h',
    });
    if (error) return serverError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'user.suspend',
      resourceType: 'user',
      resourceId: id,
      newValues: { reason },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to suspend user');
  }
}
