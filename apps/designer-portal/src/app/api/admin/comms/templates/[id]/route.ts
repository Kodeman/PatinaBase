export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyDesigner,
  unauthorized,
  badRequest,
  notFound,
  serverError,
  emailTemplateUpdateSchema,
} from '@/lib/comms-api';

// GET /api/admin/comms/templates/[id] — a single template owned by this designer.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyDesigner(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('id', id)
    .eq('created_by', user.id)
    .single();

  if (error || !data) return notFound('Template not found');
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

  // Ownership check: only the template's owner may edit it. System/preset
  // templates (created_by NULL) are not editable by a designer.
  const { data: existing } = await supabase
    .from('email_templates')
    .select('created_by')
    .eq('id', id)
    .single();

  if (!existing || existing.created_by !== user.id) return notFound('Template not found');

  const body = await req.json();
  const parsed = emailTemplateUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('Validation failed', parsed.error.flatten());
  }

  const { data, error } = await supabase
    .from('email_templates')
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

  // Ownership check before the soft-delete (is_active = false).
  const { data: existing } = await supabase
    .from('email_templates')
    .select('created_by')
    .eq('id', id)
    .single();

  if (!existing || existing.created_by !== user.id) return notFound('Template not found');

  const { error } = await supabase
    .from('email_templates')
    .update({ is_active: false })
    .eq('id', id)
    .eq('created_by', user.id);

  if (error) return serverError(error.message);
  return NextResponse.json({ success: true });
}
