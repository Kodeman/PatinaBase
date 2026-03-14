export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { segmentRulesSchema } from '@patina/shared/validation';
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
