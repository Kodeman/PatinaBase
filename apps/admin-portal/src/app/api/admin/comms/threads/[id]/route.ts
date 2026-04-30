import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, notFound, serverError } from '@/lib/supabase-admin';

export interface AdminThreadDetail {
  id: string;
  kind: 'direct' | 'project' | 'vendor_brief' | 'support';
  title: string | null;
  projectId: string | null;
  proposalId: string | null;
  createdAt: string;
  lastMessageAt: string;
  participants: Array<{
    profileId: string;
    role: 'designer' | 'client' | 'vendor' | 'admin';
    displayName: string | null;
    email: string | null;
    joinedAt: string;
    leftAt: string | null;
    lastReadAt: string;
  }>;
  messages: Array<{
    id: string;
    senderId: string | null;
    senderName: string | null;
    body: string;
    system: boolean;
    deletedAt: string | null;
    editedAt: string | null;
    createdAt: string;
    attachmentCount: number;
  }>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const { id } = await params;

  try {
    const [threadRes, participantsRes, messagesRes] = await Promise.all([
      adminClient
        .from('comms_threads')
        .select('id, kind, title, project_id, proposal_id, created_at, last_message_at')
        .eq('id', id)
        .maybeSingle(),
      adminClient
        .from('comms_thread_participants')
        .select(
          `
          profile_id, role, joined_at, left_at, last_read_at,
          profiles:profile_id ( display_name, email )
          `,
        )
        .eq('thread_id', id),
      adminClient
        .from('comms_messages')
        .select(
          `
          id, sender_id, body, system, deleted_at, edited_at, created_at, attachments,
          profiles:sender_id ( display_name )
          `,
        )
        .eq('thread_id', id)
        .order('created_at', { ascending: true })
        .limit(500),
    ]);

    if (threadRes.error) throw threadRes.error;
    if (!threadRes.data) return notFound(`Thread ${id} not found`);
    if (participantsRes.error) throw participantsRes.error;
    if (messagesRes.error) throw messagesRes.error;

    type ThreadRow = {
      id: string;
      kind: AdminThreadDetail['kind'];
      title: string | null;
      project_id: string | null;
      proposal_id: string | null;
      created_at: string;
      last_message_at: string;
    };

    type ParticipantRow = {
      profile_id: string;
      role: 'designer' | 'client' | 'vendor' | 'admin';
      joined_at: string;
      left_at: string | null;
      last_read_at: string;
      profiles: { display_name: string | null; email: string | null } | null;
    };

    type MessageRow = {
      id: string;
      sender_id: string | null;
      body: string;
      system: boolean;
      deleted_at: string | null;
      edited_at: string | null;
      created_at: string;
      attachments: unknown[] | null;
      profiles: { display_name: string | null } | null;
    };

    const t = threadRes.data as unknown as ThreadRow;

    const detail: AdminThreadDetail = {
      id: t.id,
      kind: t.kind,
      title: t.title,
      projectId: t.project_id,
      proposalId: t.proposal_id,
      createdAt: t.created_at,
      lastMessageAt: t.last_message_at,
      participants: ((participantsRes.data ?? []) as unknown as ParticipantRow[]).map((p) => ({
        profileId: p.profile_id,
        role: p.role,
        displayName: p.profiles?.display_name ?? null,
        email: p.profiles?.email ?? null,
        joinedAt: p.joined_at,
        leftAt: p.left_at,
        lastReadAt: p.last_read_at,
      })),
      messages: ((messagesRes.data ?? []) as unknown as MessageRow[]).map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        senderName: m.profiles?.display_name ?? null,
        body: m.body,
        system: m.system,
        deletedAt: m.deleted_at,
        editedAt: m.edited_at,
        createdAt: m.created_at,
        attachmentCount: Array.isArray(m.attachments) ? m.attachments.length : 0,
      })),
    };

    return NextResponse.json({ data: detail });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load thread');
  }
}
