export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { emailTemplateCreateSchema } from '@patina/shared/validation';
import { getServiceClient, verifyAdmin, unauthorized, badRequest, serverError } from '@/lib/admin-api';

export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const category = req.nextUrl.searchParams.get('category');
  let query = supabase
    .from('email_templates')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('name');

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return serverError(error.message);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = emailTemplateCreateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('Validation failed', parsed.error.flatten());
  }

  const { data, error } = await supabase
    .from('email_templates')
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return serverError(error.message);
  return NextResponse.json(data, { status: 201 });
}
