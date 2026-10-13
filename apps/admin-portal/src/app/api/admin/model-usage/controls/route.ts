import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { parseCap, readJsonObject } from '../parse';

// POST /api/admin/model-usage/controls — set the kill switch and the global
// daily cap via llm_set_controls (00770), which writes llm_controls_audit.
// Body: { killSwitch: boolean, globalDailyCapUsd: number >= 0 }. Both are
// required because the RPC overwrites both columns.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = await readJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');
  if (typeof body.killSwitch !== 'boolean') return badRequest('killSwitch must be a boolean');
  const cap = parseCap(body.globalDailyCapUsd, false);
  if (!cap.ok || cap.value === null) return badRequest('globalDailyCapUsd must be a number >= 0');

  try {
    const { error } = await auth.adminClient.rpc('llm_set_controls', {
      p_kill_switch: body.killSwitch,
      p_global_daily_cap: cap.value,
      p_actor: auth.user.id,
    });
    if (error) throw error;
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to update model controls');
  }
}
