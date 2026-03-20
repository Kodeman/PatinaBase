import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// POST /api/users/[id]/ban - Permanently ban user
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  if (id === adminUser.id) {
    return badRequest('Cannot ban your own account');
  }

  let reason: string | undefined;
  try {
    const body = await request.json();
    reason = body.reason;
  } catch {
    // no body is fine
  }

  try {
    const { error } = await adminClient.auth.admin.updateUserById(id, {
      ban_duration: '876000h', // ~100 years
    });
    if (error) return serverError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'user.ban',
      resourceType: 'user',
      resourceId: id,
      newValues: { reason },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to ban user');
  }
}
