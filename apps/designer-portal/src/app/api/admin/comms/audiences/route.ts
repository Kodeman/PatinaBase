export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyDesigner,
  unauthorized,
  badRequest,
  serverError,
  audienceSegmentCreateSchema,
} from '@/lib/comms-api';

// GET /api/admin/comms/audiences — this designer's own saved segments + shared
// presets (is_preset = true, created_by NULL). Note: the useAudienceSegments()
// hook reads segments directly via Supabase (left untouched); this GET exists
// for route parity and self-scopes to the requesting designer's segments (plus
// shared presets, which have no owner).
export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyDesigner(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { data, error } = await supabase
    .from('audience_segments')
    .select('*')
    .or(`created_by.eq.${user.id},is_preset.eq.true`)
    .order('is_preset', { ascending: false })
    .order('name');

  if (error) return serverError(error.message);
  return NextResponse.json(data);
}

// POST /api/admin/comms/audiences — create a segment owned by this designer.
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyDesigner(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = audienceSegmentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('Validation failed', parsed.error.flatten());
  }

  const { data, error } = await supabase
    .from('audience_segments')
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return serverError(error.message);
  return NextResponse.json(data, { status: 201 });
}
