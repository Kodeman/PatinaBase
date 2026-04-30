import { NextRequest, NextResponse } from 'next/server';
import {
  badRequest,
  createAuditLog,
  getAuthenticatedAdmin,
  getClientIp,
  notFound,
  serverError,
} from '@/lib/supabase-admin';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient, user } = auth;

  const { id } = await params;

  let body: { action?: 'approve' | 'unapprove'; notes?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (body.action !== 'approve' && body.action !== 'unapprove') {
    return badRequest('action must be "approve" or "unapprove"');
  }

  try {
    const { data: before, error: beforeErr } = await adminClient
      .from('account_deletion_requests')
      .select('id, status, approved_at')
      .eq('id', id)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before) return notFound(`Deletion request ${id} not found`);

    const updates =
      body.action === 'approve'
        ? {
            approved_at: new Date().toISOString(),
            approved_by: user.id,
            notes: body.notes ?? null,
          }
        : { approved_at: null, approved_by: null };

    const { error: updErr } = await adminClient
      .from('account_deletion_requests')
      .update(updates as unknown as never)
      .eq('id', id);
    if (updErr) throw updErr;

    await createAuditLog(adminClient, {
      userId: user.id,
      action:
        body.action === 'approve' ? 'privacy.deletion.approve' : 'privacy.deletion.unapprove',
      resourceType: 'account_deletion_request',
      resourceId: id,
      newValues: updates as Record<string, unknown>,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to update deletion request');
  }
}
