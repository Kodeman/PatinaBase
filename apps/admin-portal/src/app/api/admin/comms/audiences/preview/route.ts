export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { segmentRulesSchema } from '@patina/shared/validation';
import type { SegmentRules } from '@patina/shared/types';
import { resolveAudience } from '@patina/notifications';
import { getServiceClient, verifyAdmin, unauthorized, badRequest, serverError } from '@/lib/admin-api';

export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = segmentRulesSchema.safeParse(body.rules);
  if (!parsed.success) {
    return badRequest('Invalid rules', parsed.error.flatten());
  }

  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);

  try {
    const recipients = await resolveAudience(supabase, parsed.data as SegmentRules);
    const sample = recipients.slice(0, limit).map((r) => ({
      id: r.user_id,
      email: r.email,
      display_name: r.first_name,
      role: r.role,
    }));
    return NextResponse.json({
      total: recipients.length,
      sample,
      truncated: recipients.length > sample.length,
    });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : 'Preview failed');
  }
}
