export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyDesigner,
  unauthorized,
  badRequest,
  notFound,
  serverError,
} from '@/lib/comms-api';

// POST /api/campaigns/[id]/send — dispatch a draft campaign owned by this designer.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyDesigner(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;

  const { data: existing } = await supabase
    .from('campaigns')
    .select('status, created_by')
    .eq('id', id)
    .single();

  if (!existing || existing.created_by !== user.id) return notFound('Campaign not found');
  if (existing.status !== 'draft') {
    return badRequest(`Can only send draft campaigns, current status: '${existing.status}'`);
  }

  const { error: invokeError } = await supabase.functions.invoke(
    'campaign-dispatch',
    { body: { campaign_id: id } }
  );

  if (invokeError) {
    return serverError(`Failed to dispatch: ${invokeError.message}`);
  }

  return NextResponse.json(
    { message: 'Campaign dispatch initiated', campaign_id: id },
    { status: 202 }
  );
}
