import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  badRequest,
  notFound,
  serverError,
} from '@/lib/supabase-admin';
import { VendorPipeline } from '@patina/types';

const { RUBRIC_DIMENSIONS, computeTriageLevel } = VendorPipeline;
type ScoreDimension = VendorPipeline.ScoreDimension;
type ScoredBy = VendorPipeline.ScoredBy;

// TODO: remove LooseClient once generated Supabase types include pipeline tables.
type LooseClient = { from: (table: string) => any };

async function recomputeVendorAggregates(db: LooseClient, vendorId: string) {
  const { data: scores } = await db
    .from('pipeline_vendor_scores')
    .select('dimension, weighted_score, scored_by')
    .eq('vendor_id', vendorId);

  if (!scores) return;

  const total = scores.reduce(
    (sum: number, s: any) => sum + (s.weighted_score ?? 0),
    0,
  );
  const triage = computeTriageLevel(total);

  const kodyDims = new Set(
    scores
      .filter((s: any) => s.scored_by === 'cowork' || s.scored_by === 'kody')
      .map((s: any) => s.dimension),
  );
  const leahDims = new Set(
    scores.filter((s: any) => s.scored_by === 'leah').map((s: any) => s.dimension),
  );

  await db
    .from('pipeline_vendors')
    .update({
      total_score: total,
      triage_level: triage,
      scored_by_kody: kodyDims.size >= 4,
      scored_by_leah: leahDims.size >= 4,
      awaiting_leah_review: kodyDims.size >= 4 && leahDims.size < 4,
    })
    .eq('id', vendorId);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as unknown as LooseClient;

  const { slug } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const dimension = Number(body.dimension) as ScoreDimension;
  const rawScore = Number(body.raw_score);
  const scoredBy = body.scored_by as ScoredBy;
  const evidence = typeof body.evidence === 'string' ? body.evidence : null;

  if (!Number.isInteger(dimension) || dimension < 1 || dimension > 8) {
    return badRequest('dimension must be 1–8');
  }
  if (!Number.isInteger(rawScore) || rawScore < 1 || rawScore > 5) {
    return badRequest('raw_score must be 1–5');
  }
  if (!['cowork', 'kody', 'leah'].includes(scoredBy)) {
    return badRequest('scored_by must be cowork, kody, or leah');
  }

  const dimDef = RUBRIC_DIMENSIONS.find((d) => d.dimension === dimension);
  if (!dimDef) return badRequest(`Unknown dimension: ${dimension}`);

  try {
    const { data: vendor } = await db
      .from('pipeline_vendors')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!vendor) return notFound(`Vendor "${slug}" not found`);

    const { error } = await db.from('pipeline_vendor_scores').upsert(
      {
        vendor_id: vendor.id,
        dimension,
        dimension_name: dimDef.name,
        weight: dimDef.weight,
        raw_score: rawScore,
        scored_by: scoredBy,
        scored_at: new Date().toISOString(),
        evidence,
      },
      { onConflict: 'vendor_id,dimension' },
    );

    if (error) throw error;

    await recomputeVendorAggregates(db, vendor.id);

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to upsert score');
  }
}
