export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyDesigner,
  unauthorized,
  badRequest,
  serverError,
  emailTemplateCreateSchema,
} from '@/lib/comms-api';

// GET /api/admin/comms/templates — this designer's own active templates.
// Note: the useTemplates() hook reads templates directly via Supabase (left
// untouched), so this GET is here only for route parity; it self-scopes to the
// requesting designer's templates.
export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyDesigner(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const category = req.nextUrl.searchParams.get('category');
  let query = supabase
    .from('email_templates')
    .select('*')
    .eq('is_active', true)
    .eq('created_by', user.id)
    .order('category')
    .order('name');

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return serverError(error.message);
  return NextResponse.json(data);
}

// POST /api/admin/comms/templates — create a template owned by this designer.
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyDesigner(supabase, req.headers.get('authorization'));
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
