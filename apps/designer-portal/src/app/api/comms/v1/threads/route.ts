import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

type ThreadKind = 'direct' | 'project' | 'vendor_brief' | 'support';

interface ThreadParticipantRow {
  profile_id: string;
  role: 'designer' | 'client' | 'vendor' | 'admin';
  profiles: { display_name: string | null; email: string | null } | null;
}

interface ThreadRow {
  id: string;
  kind: ThreadKind;
  title: string | null;
  project_id: string | null;
  proposal_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  participants: ThreadParticipantRow[] | null;
}

function toCamelThread(t: ThreadRow) {
  return {
    id: t.id,
    kind: t.kind,
    title: t.title,
    projectId: t.project_id,
    proposalId: t.proposal_id,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    lastMessageAt: t.last_message_at,
    participantCount: t.participants?.length ?? 0,
    participants: (t.participants ?? []).map((p) => ({
      profileId: p.profile_id,
      role: p.role,
      displayName: p.profiles?.display_name ?? null,
      email: p.profiles?.email ?? null,
    })),
  };
}

// GET /api/comms/v1/threads - List threads the authed user participates in.
// RLS scopes rows to the caller's threads. Optional `scope` param:
//   - `project:<id>` filters to that project's threads
//   - anything else returns all of the user's threads
export async function GET(request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet updated for comms tables
    const supabase: any = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100);

    let query = supabase
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
      .order('last_message_at', { ascending: false })
      .limit(limit);

    if (scope?.startsWith('project:')) {
      const projectId = scope.split(':')[1];
      if (projectId) query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const threads = ((data ?? []) as ThreadRow[]).map(toCamelThread);

    // api-client unwraps { data: X } → returns X (the array of threads)
    return NextResponse.json({ data: threads });
  } catch (error) {
    console.error('[API] GET /comms/v1/threads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
