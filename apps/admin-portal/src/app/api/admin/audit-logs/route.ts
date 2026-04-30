import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

export interface AuditLogRow {
  id: string;
  userId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  status: 'success' | 'failure' | 'denied';
  errorMessage: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogListResponse {
  rows: AuditLogRow[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

const MAX_PAGE_SIZE = 100;

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '50', 10) || 50),
  );
  const q = url.searchParams.get('q')?.trim() || null;
  const action = url.searchParams.get('action')?.trim() || null;
  const resourceType = url.searchParams.get('resourceType')?.trim() || null;
  const statusParam = url.searchParams.get('status')?.trim() || null;
  const status =
    statusParam === 'success' || statusParam === 'failure' || statusParam === 'denied'
      ? statusParam
      : null;
  const userId = url.searchParams.get('userId')?.trim() || null;
  const from = url.searchParams.get('from')?.trim() || null;
  const to = url.searchParams.get('to')?.trim() || null;

  const offset = (page - 1) * pageSize;

  try {
    let query = adminClient
      .from('audit_logs')
      .select(
        `
        id,
        user_id,
        action,
        resource_type,
        resource_id,
        status,
        error_message,
        ip_address,
        metadata,
        created_at,
        profiles:user_id ( id, email, display_name )
        `,
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (action) query = query.eq('action', action);
    if (resourceType) query = query.eq('resource_type', resourceType);
    if (status) query = query.eq('status', status);
    if (userId) query = query.eq('user_id', userId);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    if (q) {
      // OR-search across action, resource_type, resource_id (free-text)
      const escaped = q.replace(/[%,]/g, ' ').slice(0, 100);
      query = query.or(
        `action.ilike.%${escaped}%,resource_type.ilike.%${escaped}%,resource_id.ilike.%${escaped}%`,
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    type Row = {
      id: string;
      user_id: string | null;
      action: string;
      resource_type: string;
      resource_id: string | null;
      status: 'success' | 'failure' | 'denied';
      error_message: string | null;
      ip_address: unknown;
      metadata: Record<string, unknown> | null;
      created_at: string;
      profiles: { id: string; email: string | null; display_name: string | null } | null;
    };

    const rows: AuditLogRow[] = ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      userId: r.user_id,
      actorEmail: r.profiles?.email ?? null,
      actorName: r.profiles?.display_name ?? null,
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      status: r.status,
      errorMessage: r.error_message,
      ipAddress: r.ip_address ? String(r.ip_address) : null,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));

    const payload: AuditLogListResponse = {
      rows,
      meta: { total: count ?? 0, page, pageSize },
    };

    return NextResponse.json({ data: payload });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load audit logs');
  }
}
