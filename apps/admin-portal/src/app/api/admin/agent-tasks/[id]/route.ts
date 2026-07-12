import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, notFound, serverError } from '@/lib/supabase-admin';
import type { AgentTask } from '@patina/agent-queue';

// GET /api/admin/agent-tasks/[id] — one task by id. The queue data layer has no
// get-by-id, so this reads the row directly via the service-role admin client
// (RLS is bypassed; admin-gate already enforced by getAuthenticatedAdmin).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  try {
    const { data, error } = await auth.adminClient
      .from('agent_tasks')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) return serverError(error.message);
    if (!data) return notFound(`agent task ${id} not found`);

    return NextResponse.json({ data: data as AgentTask });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load agent task');
  }
}
