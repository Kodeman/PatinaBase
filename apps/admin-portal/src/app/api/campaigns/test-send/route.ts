import { NextRequest, NextResponse } from 'next/server';
import { sendCompliantEmail } from '@patina/email/send';
import { getServiceClient, verifyAdmin, unauthorized, badRequest, serverError } from '@/lib/admin-api';

interface TestSendBody {
  templateId: string;
  testEmail?: string;
  subject: string;
  subjectB?: string;
  abEnabled?: boolean;
  previewText?: string;
  templateData?: Record<string, unknown>;
}

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = resolveKey(data, key);
    if (value === null || value === undefined) return '';
    return String(value);
  });
}

function resolveKey(data: Record<string, unknown>, key: string): unknown {
  if (!key.includes('.')) return data[key];
  const parts = key.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function buildFallbackHtml(
  data: Record<string, unknown>,
  testNotice: string,
): string {
  const headline = (data.headline as string) || (data.headlineText as string) || 'Preview';
  const body = (data.body as string) || (data.bodyText as string) || '';
  const ctaText = (data.ctaText as string) || '';
  const ctaUrl = (data.ctaUrl as string) || '#';
  const heroImageUrl = (data.heroImageUrl as string) || '';

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="background:#FAF7F2;font-family:Inter,Helvetica,Arial,sans-serif;margin:0;padding:0;">
      <div style="max-width:600px;margin:0 auto;background:#fff;">
        ${testNotice}
        <div style="background:linear-gradient(135deg,#C4A57B,#8B7355);padding:32px 40px;text-align:center;">
          <span style="color:#fff;font-size:28px;font-weight:600;letter-spacing:2px;">Patina</span>
        </div>
        <div style="padding:40px;">
          ${heroImageUrl ? `<img src="${heroImageUrl}" alt="" style="width:100%;border-radius:12px;margin-bottom:24px;" />` : ''}
          <h1 style="color:#2C2926;font-size:26px;font-weight:600;margin:0 0 16px;">${headline}</h1>
          <p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 28px;white-space:pre-wrap;">${body}</p>
          ${ctaText ? `<div style="text-align:center;margin:28px 0;">
            <a href="${ctaUrl}" style="display:inline-block;background:#C4A57B;color:#fff;padding:14px 32px;border-radius:24px;text-decoration:none;font-weight:600;">${ctaText}</a>
          </div>` : ''}
        </div>
        <div style="background:#2C2926;padding:32px 40px;text-align:center;">
          <p style="color:#A09890;font-size:13px;margin:0 0 8px;">Patina — Furniture intelligence for design professionals</p>
          <p style="color:#7A736C;font-size:11px;margin:0;">This is a test preview. The real send will include unsubscribe link, real audience data, and merge tags.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  let body: TestSendBody;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (!body.templateId) return badRequest('templateId is required');
  if (!body.subject) return badRequest('subject is required');

  const recipient = (body.testEmail || user.email || '').trim();
  if (!recipient) return badRequest('testEmail or admin email required');

  // Try to load DB template (html_content + subject_default).
  const { data: tmpl } = await supabase
    .from('email_templates')
    .select('html_content, subject_default')
    .eq('slug', body.templateId)
    .maybeSingle();

  const data = body.templateData ?? {};
  const enrichedData = {
    ...data,
    displayName: user.email?.split('@')[0] || 'there',
    displayNameComma: user.email?.split('@')[0]
      ? `, ${user.email.split('@')[0]}`
      : '',
  };

  const testNotice = `
    <div style="background:#FFF3CD;color:#664D03;padding:12px 24px;border-bottom:1px solid #FFE69C;font-size:13px;text-align:center;">
      <strong>Test send</strong> — recipient: ${recipient}. Audience filtering and List-Unsubscribe are skipped on tests.
    </div>
  `;

  let html: string;
  if (tmpl?.html_content && String(tmpl.html_content).trim()) {
    html = testNotice + interpolate(String(tmpl.html_content), enrichedData);
  } else {
    html = buildFallbackHtml(enrichedData, testNotice);
  }

  // For A/B campaigns, prefer subject A for the test (admin can re-test for B).
  const subject = `[TEST] ${body.subject}`;

  const result = await sendCompliantEmail({
    to: recipient,
    subject,
    html,
    // Treat tests as transactional so we don't generate a real unsubscribe
    // token for the admin (their token would be valid against their own user).
    category: 'transactional',
    tags: [
      { name: 'source', value: 'campaign_test' },
      { name: 'template_id', value: body.templateId },
    ],
  });

  if (!result.success) {
    return serverError(`Test send failed: ${result.error ?? 'unknown'}`);
  }

  return NextResponse.json(
    { ok: true, recipient, provider_id: result.id },
    { status: 200 },
  );
}
