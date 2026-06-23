import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  badRequest,
  serverError,
  createAuditLog,
  getClientIp,
} from '@/lib/supabase-admin';
import { getApplication, type ApplicationType } from '@/lib/applications';
import { sendApplicationEmail } from '@/lib/application-emails';

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

  let result: Awaited<ReturnType<typeof sendApplicationEmail>>;
  try {
    result = await sendApplicationEmail(adminClient, {
      type,
      application,
      subject: body.subject,
      html: body.html,
      text: body.text,
      presetSlug: body.presetSlug ?? null,
      source: 'admin_applications',
      sentBy: adminUser.id,
    });
  } catch (err: any) {
    // A thrown error here (e.g. missing RESEND_API_KEY before the send.ts
    // hardening) used to surface as an opaque 500. Surface it as a clear 502.
    console.error('[application-email] send threw unexpectedly:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Email send failed unexpectedly' },
      { status: 502 },
    );
  }

  // Audit logging is best-effort — a failure here must not turn a completed
  // (or cleanly-failed) send into a 500.
  try {
    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: `application.${type}.email`,
      resourceType: 'application',
      resourceId: id,
      newValues: {
        presetSlug: body.presetSlug ?? null,
        providerId: result.providerId,
        status: result.success ? 'sent' : 'failed',
      },
      ipAddress: getClientIp(request),
      status: result.success ? 'success' : 'failure',
    });
  } catch (err) {
    console.error('[application-email] audit log write failed:', err);
  }

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'Email send failed', data: { communication: result.communication } },
      { status: 502 },
    );
  }

  return NextResponse.json({ data: { communication: result.communication } });
}
