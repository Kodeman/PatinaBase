export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, serverError } from '@/lib/admin-api';

type RecipientLogRow = {
  id: string;
  user_id: string;
  status: string;
  opened_at: string | null;
  clicked_at: string | null;
  sent_at: string | null;
  created_at: string;
  error: string | null;
  metadata: Record<string, unknown> | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
};

const ALLOWED_STATUSES = new Set([
  'queued',
  'sending',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'failed',
  'suppressed',
  'unconfirmed',
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const url = req.nextUrl;
  const status = url.searchParams.get('status') || '';
  const search = (url.searchParams.get('search') || '').trim().toLowerCase();
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
  const rawLimit = parseInt(url.searchParams.get('limit') || '50', 10) || 50;
  const limit = Math.min(Math.max(rawLimit, 1), 200);

  try {
    let countQuery = supabase
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .filter('metadata->>campaign_id', 'eq', id);

    if (status && ALLOWED_STATUSES.has(status)) {
      countQuery = countQuery.eq('status', status);
    }

    const { count: totalCount, error: countErr } = await countQuery;
    if (countErr) return serverError(countErr.message);

    let logQuery = supabase
      .from('notification_log')
      .select('id, user_id, status, opened_at, clicked_at, sent_at, created_at, error, metadata')
      .filter('metadata->>campaign_id', 'eq', id)
      .order('created_at', { ascending: false });

    if (status && ALLOWED_STATUSES.has(status)) {
      logQuery = logQuery.eq('status', status);
    }

    const fetchLimit = search ? Math.min(2000, (totalCount ?? 0) || limit) : limit;
    const fetchOffset = search ? 0 : offset;

    const { data: logs, error: logsErr } = await logQuery.range(
      fetchOffset,
      fetchOffset + fetchLimit - 1,
    );
    if (logsErr) return serverError(logsErr.message);

    const rawLogs = (logs as RecipientLogRow[] | null) || [];
    const userIds = Array.from(new Set(rawLogs.map((l) => l.user_id).filter(Boolean)));

    let profilesById = new Map<string, ProfileRow>();
    if (userIds.length > 0) {
      const { data: profiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, email, display_name')
        .in('id', userIds);
      if (profilesErr) return serverError(profilesErr.message);
      profilesById = new Map(
        ((profiles as ProfileRow[] | null) || []).map((p) => [p.id, p]),
      );
    }

    const enriched = rawLogs.map((row) => {
      const profile = profilesById.get(row.user_id);
      const meta = (row.metadata || {}) as Record<string, unknown>;
      return {
        id: row.id,
        user_id: row.user_id,
        email: profile?.email ?? null,
        display_name: profile?.display_name ?? null,
        status: row.status,
        opened_at: row.opened_at,
        clicked_at: row.clicked_at,
        sent_at: row.sent_at,
        created_at: row.created_at,
        error: row.error,
        ab_variant: typeof meta.ab_variant === 'string' ? (meta.ab_variant as string) : null,
      };
    });

    let rows = enriched;
    let total = totalCount ?? enriched.length;

    if (search) {
      const filtered = enriched.filter((r) => {
        const email = (r.email || '').toLowerCase();
        const name = (r.display_name || '').toLowerCase();
        return email.includes(search) || name.includes(search);
      });
      total = filtered.length;
      rows = filtered.slice(offset, offset + limit);
    }

    return NextResponse.json({ rows, total });
  } catch (err) {
    console.error('Campaign recipients API error:', err);
    return serverError('Failed to fetch campaign recipients');
  }
}
