import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// POST /api/comms/v1/threads/:id/read - Mark a thread read for the caller.
// Delegates to rpc_mark_thread_read which bumps the caller's last_read_at.
// The client passes { lastReadMessageId } but the RPC marks-read-to-now,
// which is the v1 semantic in migration 00103.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet updated for comms tables
    const supabase: any = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Accept (and ignore) the lastReadMessageId body field for forward-compat.
    let lastReadMessageId: string | null = null;
    try {
      const body = await request.json();
      lastReadMessageId = body?.lastReadMessageId ?? null;
    } catch {
      // empty body is fine
    }

    const { data, error } = await supabase.rpc('rpc_mark_thread_read', {
      p_thread_id: id,
    });

    if (error) {
      console.error('[API] rpc_mark_thread_read error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      data: { threadId: id, marked: data === true, lastReadMessageId },
    });
  } catch (error) {
    console.error('[API] POST /comms/v1/threads/[id]/read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
