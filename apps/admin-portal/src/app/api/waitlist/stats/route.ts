import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// GET /api/waitlist/stats - Aggregate waitlist statistics
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  try {
    const { data, error } = await adminClient
      .from('waitlist')
      .select('source, role, converted_at, qualification_stage, next_follow_up_at');

    if (error) return serverError(error.message);

    const rows = data ?? [];
    const now = new Date();

    const stats = {
      total: rows.length,
      bySource: {} as Record<string, number>,
      byRole: {} as Record<string, number>,
      byStage: {
        new: 0,
        contacted: 0,
        qualified: 0,
        nurture: 0,
        converted: 0,
        disqualified: 0,
      } as Record<string, number>,
      converted: 0,
      unconverted: 0,
      overdueFollowUps: 0,
    };

    for (const row of rows) {
      const r = row as any;
      const src = r.source as string;
      const rl = r.role as string;
      const stage = (r.qualification_stage ?? 'new') as string;
      const isConverted = r.converted_at !== null;
      const followUp = r.next_follow_up_at ? new Date(r.next_follow_up_at) : null;

      stats.bySource[src] = (stats.bySource[src] || 0) + 1;
      stats.byRole[rl] = (stats.byRole[rl] || 0) + 1;
      stats.byStage[stage] = (stats.byStage[stage] || 0) + 1;

      if (isConverted) stats.converted++;
      else stats.unconverted++;

      if (followUp && followUp < now && stage !== 'converted' && stage !== 'disqualified') {
        stats.overdueFollowUps++;
      }
    }

    return NextResponse.json({ data: stats });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to get waitlist stats');
  }
}
