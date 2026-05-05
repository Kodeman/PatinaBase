import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@patina/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MarkReadBody {
  ids?: string[] | 'all';
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 }
    );
  }

  let body: MarkReadBody;
  try {
    body = (await request.json()) as MarkReadBody;
  } catch {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const ids = body.ids;
  if (!ids || (Array.isArray(ids) && ids.length === 0)) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'ids must be a non-empty array or "all"' },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const readAt = new Date().toISOString();

  let targetIds: string[] = [];
  if (ids === 'all') {
    const { data, error } = await service
      .from('notification_log')
      .select('id, metadata')
      .eq('user_id', user.id);
    if (error) {
      return NextResponse.json(
        { error: 'SERVER_ERROR', message: error.message },
        { status: 500 }
      );
    }
    targetIds = (data ?? [])
      .filter((row) => {
        const md = (row.metadata ?? {}) as Record<string, unknown>;
        return !md.read_at;
      })
      .map((row) => row.id);
  } else {
    const { data, error } = await service
      .from('notification_log')
      .select('id, metadata')
      .eq('user_id', user.id)
      .in('id', ids);
    if (error) {
      return NextResponse.json(
        { error: 'SERVER_ERROR', message: error.message },
        { status: 500 }
      );
    }
    targetIds = (data ?? []).map((row) => row.id);
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ data: { updated: 0 } });
  }

  const { data: existing, error: fetchErr } = await service
    .from('notification_log')
    .select('id, metadata')
    .in('id', targetIds);
  if (fetchErr) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: fetchErr.message },
      { status: 500 }
    );
  }

  let updated = 0;
  for (const row of existing ?? []) {
    const md = ((row.metadata ?? {}) as Record<string, unknown>) ?? {};
    const merged = { ...md, read_at: readAt };
    const { error: upErr } = await service
      .from('notification_log')
      .update({ metadata: merged })
      .eq('id', row.id)
      .eq('user_id', user.id);
    if (!upErr) updated += 1;
  }

  return NextResponse.json({ data: { updated, read_at: readAt } });
}
