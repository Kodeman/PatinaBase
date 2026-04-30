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

export interface FunnelStepRow {
  step: string;
  stepOrder: number;
  usersAtStep: number;
  usersAtPreviousStep: number | null;
  conversionRatePercent: number | null;
}

export interface DecisionAnalyticsResponse {
  bottleneckPhases: BottleneckPhaseRow[];
  funnel: FunnelStepRow[];
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  try {
    const [bottleneckRes, funnelRes] = await Promise.all([
      (adminClient.rpc as unknown as (
        fn: string,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)(
        'get_decision_bottleneck_phases_admin',
      ),
      (adminClient.from as unknown as (
        t: string,
      ) => {
        select: (
          cols: string,
        ) => {
          order: (col: string) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      })('conversion_funnel')
        .select('*')
        .order('step_order'),
    ]);

    if (bottleneckRes.error) throw new Error(bottleneckRes.error.message);
    if (funnelRes.error) throw new Error(funnelRes.error.message);

    type RawBottleneck = {
      linked_phase: string;
      total_count: number | string;
      overdue_count: number | string;
      pending_count: number | string;
      responded_count: number | string;
      avg_response_hours: number | string;
    };

    type RawFunnel = {
      step: string;
      step_order: number;
      users_at_step: number | string;
      users_at_previous_step: number | string | null;
      conversion_rate_percent: number | string | null;
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

    const funnel: FunnelStepRow[] = ((funnelRes.data ?? []) as RawFunnel[]).map((r) => ({
      step: r.step,
      stepOrder: r.step_order,
      usersAtStep: Number(r.users_at_step),
      usersAtPreviousStep:
        r.users_at_previous_step === null ? null : Number(r.users_at_previous_step),
      conversionRatePercent:
        r.conversion_rate_percent === null ? null : Number(r.conversion_rate_percent),
    }));

    const payload: DecisionAnalyticsResponse = { bottleneckPhases, funnel };
    return NextResponse.json({ data: payload });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load decision analytics');
  }
}
