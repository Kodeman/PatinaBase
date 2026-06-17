export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyDesigner,
  unauthorized,
  badRequest,
  notFound,
  serverError,
  audienceSegmentUpdateSchema,
} from '@/lib/comms-api';

// GET /api/admin/comms/audiences/[id] — a segment owned by this designer or a
// shared preset (created_by NULL, is_preset = true).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyDesigner(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const { data, error } = await supabase
    .from('audience_segments')
    .select('*')
    .eq('id', id)
    .or(`created_by.eq.${user.id},is_preset.eq.true`)
    .single();

  if (error || !data) return notFound('Segment not found');
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyDesigner(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;

  // Ownership check: only the segment's owner may edit it. Shared presets
  // (created_by NULL) are not editable by a designer.
  const { data: existing } = await supabase
    .from('audience_segments')
    .select('created_by')
    .eq('id', id)
    .single();

  if (!existing || existing.created_by !== user.id) return notFound('Segment not found');

  const body = await req.json();
  const parsed = audienceSegmentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('Validation failed', parsed.error.flatten());
  }

  const { data, error } = await supabase
    .from('audience_segments')
    .update(parsed.data)
    .eq('id', id)
    .eq('created_by', user.id)
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
  const user = await verifyDesigner(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;

  const { data: segment } = await supabase
    .from('audience_segments')
    .select('is_preset, created_by')
    .eq('id', id)
    .single();

  if (!segment || segment.created_by !== user.id) return notFound('Segment not found');

  if (segment.is_preset) {
    return badRequest('Cannot delete preset segments');
  }

  const { error } = await supabase
    .from('audience_segments')
    .delete()
    .eq('id', id)
    .eq('created_by', user.id);

  if (error) return serverError(error.message);
  return NextResponse.json({ success: true });
}
