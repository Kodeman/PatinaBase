import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { createAgentQueue, type QueueStat } from '@patina/agent-queue';

// GET /api/admin/agent-tasks/stats — per-status counts + oldest_created_at,
// straight from the agent_queue_stats() RPC. Powers the inbox tab counts.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const queue = createAgentQueue(auth.adminClient);

  try {
    const stats: QueueStat[] = await queue.stats();
    return NextResponse.json({ data: stats });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load queue stats');
  }
}
