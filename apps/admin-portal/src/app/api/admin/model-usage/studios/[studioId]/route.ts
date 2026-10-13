import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { isUuid, parseCap, readJsonObject } from '../../parse';

// POST /api/admin/model-usage/studios/[studioId] — set a studio's monthly cap
// override via llm_set_studio_override (00770), which writes
// llm_controls_audit. Body: { monthlyCapUsd: number >= 0 }. The RPC also
// accepts null, but an override row with a null cap lifts the studio's
// monthly cap entirely and there is no RPC to delete an override, so this
// route only takes a number.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studioId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { studioId } = await params;
  if (!isUuid(studioId)) return badRequest('studioId must be a UUID');

  const body = await readJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');
  const cap = parseCap(body.monthlyCapUsd, false);
  if (!cap.ok || cap.value === null) return badRequest('monthlyCapUsd must be a number >= 0');

  try {
    const { error } = await auth.adminClient.rpc('llm_set_studio_override', {
      p_studio: studioId,
      p_cap: cap.value,
      p_actor: auth.user.id,
    });
    if (error) throw error;
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to update studio override');
  }
}
