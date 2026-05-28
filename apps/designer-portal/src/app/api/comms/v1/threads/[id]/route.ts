import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

interface MessageRow {
  id: string;
  thread_id: string;
  sender_id: string | null;
  body: string;
  attachments: unknown[];
  reply_to_message_id: string | null;
  decision_id: string | null;
  mentions: string[];
  system: boolean;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  sender: { id: string; display_name: string | null; email: string | null } | null;
}

function toCamelMessage(m: MessageRow) {
  return {
    id: m.id,
    threadId: m.thread_id,
    senderId: m.sender_id,
    senderName: m.sender?.display_name ?? null,
    body: m.deleted_at ? '' : m.body,
    bodyText: m.deleted_at ? '' : m.body,
    attachments: m.attachments ?? [],
    replyToMessageId: m.reply_to_message_id,
    decisionId: m.decision_id,
    mentions: m.mentions ?? [],
    system: m.system,
    createdAt: m.created_at,
    editedAt: m.edited_at,
    deletedAt: m.deleted_at,
  };
}

// GET /api/comms/v1/threads/:id - Thread detail with messages (RLS-scoped).
export async function GET(
  _request: NextRequest,
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

    const { data: thread, error: threadError } = await supabase
      .from('comms_threads')
      .select(
        `
        id, kind, title, project_id, proposal_id, created_at, updated_at, last_message_at,
        participants:comms_thread_participants(
          profile_id, role,
          profiles:profile_id ( display_name, email )
        )
      `
      )
      .eq('id', id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const { data: messages, error: messagesError } = await supabase
      .from('comms_messages')
      .select(
        `
        id, thread_id, sender_id, body, attachments, reply_to_message_id,
        decision_id, mentions, system, created_at, edited_at, deleted_at,
        sender:sender_id ( id, display_name, email )
      `
      )
      .eq('thread_id', id)
      .order('created_at', { ascending: true });

    if (messagesError) {
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }

    const data = {
      id: thread.id,
      kind: thread.kind,
      title: thread.title,
      projectId: thread.project_id,
      proposalId: thread.proposal_id,
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
      lastMessageAt: thread.last_message_at,
      participants: (thread.participants ?? []).map((p: any) => ({
        profileId: p.profile_id,
        role: p.role,
        displayName: p.profiles?.display_name ?? null,
        email: p.profiles?.email ?? null,
      })),
      messages: ((messages ?? []) as MessageRow[]).map(toCamelMessage),
    };

    // api-client unwraps { data: X } → returns the thread object
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[API] GET /comms/v1/threads/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
