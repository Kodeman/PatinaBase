import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

interface MessageRow {
  id: string;
  thread_id: string;
  sender_id: string | null;
  body: string;
  attachments: unknown[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

function toCamelMessage(m: MessageRow) {
  return {
    id: m.id,
    threadId: m.thread_id,
    senderId: m.sender_id,
    body: m.body,
    bodyText: m.body,
    attachments: m.attachments ?? [],
    createdAt: m.created_at,
    editedAt: m.edited_at,
    deletedAt: m.deleted_at,
  };
}

// POST /api/comms/v1/threads/:id/messages - Post a message to a thread.
// RLS enforces sender_id = auth.uid() and active-participant membership.
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

    const body = await request.json();
    const text: string = body.bodyText ?? body.bodyMd ?? '';

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
    }

    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    const { data, error } = await supabase
      .from('comms_messages')
      .insert({
        thread_id: id,
        sender_id: user.id,
        body: text,
        attachments,
      })
      .select('id, thread_id, sender_id, body, attachments, created_at, edited_at, deleted_at')
      .single();

    if (error) {
      console.error('[API] Create comms message error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: toCamelMessage(data as MessageRow) }, { status: 201 });
  } catch (error) {
    console.error('[API] POST /comms/v1/threads/[id]/messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
