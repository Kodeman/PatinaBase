import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, createAuditLog, serverError, getClientIp } from '@/lib/supabase-admin';
import type { DailyBrief } from '@/services/morning-brief';

// POST /api/admin/mission-control/brief/regenerate — admin "Regenerate"
// action on the Morning Brief panel (WP-1.3). Invokes the morning-brief edge
// function server-side the same way api/admin/designers/invite invokes
// designer-invite, except morning-brief doesn't need to resolve a specific
// caller identity (it composes the same global admin digest regardless of
// who triggers it) — so the already-available service-role adminClient from
// getAuthenticatedAdmin satisfies its verify_jwt = true check, same pattern
// as api/campaigns/[id]/send invoking campaign-dispatch.
//
// The edge function's JSON response is a job-summary object, not the row —
// re-read daily_briefs for the brief_date it reports rather than trusting the
// response shape to be the row itself. daily_briefs is not yet in the
// checked-in generated Database type (00302 adds it) — narrow, defensive
// casts.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;

  try {
    const { data: invokeData, error: invokeError } = await adminClient.functions.invoke(
      'morning-brief',
      { body: {} },
    );
    if (invokeError) {
      return serverError(invokeError.message ?? 'Failed to invoke morning-brief');
    }

    const briefDate = (invokeData as { brief_date?: string } | null)?.brief_date;
    if (!briefDate) {
      return serverError('morning-brief returned no brief_date');
    }

    const { data: row, error: rowErr } = await (adminClient as any)
      .from('daily_briefs')
      .select('brief_date, content, generated_at, email_sent_at')
      .eq('brief_date', briefDate)
      .maybeSingle();
    if (rowErr) return serverError(rowErr.message ?? 'Failed to read regenerated brief');

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'mission_control.brief_regenerate',
      resourceType: 'daily_brief',
      resourceId: briefDate,
      newValues: { brief_date: briefDate },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: (row as DailyBrief | null) ?? null });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to regenerate morning brief');
  }
}
