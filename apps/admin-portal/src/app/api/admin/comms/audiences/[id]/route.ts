export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { audienceSegmentUpdateSchema } from '@patina/shared/validation';
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
    .from('audience_segments')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return notFound('Segment not found');
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
  const body = await req.json();
  const parsed = audienceSegmentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('Validation failed', parsed.error.flatten());
  }

  const { data, error } = await supabase
    .from('audience_segments')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single();

  if (error) return serverError(error.message);
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;

  const { data: segment } = await supabase
    .from('audience_segments')
    .select('is_preset')
    .eq('id', id)
    .single();

  if (segment?.is_preset) {
    return badRequest('Cannot delete preset segments');
  }

  const { error } = await supabase
    .from('audience_segments')
    .delete()
    .eq('id', id);

  if (error) return serverError(error.message);
  return NextResponse.json({ success: true });
}
