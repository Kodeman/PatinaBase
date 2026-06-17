export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyDesigner,
  unauthorized,
  badRequest,
  serverError,
  segmentRulesSchema,
} from '@/lib/comms-api';

// POST /api/admin/comms/audiences/estimate — count profiles matching the rules.
//
// ⚠ FLAGGED FOLLOW-UP (R60): this estimate counts the ORG-WIDE `profiles`
// population (every profile matching the rules), exactly as the admin handler
// does. R60 says People Room audiences should "draw from the same directory" —
// i.e. the requesting designer's own people. Scoping this correctly is a larger
// change: the segment fields (founding_circle, engagement_score, role, …) are
// columns on `profiles`, and there is no designer-ownership column to filter on
// in this query path. Constraining to "this designer's people" needs a join to
// the designer↔people relationship (e.g. designer_clients / a directory link)
// which is out of scope for a like-for-like port. The admin counting logic is
// preserved verbatim below and the discrepancy is left for a design ruling
// rather than shipping a silently-wrong scoped count.
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyDesigner(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = segmentRulesSchema.safeParse(body.rules);
  if (!parsed.success) {
    return badRequest('Invalid rules', parsed.error.flatten());
  }

  const rules = parsed.data;
  let query = supabase.from('profiles').select('*', { count: 'exact', head: true });

  for (const condition of rules.conditions) {
    switch (condition.field) {
      case 'founding_circle':
        if (condition.operator === 'eq') {
          query = query.eq('is_founding_circle', condition.value);
        }
        break;
      case 'engagement_score':
        if (condition.operator === 'gte') query = query.gte('engagement_score', condition.value as number);
        if (condition.operator === 'lte') query = query.lte('engagement_score', condition.value as number);
        if (condition.operator === 'gt') query = query.gt('engagement_score', condition.value as number);
        if (condition.operator === 'lt') query = query.lt('engagement_score', condition.value as number);
        break;
      default:
        break;
    }
  }

  const { count, error } = await query;
  if (error) return serverError(error.message);

  return NextResponse.json({ count: count || 0 });
}
