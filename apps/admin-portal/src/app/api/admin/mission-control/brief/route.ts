import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { chicagoDateOf } from '@/lib/chicago-date';
import type { DailyBrief } from '@/services/morning-brief';

// GET /api/admin/mission-control/brief — today's Chicago-calendar-date
// daily_briefs row (WP-1.3), falling back to the most recent available row
// when today's hasn't landed yet (the 11:00 UTC cron hasn't fired for today,
// or this is a fresh stack with no history at all). Returns { data: null }
// when no brief exists anywhere — the panel renders nothing in that case.
//
// daily_briefs is not yet in the checked-in generated Database type (this
// migration, 00302, adds the table; database.types.ts is regenerated at
// integration, not committed from this worktree) — narrow, defensive casts.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const today = chicagoDateOf(new Date());

  try {
    const { data: todayRow, error: todayErr } = await (adminClient as any)
      .from('daily_briefs')
      .select('brief_date, content, generated_at, email_sent_at')
      .eq('brief_date', today)
      .maybeSingle();
    if (todayErr) return serverError(todayErr.message ?? "Failed to load today's brief");

    if (todayRow) {
      return NextResponse.json({ data: todayRow as DailyBrief });
    }

    // No brief for today yet — fall back to the latest one available.
    const { data: latestRow, error: latestErr } = await (adminClient as any)
      .from('daily_briefs')
      .select('brief_date, content, generated_at, email_sent_at')
      .order('brief_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) return serverError(latestErr.message ?? 'Failed to load latest brief');

    return NextResponse.json({ data: (latestRow as DailyBrief | null) ?? null });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load morning brief');
  }
}
