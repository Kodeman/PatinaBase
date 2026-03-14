export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { automatedSequenceUpdateSchema } from '@patina/shared/validation';
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
    .from('automated_sequences')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return notFound('Automation not found');

  const { data: enrollments } = await supabase
    .from('sequence_enrollments')
    .select('*')
    .eq('sequence_id', id)
    .order('enrolled_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ ...data, enrollments: enrollments || [] });
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
  const parsed = automatedSequenceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('Validation failed', parsed.error.flatten());
  }

  if (parsed.data.status === 'active') {
    const { data: existing } = await supabase
      .from('automated_sequences')
      .select('steps_json')
      .eq('id', id)
      .single();

    const steps = parsed.data.steps_json || existing?.steps_json || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasEmailStep = (steps as any[]).some((s: any) => s.type === 'email');
    if (!hasEmailStep) {
      return badRequest('Cannot activate a sequence with no email steps');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = { ...parsed.data };
  if (parsed.data.trigger_config) {
    updateData.trigger_event = parsed.data.trigger_config.type;
  }

  const { data, error } = await supabase
    .from('automated_sequences')
    .update(updateData)
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

  const { data: sequence } = await supabase
    .from('automated_sequences')
    .select('status')
    .eq('id', id)
    .single();

  if (sequence?.status === 'active') {
    return badRequest('Cannot delete an active sequence. Pause it first.');
  }

  const { error } = await supabase
    .from('automated_sequences')
    .delete()
    .eq('id', id);

  if (error) return serverError(error.message);
  return NextResponse.json({ success: true });
}
