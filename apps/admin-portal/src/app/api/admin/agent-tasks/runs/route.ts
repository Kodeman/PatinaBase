import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import {
  buildRunRows,
  isRunView,
  type AgentTaskSource,
  type JobRunSource,
  type RunView,
} from '@/lib/run-rows';

// GET /api/admin/agent-tasks/runs — the Run Log (WP-1.4, the anti-silent-failure
// surface). UNIONs two sources into one RunRow shape:
//   (a) job_runs (00300)     — every scheduled/background job run.
//   (b) agent_tasks (00297)  — tasks that are job-typed OR in a run status.
// Params: view=all|jobs|agents|failed|stale (default all), limit clamped ≤100.
// The union/mapping/ordering/view-filter is the pure buildRunRows() in
// @/lib/run-rows — this route only authenticates, fetches, and shapes.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const url = new URL(request.url);
  const viewParam = url.searchParams.get('view');
  const view: RunView = isRunView(viewParam) ? viewParam : 'all';

  const limitParam = url.searchParams.get('limit');
  const limit = limitParam
    ? Math.min(100, Math.max(1, parseInt(limitParam, 10) || 100))
    : 100;

  try {
    const [jobsRes, agentsRes] = await Promise.all([
      adminClient
        .from('job_runs')
        .select('id,job_name,status,started_at,finished_at,error,cost_usd')
        .order('started_at', { ascending: false })
        .limit(limit),
      adminClient
        .from('agent_tasks')
        .select(
          'id,task_type,status,source,attempts,max_attempts,started_at,completed_at,last_error,artifacts,parent_task_id,flagged_stale_at',
        )
        // Run-relevant agent tasks: job-typed, OR in a run status, OR flagged
        // stale by queue-groom (stale tasks are awaiting_review, so they must be
        // fetched explicitly or the Stale view would be empty). PostgREST `like`
        // uses * as the wildcard.
        .or('task_type.like.job:*,status.in.(running,done,failed),flagged_stale_at.not.is.null')
        .order('started_at', { ascending: false, nullsFirst: false })
        .limit(limit),
    ]);

    if (jobsRes.error) return serverError(jobsRes.error.message);
    if (agentsRes.error) return serverError(agentsRes.error.message);

    const data = buildRunRows({
      jobRuns: (jobsRes.data ?? []) as unknown as JobRunSource[],
      agentTasks: (agentsRes.data ?? []) as unknown as AgentTaskSource[],
      view,
      limit,
    });

    return NextResponse.json({ data });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to list runs');
  }
}
