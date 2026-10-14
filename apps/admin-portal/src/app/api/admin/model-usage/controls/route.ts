import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { parseCap, readJsonObject } from '../parse';

// POST /api/admin/model-usage/controls — update only supplied values through
// llm_set_controls, which writes llm_controls_audit. A monthly cap of null means uncapped.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = await readJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');
  const hasKillSwitch = Object.hasOwn(body, 'killSwitch');
  const hasGlobalDailyCap = Object.hasOwn(body, 'globalDailyCapUsd');
  const hasStudioMonthlyCap = Object.hasOwn(body, 'studioMonthlyCapUsd');
  if (!hasKillSwitch && !hasGlobalDailyCap && !hasStudioMonthlyCap) return badRequest('At least one control is required');
  if (hasKillSwitch && typeof body.killSwitch !== 'boolean') {
    return badRequest('killSwitch must be a boolean');
  }
  const cap = hasGlobalDailyCap ? parseCap(body.globalDailyCapUsd, false) : null;
  if (cap && (!cap.ok || cap.value === null)) return badRequest('globalDailyCapUsd must be a number >= 0');
  const studioCap = hasStudioMonthlyCap ? parseCap(body.studioMonthlyCapUsd, true) : null;
  if (studioCap && !studioCap.ok) return badRequest('studioMonthlyCapUsd must be a number >= 0 or null');

  try {
    const controls = {
      p_kill_switch: hasKillSwitch ? (body.killSwitch as boolean) : null,
      p_global_daily_cap: cap?.ok && cap.value !== null ? cap.value : null,
      p_actor: auth.user.id,
    };
    const { error } = hasStudioMonthlyCap
      ? await auth.adminClient.rpc('llm_set_controls', {
          ...controls,
          p_studio_monthly_cap: studioCap?.ok ? studioCap.value : null,
          p_set_studio_monthly_cap: true,
        } as never)
      : await auth.adminClient.rpc('llm_set_controls', controls as never);
    if (error) throw error;
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to update model controls');
  }
}
