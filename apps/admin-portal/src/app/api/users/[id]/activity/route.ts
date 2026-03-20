import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// GET /api/users/[id]/activity - Get user activity (audit logs)
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));

  try {
    const { count } = await adminClient
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id);

    const { data, error } = await adminClient
      .from('audit_logs')
      .select('*')
      .eq('user_id', id)
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
      data: {
        data: entries,
        meta: { total: count ?? 0, limit, offset },
      },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to get user activity');
  }
}
