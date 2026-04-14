import { NextRequest, NextResponse } from 'next/server';
import { sendHtmlEmail } from '@patina/email';
import {
  getAuthenticatedAdmin,
  badRequest,
  serverError,
  createAuditLog,
  getClientIp,
} from '@/lib/supabase-admin';
import { getApplication, type ApplicationType } from '@/lib/applications';

function parseType(raw: string): ApplicationType | null {
  if (raw === 'designers') return 'designer';
  if (raw === 'makers') return 'maker';
  return null;
}

type SendBody = {
  subject: string;
  html: string;
  text?: string;
  presetSlug?: string;
};

function substitute(content: string, vars: Record<string, string>) {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => vars[key] ?? '');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;

  const { type: rawType, id } = await params;
  const type = parseType(rawType);
  if (!type) return badRequest('Unknown application type');

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (!body.subject?.trim() || !body.html?.trim()) {
    return badRequest('subject and html are required');
  }

  let application;
  try {
    application = await getApplication(adminClient, type, id);
  } catch (err: any) {
    return serverError(err.message ?? 'Application not found');
  }

  const vars: Record<string, string> = {
    email: application.email,
    first_name: application.first_name ?? '',
    last_name: application.last_name ?? '',
    contact_name: application.contact_name ?? '',
    brand_name: application.brand_name ?? '',
    company: application.company ?? '',
  };

  const subject = substitute(body.subject, vars);
  const html = substitute(body.html, vars);
  const text = body.text ? substitute(body.text, vars) : undefined;

  const result = await sendHtmlEmail({
    to: application.email,
    subject,
    html,
    text,
    tags: [
      { name: 'source', value: 'admin_applications' },
      { name: 'application_type', value: type },
      ...(body.presetSlug ? [{ name: 'preset', value: body.presetSlug }] : []),
    ],
  });

  const { data: logRow } = await (adminClient as any)
    .from('application_communications')
    .insert({
      application_type: type,
      application_id: id,
      sent_by: adminUser.id,
      channel: 'email',
      template_id: null,
      subject,
      body_html: html,
      body_text: text ?? null,
      to_email: application.email,
      provider_id: result.id ?? null,
      status: result.success ? 'sent' : 'failed',
      error: result.success ? null : result.error ?? null,
    })
    .select()
    .single();

  await createAuditLog(adminClient, {
    userId: adminUser.id,
    action: `application.${type}.email`,
    resourceType: 'application',
    resourceId: id,
    newValues: {
      subject,
      presetSlug: body.presetSlug ?? null,
      providerId: result.id,
      status: result.success ? 'sent' : 'failed',
    },
    ipAddress: getClientIp(request),
    status: result.success ? 'success' : 'failure',
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'Email send failed', data: { communication: logRow } },
      { status: 502 },
    );
  }

  return NextResponse.json({ data: { communication: logRow } });
}
