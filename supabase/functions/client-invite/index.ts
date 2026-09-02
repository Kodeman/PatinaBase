// Supabase Edge Function: client-invite
//
// POST /          — designer sends an invite to a client email
// POST /accept    — client (signed in) marks an invitation accepted
//
// Token landing happens at ${CLIENT_PORTAL_URL}/auth/invite/${token}; the
// landing route reads the row server-side via the service role.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  renderBrandedShell,
  paragraph,
  muted,
  callout,
  ctaButton,
  spacer,
  escapeHtml,
} from '../_shared/branded-email.ts';
import {
  resolveStudioIdentity,
  studioCobrand,
  studioDisplayName,
} from '../_shared/studio-identity.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_ADDRESS = Deno.env.get('RESEND_FROM') ?? 'hello@patina.cloud';
const CLIENT_PORTAL_URL =
  Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';

interface SendBody {
  email?: string;
  projectId?: string | null;
  personalMessage?: string | null;
}

interface AcceptBody {
  token?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function generateToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
}

async function getCallerUser(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

async function handleSend(req: Request): Promise<Response> {
  const user = await getCallerUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const email = body.email?.trim().toLowerCase();
  if (!email) return json({ error: 'email_required' }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Resolve designer name for the email body.
  const { data: designer } = await admin
    .from('profiles')
    .select('full_name, business_name, email')
    .eq('id', user.id)
    .maybeSingle();

  // Studio co-brand (Designer Studios). Prefer a project's studio when the
  // invite is scoped to one; otherwise the designer's primary studio.
  const identity = await resolveStudioIdentity(admin, {
    projectId: body.projectId ?? null,
    designerId: user.id,
  });
  const designerName =
    (designer as { full_name?: string | null } | null)?.full_name?.trim() ??
    (designer as { business_name?: string | null } | null)?.business_name?.trim() ??
    identity?.name ??
    'Your designer';
  const senderName = studioDisplayName(identity, designerName);
  const cobrand = studioCobrand(identity);

  let projectName: string | null = null;
  if (body.projectId) {
    const { data: project } = await admin
      .from('projects')
      .select('name')
      .eq('id', body.projectId)
      .maybeSingle();
    projectName = (project as { name?: string | null } | null)?.name ?? null;
  }

  const token = generateToken();
  const { error: insErr } = await admin.from('client_invitations').insert({
    token,
    email,
    designer_id: user.id,
    project_id: body.projectId ?? null,
    personal_message: body.personalMessage ?? null,
  });
  if (insErr) {
    console.error('client-invite: insert failed', insErr);
    return json({ error: 'insert_failed' }, 500);
  }

  const link = `${CLIENT_PORTAL_URL}/auth/invite/${token}`;
  const personalBlock = body.personalMessage
    ? callout(escapeHtml(body.personalMessage))
    : '';
  const projectLine = projectName
    ? paragraph(`<strong style="color:#1F1B16; font-weight:600;">Project:</strong> ${escapeHtml(projectName)}`)
    : '';
  const subject = `${senderName} invited you to Patina`;
  const html = renderBrandedShell({
    title: subject,
    preview: `${senderName} would like to collaborate with you on Patina.`,
    eyebrow: 'Invitation',
    studioName: cobrand.studioName,
    studioLogoUrl: cobrand.studioLogoUrl,
    body: [
      paragraph('Hi,'),
      paragraph(`${escapeHtml(designerName)} would like to collaborate with you on Patina.`),
      personalBlock,
      projectLine,
      spacer(6),
      ctaButton(link, 'Accept invitation', 'brass'),
      spacer(10),
      muted(
        `This invitation expires in 7 days. If the button doesn&rsquo;t work, copy this link:<br><a href="${link}" style="color:#4E7A66; text-decoration:underline; word-break:break-all;">${link}</a>`,
      ),
      paragraph('— Patina'),
    ].join(''),
  });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: email, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('client-invite: Resend failed', res.status, text);
    return json({ error: 'send_failed', detail: text }, 502);
  }

  return json({ ok: true, token });
}

async function handleAccept(req: Request): Promise<Response> {
  const user = await getCallerUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: AcceptBody;
  try {
    body = (await req.json()) as AcceptBody;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const token = body.token?.trim();
  if (!token) return json({ error: 'token_required' }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: invite, error } = await admin
    .from('client_invitations')
    .select('id, email, expires_at, accepted_at, designer_id')
    .eq('token', token)
    .maybeSingle();
  if (error) {
    console.error('client-invite: lookup failed', error);
    return json({ error: 'lookup_failed' }, 500);
  }
  if (!invite) return json({ error: 'not_found' }, 404);

  const inv = invite as {
    id: string;
    email: string;
    expires_at: string;
    accepted_at: string | null;
    designer_id: string;
  };
  if (inv.accepted_at) return json({ error: 'already_accepted' }, 409);
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return json({ error: 'expired' }, 410);
  }
  if (user.email && user.email.toLowerCase() !== inv.email.toLowerCase()) {
    return json({ error: 'email_mismatch' }, 403);
  }

  const { error: updErr } = await admin
    .from('client_invitations')
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq('id', inv.id);
  if (updErr) {
    console.error('client-invite: accept update failed', updErr);
    return json({ error: 'update_failed' }, 500);
  }

  // Label the accepting account a client (ruling B2 v3(d), migration 00555).
  //
  // handle_new_user gives every signup with no explicit 'homeowner' hint
  // profiles.role = 'designer' — that is the pre-00555 default and 00555
  // deliberately leaves it alone. The client-portal invite-accept form signs up
  // over email/password with no hint (AcceptInviteForm.tsx:64), so a client who
  // arrives through this invitation lands labelled a designer.
  //
  // This handler is the one server-side moment that KNOWS the caller is a
  // client: they hold an unexpired client_invitations token addressed to their
  // own email. So it corrects the label here, as service_role — the only
  // principal that may write the column upward or sideways. profiles.role is a
  // label, not authority (00555 §a2), so this changes what the person is CALLED
  // — comms_resolve_role, the funnel views, the onboarding automation — and
  // grants nothing.
  //
  // CONSTRAINT (no test file exists for this function; this comment is the
  // contract): the write must stay scoped to the accepting user's OWN id, must
  // run only after the invitation has been validated and marked accepted, and
  // must NOT fail the request. An invitation that was accepted but left
  // mislabelled is a cosmetic defect the Block B7 backfill sweeps up; an
  // invitation that reports failure after accepted_at is already written is a
  // stuck client. Log and continue.
  //
  // Known and accepted: a real DESIGNER who accepts a client invitation
  // addressed to their own email is relabelled too. Their authority is
  // untouched — profiles.is_designer and their user_roles grants are not
  // written here, and nothing in the schema reads role for authorization — so
  // the cost is the word beside their name in a comms thread until an admin
  // resets it. Guarding on is_designer was considered and not taken: it would
  // make this handler's behaviour depend on a column it has no business
  // reading, for a case that is one person accepting their own client invite.
  // The `.neq` keeps the common re-accept a no-op.
  const { error: roleErr } = await admin
    .from('profiles')
    .update({ role: 'homeowner' })
    .eq('id', user.id)
    .neq('role', 'homeowner');
  if (roleErr) {
    console.error('client-invite: accept role relabel failed', roleErr);
  }

  return json({ ok: true, designerId: inv.designer_id });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const url = new URL(req.url);
  if (url.pathname.endsWith('/accept')) return handleAccept(req);
  return handleSend(req);
});
