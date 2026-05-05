import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, badRequest, notFound, serverError } from '@/lib/admin-api';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const { data, error } = await supabase
    .from('email_template_versions')
    .select('id, version_num, name, subject_default, edited_by, created_at')
    .eq('template_id', id)
    .order('version_num', { ascending: false })
    .limit(50);
  if (error) return serverError(error.message);
  return NextResponse.json({ versions: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json().catch(() => null) as { version_id?: string } | null;
  if (!body?.version_id) return badRequest('version_id required');

  const { data: version, error: vErr } = await supabase
    .from('email_template_versions')
    .select('content_blocks, html_content, variables, subject_default, name')
    .eq('id', body.version_id)
    .eq('template_id', id)
    .maybeSingle();
  if (vErr) return serverError(vErr.message);
  if (!version) return notFound('Version not found');

  const { error: updErr } = await supabase
    .from('email_templates')
    .update({
      content_blocks: version.content_blocks,
      html_content: version.html_content,
      variables: version.variables,
      subject_default: version.subject_default,
      name: version.name,
    })
    .eq('id', id);
  if (updErr) return serverError(updErr.message);

  return NextResponse.json({ ok: true, restored_from: body.version_id });
}
