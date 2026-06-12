/**
 * The Weekly Pulse email leg (The Document, R13). The in-transaction send
 * (`send_weekly_pulse` RPC) flips the pulse and posts the client portal
 * mirror; THIS route delivers the full-body Friday email where the client
 * lives — the inbox — using the journey-set Pulse template (@patina/email).
 *
 * Decoupled on purpose (I12): an email failure must NEVER roll back the
 * send. The client hook calls this after the RPC succeeds and treats a
 * failure here as non-fatal (the portal mirror already landed).
 *
 * Request: POST /api/pulse/send-email { pulseId: string }
 * Response: { ok: true, emailSent: boolean } | { error }
 */
import { createElement } from 'react';
import { NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { WeeklyPulse, sendEmail } from '@patina/email';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { pulseId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const pulseId = body.pulseId;
  if (!pulseId) {
    return NextResponse.json({ error: 'pulseId required' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // RLS scopes this to the designer's own pulses; only sent ones get a body.
  const { data: pulse, error: pulseErr } = await supabase
    .from('weekly_pulses')
    .select('id, project_id, designer_id, body, week_of, subject, status')
    .eq('id', pulseId)
    .single();
  if (pulseErr || !pulse) {
    return NextResponse.json({ error: 'pulse_not_found' }, { status: 404 });
  }
  if (pulse.status !== 'sent' || !pulse.body) {
    // The email leg only fires for an actually-sent pulse (the RPC ran first).
    return NextResponse.json({ error: 'pulse_not_sent' }, { status: 409 });
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, client_id, designer_id')
    .eq('id', pulse.project_id)
    .single();
  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
  }

  const [{ data: client }, { data: designer }] = await Promise.all([
    supabase.from('profiles').select('full_name, email').eq('id', project.client_id).single(),
    supabase.from('profiles').select('full_name').eq('id', project.designer_id).single(),
  ]);

  const recipient = client?.email?.trim();
  if (!recipient) {
    // No address on file — the portal mirror already reached the client.
    return NextResponse.json({ ok: true, emailSent: false, reason: 'no_recipient' });
  }

  const portalBase = process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL ?? 'https://client.patina.cloud';
  const result = await sendEmail({
    to: recipient,
    subject: pulse.subject?.trim() || `This week on ${project.name}`,
    // Cast bridges the React-19 ReactElement<unknown> vs <any> generic skew
    // between the app's and @patina/email's @types/react (the same friction
    // the whole email package carries; tolerated app-wide).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    react: createElement(WeeklyPulse, {
      clientName: client?.full_name ?? 'there',
      designerName: designer?.full_name ?? 'Your designer',
      projectName: project.name,
      body: pulse.body,
      weekOf: pulse.week_of ?? undefined,
      portalUrl: `${portalBase}/projects/${project.id}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  });

  if (!result.success) {
    // Non-fatal: the send already happened. Surface for logging, 200 so the
    // caller doesn't treat it as a send failure.
    return NextResponse.json({ ok: true, emailSent: false, error: result.error });
  }
  return NextResponse.json({ ok: true, emailSent: true, id: result.id });
}
