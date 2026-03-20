import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// POST /api/users/[id]/activate - Reactivate a suspended/banned user
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  try {
    const { error } = await adminClient.auth.admin.updateUserById(id, {
      ban_duration: 'none',
    });
    if (error) return serverError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'user.activate',
      resourceType: 'user',
      resourceId: id,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to activate user');
  }
}
