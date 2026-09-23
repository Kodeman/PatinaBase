import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

export interface BottleneckPhaseRow {
  linkedPhase: string;
  totalCount: number;
  overdueCount: number;
  pendingCount: number;
  respondedCount: number;
  avgResponseHours: number;
}

// The funnel view this route used to read was retired in 2026-09 (migration
// 00657), so this response no longer carries a `funnel` array. Readers must show
// an explicit unavailable state rather than an empty funnel, which reads as a
// real zero.
export interface DecisionAnalyticsResponse {
  bottleneckPhases: BottleneckPhaseRow[];
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  try {
    const bottleneckRes = await (adminClient.rpc as unknown as (
      fn: string,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)(
      'get_decision_bottleneck_phases_admin',
    );

    if (bottleneckRes.error) throw new Error(bottleneckRes.error.message);

    type RawBottleneck = {
      linked_phase: string;
      total_count: number | string;
      overdue_count: number | string;
      pending_count: number | string;
      responded_count: number | string;
      avg_response_hours: number | string;
    };

    const bottleneckPhases: BottleneckPhaseRow[] = ((bottleneckRes.data ?? []) as RawBottleneck[]).map(
      (r) => ({
        linkedPhase: r.linked_phase,
        totalCount: Number(r.total_count),
        overdueCount: Number(r.overdue_count),
        pendingCount: Number(r.pending_count),
        respondedCount: Number(r.responded_count),
        avgResponseHours: Number(r.avg_response_hours),
      }),
    );

    const payload: DecisionAnalyticsResponse = { bottleneckPhases };
    return NextResponse.json({ data: payload });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load decision analytics');
  }
}
