import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, createAuditLog, badRequest, serverError, getClientIp } from '@/lib/supabase-admin';
import { mapStudioRpcError } from '../../_lib';

// POST /api/admin/studios/[id]/transfer-ownership — admin_transfer_studio_ownership.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  let body: { newOwnerUserId?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const newOwnerUserId = body.newOwnerUserId?.trim();
  if (!newOwnerUserId) return badRequest('newOwnerUserId is required');

  try {
    const { error } = await adminClient.rpc('admin_transfer_studio_ownership', {
      p_actor: adminUser.id,
      p_org_id: id,
      p_new_owner: newOwnerUserId,
    });
    if (error) return mapStudioRpcError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'studio.transfer_ownership',
      resourceType: 'organization',
      resourceId: id,
      organizationId: id,
      newValues: { newOwnerUserId },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to transfer studio ownership');
  }
}
