import { NextRequest, NextResponse } from 'next/server';
import type { Json } from '@patina/supabase';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// GET /api/admin/model-usage — everything the model-usage page shows: the
// llm_controls singleton, one row per llm_feature_controls row with today's
// and this month's settled spend, this month's spend by studio (from
// llm_usage_summary, 00770) joined with llm_studio_overrides, and the last 20
// llm_controls_audit rows. Days and months are UTC, matching llm_reserve.

export interface ModelUsageControls {
  killSwitch: boolean;
  globalDailyCapUsd: number;
  updatedAt: string;
}

export interface ModelUsageFeature {
  feature: string;
  enabled: boolean;
  dailyCapUsd: number | null;
  studioMonthlyCapUsd: number | null;
  todayUsd: number;
  monthUsd: number;
}

export interface ModelUsageStudio {
  studioId: string;
  name: string | null;
  monthUsd: number;
  monthCalls: number;
  /** true when an llm_studio_overrides row exists for this studio. */
  hasOverride: boolean;
  /** Override cap; null with hasOverride means the override is "no cap". */
  overrideMonthlyCapUsd: number | null;
}

export interface ModelUsageAuditRow {
  id: number;
  at: string;
  actor: string | null;
  actorEmail: string | null;
  target: string;
  before: Json | null;
  after: Json;
}

export interface ModelUsageOverview {
  controls: ModelUsageControls;
  todayUsd: number;
  monthUsd: number;
  features: ModelUsageFeature[];
  studios: ModelUsageStudio[];
  audit: ModelUsageAuditRow[];
  window: { dayStart: string; monthStart: string };
}

interface SummaryRow {
  key: string;
  usd: number;
  calls: number;
}

interface Summary {
  byFeature: Map<string, SummaryRow>;
  byStudio: Map<string, SummaryRow>;
  totalUsd: number;
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function readRows(value: unknown, keyField: string): Map<string, SummaryRow> {
  const out = new Map<string, SummaryRow>();
  if (!Array.isArray(value)) return out;
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const key = row[keyField];
    if (typeof key !== 'string') continue;
    out.set(key, { key, usd: asNumber(row.usd), calls: asNumber(row.calls) });
  }
  return out;
}

function parseSummary(data: Json): Summary {
  const obj = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const totals = obj.totals && typeof obj.totals === 'object' && !Array.isArray(obj.totals)
    ? obj.totals
    : {};
  return {
    byFeature: readRows(obj.by_feature, 'feature'),
    byStudio: readRows(obj.by_studio, 'studio_id'),
    totalUsd: asNumber(totals.usd),
  };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  try {
    const [controlsRes, featuresRes, overridesRes, auditRes, todayRes, monthRes] =
      await Promise.all([
        db.from('llm_controls').select('kill_switch, global_daily_cap_usd, updated_at').eq('id', true).maybeSingle(),
        db.from('llm_feature_controls').select('feature, enabled, daily_cap_usd, studio_monthly_cap_usd').order('feature'),
        db.from('llm_studio_overrides').select('studio_id, monthly_cap_usd'),
        db.from('llm_controls_audit').select('id, at, actor, target, before, after').order('at', { ascending: false }).order('id', { ascending: false }).limit(20),
        db.rpc('llm_usage_summary', { p_from: dayStart.toISOString(), p_to: dayEnd.toISOString() }),
        db.rpc('llm_usage_summary', { p_from: monthStart.toISOString(), p_to: monthEnd.toISOString() }),
      ]);

    for (const res of [controlsRes, featuresRes, overridesRes, auditRes, todayRes, monthRes]) {
      if (res.error) throw res.error;
    }
    if (!controlsRes.data) throw new Error('llm_controls row is missing');

    const today = parseSummary(todayRes.data ?? {});
    const month = parseSummary(monthRes.data ?? {});

    const overrides = new Map<string, number | null>();
    for (const row of overridesRes.data ?? []) overrides.set(row.studio_id, row.monthly_cap_usd);

    const studioIds = Array.from(new Set([...month.byStudio.keys(), ...overrides.keys()]));
    const actorIds = Array.from(
      new Set((auditRes.data ?? []).map((r) => r.actor).filter((a): a is string => !!a)),
    );

    const [namesRes, actorsRes] = await Promise.all([
      studioIds.length
        ? db.from('admin_studio_overview').select('id, name').in('id', studioIds)
        : Promise.resolve({ data: [] as { id: string | null; name: string | null }[], error: null }),
      actorIds.length
        ? db.from('profiles').select('id, email').in('id', actorIds)
        : Promise.resolve({ data: [] as { id: string; email: string | null }[], error: null }),
    ]);
    if (namesRes.error) throw namesRes.error;
    if (actorsRes.error) throw actorsRes.error;

    const names = new Map<string, string | null>();
    for (const row of namesRes.data ?? []) if (row.id) names.set(row.id, row.name);
    const emails = new Map<string, string | null>();
    for (const row of actorsRes.data ?? []) emails.set(row.id, row.email);

    const studios: ModelUsageStudio[] = studioIds
      .map((studioId) => {
        const spend = month.byStudio.get(studioId);
        return {
          studioId,
          name: names.get(studioId) ?? null,
          monthUsd: spend?.usd ?? 0,
          monthCalls: spend?.calls ?? 0,
          hasOverride: overrides.has(studioId),
          overrideMonthlyCapUsd: overrides.get(studioId) ?? null,
        };
      })
      .sort((a, b) => b.monthUsd - a.monthUsd || (a.name ?? a.studioId).localeCompare(b.name ?? b.studioId));

    const overview: ModelUsageOverview = {
      controls: {
        killSwitch: controlsRes.data.kill_switch,
        globalDailyCapUsd: asNumber(controlsRes.data.global_daily_cap_usd),
        updatedAt: controlsRes.data.updated_at,
      },
      todayUsd: today.totalUsd,
      monthUsd: month.totalUsd,
      features: (featuresRes.data ?? []).map((row) => ({
        feature: row.feature,
        enabled: row.enabled,
        dailyCapUsd: row.daily_cap_usd,
        studioMonthlyCapUsd: row.studio_monthly_cap_usd,
        todayUsd: today.byFeature.get(row.feature)?.usd ?? 0,
        monthUsd: month.byFeature.get(row.feature)?.usd ?? 0,
      })),
      studios,
      audit: (auditRes.data ?? []).map((row) => ({
        id: row.id,
        at: row.at,
        actor: row.actor,
        actorEmail: row.actor ? emails.get(row.actor) ?? null : null,
        target: row.target,
        before: row.before,
        after: row.after,
      })),
      window: { dayStart: dayStart.toISOString(), monthStart: monthStart.toISOString() },
    };

    return NextResponse.json({ data: overview });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load model usage');
  }
}
