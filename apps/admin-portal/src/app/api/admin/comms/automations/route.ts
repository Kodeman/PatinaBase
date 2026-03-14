export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { automatedSequenceCreateSchema } from '@patina/shared/validation';
import { getServiceClient, verifyAdmin, unauthorized, badRequest, serverError } from '@/lib/admin-api';

export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { data, error } = await supabase
    .from('automated_sequences')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return serverError(error.message);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = automatedSequenceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('Validation failed', parsed.error.flatten());
  }

  const { data, error } = await supabase
    .from('automated_sequences')
    .insert({
      ...parsed.data,
      trigger_event: parsed.data.trigger_config.type,
      status: 'draft',
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return serverError(error.message);
  return NextResponse.json(data, { status: 201 });
}
