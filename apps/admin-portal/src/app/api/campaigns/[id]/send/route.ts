import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, badRequest, notFound, serverError } from '@/lib/admin-api';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;

  const { data: existing } = await supabase
    .from('campaigns')
    .select('status')
    .eq('id', id)
    .single();

  if (!existing) return notFound('Campaign not found');
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
