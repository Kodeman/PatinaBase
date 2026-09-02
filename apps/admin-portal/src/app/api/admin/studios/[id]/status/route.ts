import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, createAuditLog, badRequest, serverError, getClientIp } from '@/lib/supabase-admin';
import { mapStudioRpcError } from '../../_lib';

const ALLOWED_STATUSES = ['active', 'suspended', 'deactivated'] as const;

// POST /api/admin/studios/[id]/status — admin_set_studio_status.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  let body: { status?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const status = body.status?.trim();
  if (!status) return badRequest('status is required');
  if (status === 'pending_approval') {
    return badRequest('pending_approval is not a settable status via this route');
  }
  if (!(ALLOWED_STATUSES as readonly string[]).includes(status)) {
    return badRequest('status must be one of active, suspended, deactivated');
  }

  const reason = body.reason?.trim() || undefined;

  try {
    const { data, error } = await adminClient.rpc('admin_set_studio_status', {
      p_actor: adminUser.id,
      p_org_id: id,
      p_status: status as 'active' | 'suspended' | 'deactivated',
    });
    if (error) return mapStudioRpcError(error.message);

    const actionByStatus: Record<string, string> = {
      suspended: 'studio.suspend',
      active: 'studio.reactivate',
      deactivated: 'studio.deactivate',
    };

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: actionByStatus[status] ?? 'studio.set_status',
      resourceType: 'organization',
      resourceId: id,
      organizationId: id,
      newValues: { status },
      metadata: reason ? { reason } : undefined,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to set studio status');
  }
}
