import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { VendorPipeline } from '@patina/types';

type PipelineMetrics = VendorPipeline.PipelineMetrics;

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;

  try {
    const [{ data: vendors, error: vErr }, { count: activeTasks, error: tErr }] =
      await Promise.all([
        db.from('pipeline_vendors').select('stage, triage_level, awaiting_leah_review'),
        db
          .from('cowork_tasks')
          .select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'picked_up', 'running']),
      ]);
    if (vErr) throw vErr;
    if (tErr) throw tErr;

    const byTriage: PipelineMetrics['by_triage'] = { green: 0, yellow: 0, orange: 0, red: 0 };
    const byStage: PipelineMetrics['by_stage'] = {
      discovery: 0,
      qualification: 0,
      outreach: 0,
      negotiation: 0,
      onboarding: 0,
      live: 0,
      paused: 0,
      rejected: 0,
    };
    let awaitingLeah = 0;

    for (const v of (vendors ?? []) as Array<{
      stage: string;
      triage_level: string | null;
      awaiting_leah_review: boolean | null;
    }>) {
      if (v.triage_level && v.triage_level in byTriage) {
        byTriage[v.triage_level as keyof typeof byTriage] += 1;
      }
      if (v.stage && v.stage in byStage) {
        byStage[v.stage as keyof typeof byStage] += 1;
      }
      if (v.awaiting_leah_review) awaitingLeah += 1;
    }

    const metrics: PipelineMetrics = {
      total_vendors: vendors?.length ?? 0,
      by_triage: byTriage,
      by_stage: byStage,
      awaiting_leah: awaitingLeah,
      active_cowork_tasks: activeTasks ?? 0,
      live_partners: byStage.live,
    };

    return NextResponse.json({ data: metrics });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load metrics');
  }
}
