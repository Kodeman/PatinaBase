export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyAdmin,
  unauthorized,
  serverError,
} from '@/lib/admin-api';

export interface DlqRow {
  id: string;
  user_id: string;
  type: string;
  channel: 'email' | 'push' | 'in_app' | 'sms';
  status: string;
  template_id: string | null;
  metadata: Record<string, unknown> | null;
  error: string | null;
  retry_count: number;
  provider_id: string | null;
  created_at: string;
  recipient_email: string | null;
  recipient_name: string | null;
  replayed_at: string | null;
  replay_invocation_id: string | null;
}

export interface DlqListResponse {
  rows: DlqRow[];
  total: number;
  limit: number;
  offset: number;
}

export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 50), 1), 200);
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0);
  const since = searchParams.get('since');
  const type = searchParams.get('type');

  let query = supabase
    .from('notification_log')
    .select(
      `id, user_id, type, channel, status, template_id, metadata, error,
       retry_count, provider_id, created_at,
       profiles!inner(email, display_name)`,
      { count: 'exact' },
    )
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (since) query = query.gte('created_at', since);
  if (type) query = query.eq('type', type);

  const { data, error, count } = await query;
  if (error) return serverError(error.message);

  const rows: DlqRow[] = (data ?? []).map((row: any) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      user_id: row.user_id,
      type: row.type,
      channel: row.channel,
      status: row.status,
      template_id: row.template_id,
      metadata,
      error: row.error,
      retry_count: row.retry_count ?? 0,
      provider_id: row.provider_id,
      created_at: row.created_at,
      recipient_email: profile?.email ?? null,
      recipient_name: profile?.display_name ?? null,
      replayed_at: (metadata.replayed_at as string | undefined) ?? null,
      replay_invocation_id:
        (metadata.replay_invocation_id as string | undefined) ?? null,
    };
  });

  const response: DlqListResponse = {
    rows,
    total: count ?? 0,
    limit,
    offset,
  };
  return NextResponse.json(response);
}
