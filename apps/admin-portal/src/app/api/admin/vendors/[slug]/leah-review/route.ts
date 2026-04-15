import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  badRequest,
  notFound,
  serverError,
} from '@/lib/supabase-admin';
import { VendorPipeline } from '@patina/types';

const { RUBRIC_DIMENSIONS, computeTriageLevel } = VendorPipeline;

// TODO: remove LooseClient once generated Supabase types include pipeline tables.
type LooseClient = { from: (table: string) => any };

interface LeahScoreInput {
  dimension: number;
  raw_score: number;
  evidence?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as unknown as LooseClient;

  const { slug } = await params;

  let body: { scores?: LeahScoreInput[]; leah_notes?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (!Array.isArray(body.scores) || body.scores.length === 0) {
    return badRequest('scores array is required');
  }

  for (const score of body.scores) {
    if (![5, 6, 7, 8].includes(score.dimension)) {
      return badRequest(`Dimension ${score.dimension} is not owned by Leah (must be 5–8)`);
    }
    if (!Number.isInteger(score.raw_score) || score.raw_score < 1 || score.raw_score > 5) {
      return badRequest(`raw_score for dim ${score.dimension} must be 1–5`);
    }
  }

  try {
    const { data: vendor } = await db
      .from('pipeline_vendors')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!vendor) return notFound(`Vendor "${slug}" not found`);

    const vendorId = vendor.id as string;
    const now = new Date().toISOString();

    const rows = body.scores.map((s) => {
      const def = RUBRIC_DIMENSIONS.find((d) => d.dimension === s.dimension)!;
      return {
        vendor_id: vendorId,
        dimension: s.dimension,
        dimension_name: def.name,
        weight: def.weight,
        raw_score: s.raw_score,
        scored_by: 'leah' as const,
        scored_at: now,
        evidence: s.evidence ?? null,
      };
    });

    const { error: upsertErr } = await db
      .from('pipeline_vendor_scores')
      .upsert(rows, { onConflict: 'vendor_id,dimension' });
    if (upsertErr) throw upsertErr;

    const { data: allScores } = await db
      .from('pipeline_vendor_scores')
      .select('dimension, weighted_score, scored_by')
      .eq('vendor_id', vendorId);

    const total = (allScores ?? []).reduce(
      (sum: number, s: any) => sum + (s.weighted_score ?? 0),
      0,
    );
    const triage = computeTriageLevel(total);
    const kodyDims = new Set(
      (allScores ?? [])
        .filter((s: any) => s.scored_by === 'cowork' || s.scored_by === 'kody')
        .map((s: any) => s.dimension),
    );
    const leahDims = new Set(
      (allScores ?? [])
        .filter((s: any) => s.scored_by === 'leah')
        .map((s: any) => s.dimension),
    );

    const updates: Record<string, unknown> = {
      total_score: total,
      triage_level: triage,
      scored_by_kody: kodyDims.size >= 4,
      scored_by_leah: leahDims.size >= 4,
      awaiting_leah_review: kodyDims.size >= 4 && leahDims.size < 4,
    };
    if (typeof body.leah_notes === 'string') {
      updates.leah_notes = body.leah_notes;
    }

    const { error: vendorErr } = await db
      .from('pipeline_vendors')
      .update(updates)
      .eq('id', vendorId);
    if (vendorErr) throw vendorErr;

    return NextResponse.json({ data: { ok: true, total_score: total, triage_level: triage } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to submit review');
  }
}
