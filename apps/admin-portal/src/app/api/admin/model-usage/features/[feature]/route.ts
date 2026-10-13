import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { parseCap, readJsonObject } from '../../parse';

// POST /api/admin/model-usage/features/[feature] — set one feature's controls
// via llm_set_feature_control (00770), which writes llm_controls_audit.
// Body: { enabled: boolean, dailyCapUsd: number|null, studioMonthlyCapUsd:
// number|null }. null means "no cap" at that level.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ feature: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { feature } = await params;
  if (!feature.trim()) return badRequest('feature is required');

  const body = await readJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');
  if (typeof body.enabled !== 'boolean') return badRequest('enabled must be a boolean');
  const dailyCap = parseCap(body.dailyCapUsd, true);
  if (!dailyCap.ok) return badRequest('dailyCapUsd must be null or a number >= 0');
  const studioCap = parseCap(body.studioMonthlyCapUsd, true);
  if (!studioCap.ok) return badRequest('studioMonthlyCapUsd must be null or a number >= 0');

  try {
    const { error } = await auth.adminClient.rpc('llm_set_feature_control', {
      p_feature: feature,
      p_enabled: body.enabled,
      // Nullable numeric params: the RPC treats null as "no cap", but the
      // generated Args type marks them non-null.
      p_daily_cap: dailyCap.value as number,
      p_studio_monthly_cap: studioCap.value as number,
      p_actor: auth.user.id,
    });
    if (error) throw error;
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to update feature controls');
  }
}
