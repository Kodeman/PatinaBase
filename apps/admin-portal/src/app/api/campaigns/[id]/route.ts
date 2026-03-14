import { NextRequest, NextResponse } from 'next/server';
import { campaignUpdateSchema } from '@patina/shared/validation';
import { getServiceClient, verifyAdmin, unauthorized, badRequest, notFound, serverError } from '@/lib/admin-api';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, campaign_analytics(*)')
    .eq('id', id)
    .single();

  if (error) return notFound('Campaign not found');
  return NextResponse.json(data);
}

export async function PATCH(
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

  const body = await req.json();
  const parsed = campaignUpdateSchema.safeParse(body);

  // Allow archive status transition from sent/cancelled/draft
  const isArchiveOnly = parsed.success
    && Object.keys(parsed.data).length === 1
    && parsed.data.status === 'archived';
  const archivableStatuses = ['sent', 'cancelled', 'draft'];

  if (isArchiveOnly) {
    if (!archivableStatuses.includes(existing.status)) {
      return badRequest(`Cannot archive campaign with status '${existing.status}'`);
    }
  } else if (!['draft', 'scheduled'].includes(existing.status)) {
    return badRequest(`Cannot edit campaign with status '${existing.status}'`);
  }
  if (!parsed.success) {
    return badRequest('Validation failed', parsed.error.flatten());
  }

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single();

  if (error) return serverError(error.message);
  return NextResponse.json(campaign);
}

export async function DELETE(
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

  // Draft campaigns: hard delete
  if (existing.status === 'draft') {
    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', id);

    if (error) return serverError(error.message);
    return NextResponse.json({ deleted: true });
  }

  // Scheduled campaigns: cancel (soft status change)
  if (existing.status === 'scheduled') {
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (error) return serverError(error.message);
    return NextResponse.json(campaign);
  }

  return badRequest(`Cannot delete campaign with status '${existing.status}'`);
}
