import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { toInt } from '../../_lib';

// GET /api/admin/studios/[id]/activity — same shape as users/[id]/activity.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  const url = new URL(request.url);
  const limit = toInt(url.searchParams.get('limit'), 20, { min: 1, max: 100 });
  const offset = toInt(url.searchParams.get('offset'), 0, { min: 0, max: Number.MAX_SAFE_INTEGER });

  const orFilter = `organization_id.eq.${id},and(resource_type.eq.organization,resource_id.eq.${id})`;

  try {
    const { count } = await adminClient
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .or(orFilter);

    const { data, error } = await adminClient
      .from('audit_logs')
      .select('*')
      .or(orFilter)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return serverError(error.message);

    const entries = (data ?? []).map((log: any) => ({
      id: log.id,
      actorId: log.user_id,
      action: log.action,
      resourceType: log.resource_type,
      resourceId: log.resource_id,
      timestamp: log.created_at,
      ipAddress: log.ip_address,
      userAgent: log.user_agent,
      result: log.status,
      metadata: log.metadata,
    }));

    return NextResponse.json({
      data: { data: entries, meta: { total: count ?? 0, limit, offset } },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to get studio activity');
  }
}
