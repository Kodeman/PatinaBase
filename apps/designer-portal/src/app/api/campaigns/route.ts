export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyDesigner,
  unauthorized,
  badRequest,
  serverError,
  campaignCreateSchema,
} from '@/lib/comms-api';

// GET /api/campaigns — list THIS designer's campaigns, optionally by status.
export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyDesigner(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  let query = supabase
    .from('campaigns')
    .select('*, campaign_analytics(*)')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return serverError(error.message);

  return NextResponse.json(data);
}

// POST /api/campaigns — create a campaign owned by this designer.
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyDesigner(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = campaignCreateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('Validation failed', parsed.error.flatten());
  }

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .insert({
      ...parsed.data,
      status: parsed.data.scheduled_for ? 'scheduled' : 'draft',
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return serverError(error.message);

  return NextResponse.json(campaign, { status: 201 });
}
