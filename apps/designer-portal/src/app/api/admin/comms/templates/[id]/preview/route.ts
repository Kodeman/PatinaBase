export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyDesigner,
  unauthorized,
  notFound,
} from '@/lib/comms-api';

// POST /api/admin/comms/templates/[id]/preview — render preview HTML.
//
// This is a read-only render. It is intentionally NOT gated to created_by:
// the untouched template read hooks (useTemplate/useTemplates) expose system
// templates (created_by NULL) plus the designer's own, and a designer composes
// campaigns against those shared templates — so they must be previewable too.
// Scoped to is_active = true to track the visible read set.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyDesigner(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const { data: template, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single();

  if (error || !template) return notFound('Template not found');

  const body = await req.json().catch(() => ({}));
  const html = generatePreviewHtml(template, body.data || {});

  return NextResponse.json({ html });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generatePreviewHtml(template: any, data: Record<string, unknown>): string {
  // Render strictly from the stored template + caller-supplied field values.
  // (No raw-HTML passthrough: the preview must reflect the template, never
  // arbitrary caller markup.)
  const subject = data.subject || template.subject_default || template.name;
  const body = data.body || 'Preview content will appear here.';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 0; background: #f5f3f0; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { padding: 32px 24px; text-align: center; border-bottom: 1px solid #e5e0da; }
    .header h1 { font-family: 'Playfair Display', serif; font-size: 24px; color: #2d2926; margin: 0; }
    .content { padding: 32px 24px; color: #2d2926; line-height: 1.6; }
    .footer { padding: 24px; text-align: center; font-size: 12px; color: #a39585; border-top: 1px solid #e5e0da; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Patina</h1></div>
    <div class="content">
      <h2 style="font-family: 'Playfair Display', serif; font-size: 20px;">${subject}</h2>
      <p>${body}</p>
    </div>
    <div class="footer">
      <p>Patina — Curated Furniture Intelligence</p>
      <p><a href="#">Unsubscribe</a> | <a href="#">Preferences</a></p>
    </div>
  </div>
</body>
</html>`;
}
