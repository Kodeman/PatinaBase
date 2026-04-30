import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

export type ThreadKind = 'direct' | 'project' | 'vendor_brief' | 'support';

export interface AdminThreadRow {
  id: string;
  kind: ThreadKind;
  title: string | null;
  projectId: string | null;
  proposalId: string | null;
  createdAt: string;
  lastMessageAt: string;
  participantCount: number;
  participants: Array<{
    profileId: string;
    role: 'designer' | 'client' | 'vendor' | 'admin';
    displayName: string | null;
    email: string | null;
  }>;
}

export interface AdminThreadsListResponse {
  threads: AdminThreadRow[];
  meta: { total: number; page: number; pageSize: number };
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
  const kindParam = url.searchParams.get('kind')?.trim() || null;
  const kind: ThreadKind | null =
    kindParam === 'direct' ||
    kindParam === 'project' ||
    kindParam === 'vendor_brief' ||
    kindParam === 'support'
      ? kindParam
      : null;

  const offset = (page - 1) * pageSize;

  try {
    let query = adminClient
      .from('comms_threads')
      .select(
        `
        id, kind, title, project_id, proposal_id, created_at, last_message_at,
        participants:comms_thread_participants(
          profile_id, role,
          profiles:profile_id ( display_name, email )
        )
        `,
        { count: 'exact' },
      )
      .order('last_message_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (kind) query = query.eq('kind', kind);

    const { data, error, count } = await query;
    if (error) throw error;

    type Row = {
      id: string;
      kind: ThreadKind;
      title: string | null;
      project_id: string | null;
      proposal_id: string | null;
      created_at: string;
      last_message_at: string;
      participants: Array<{
        profile_id: string;
        role: 'designer' | 'client' | 'vendor' | 'admin';
        profiles: { display_name: string | null; email: string | null } | null;
      }> | null;
    };

    const threads: AdminThreadRow[] = ((data ?? []) as unknown as Row[]).map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      projectId: t.project_id,
      proposalId: t.proposal_id,
      createdAt: t.created_at,
      lastMessageAt: t.last_message_at,
      participantCount: t.participants?.length ?? 0,
      participants: (t.participants ?? []).map((p) => ({
        profileId: p.profile_id,
        role: p.role,
        displayName: p.profiles?.display_name ?? null,
        email: p.profiles?.email ?? null,
      })),
    }));

    return NextResponse.json({
      data: { threads, meta: { total: count ?? 0, page, pageSize } } as AdminThreadsListResponse,
    });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load threads');
  }
}
