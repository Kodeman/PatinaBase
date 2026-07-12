// Supabase Edge Function: designer-invite
//
// POST / — admin sends a branded designer invite (replaces the plain
// `adminClient.auth.admin.inviteUserByEmail()` call the admin-portal onboard
// route used to make directly). Structure mirrors client-invite/index.ts;
// unlike client-invite (any authenticated user may invite a client), the
// caller here MUST hold an admin-domain role — this function mints an
// account, flips is_designer, and assigns a role, so it is admin-only.
//
// Behavior:
//   1. Verify the caller is authenticated AND holds an admin-domain role
//      (user_roles JOIN roles, domain = 'admin' — same check as the
//      admin-portal's getAuthenticatedAdmin()).
//   2. Resolve the target role (default independent_designer, overridable).
//   3. Mint an invite link via admin.generateLink({ type: 'invite', ... }),
//      landing at `${DESIGNER_PORTAL_URL}/auth/callback?next=/desk`. If the
//      email already has an account (generateLink invite fails), fall back
//      to a magiclink so an existing user can still be onboarded.
//   4. Upsert profiles.is_designer = true + display_name, and insert the
//      user_roles grant (the 00290 trigger also flips is_designer from this
//      insert — belt-and-suspenders since the upsert here is synchronous
//      with the response).
//   5. Render the branded email from email_templates (slug 'designer-invite')
//      via the shared renderer. FAILS LOUD (500) if the template row is
//      missing or inactive — never falls back to an unbranded send.
//   6. Send via the single sendCompliantEmail chokepoint.
//   7. Best-effort enroll the new user into the "Founding Invite" automated
//      sequence, if (and only if) that sequence exists and is active — this
//      is a rollout gate for a later wave that seeds the sequence itself.
//
// Required env (auto-injected by the platform):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:
//   DESIGNER_PORTAL_URL — default https://app.patina.cloud
//   INVITE_FROM — default 'Kody at Patina <kody@patina.cloud>'
//   ENVIRONMENT, EMAIL_DEV_MODE — gate whether the response echoes actionLink

// deno-lint-ignore-file no-explicit-any

import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { renderTemplateFromDb } from '../_shared/render-template.ts';
import { sendCompliantEmail } from '../_shared/send-email.ts';
import { capturePosthogEvent } from '../_shared/posthog.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DESIGNER_PORTAL_URL =
  Deno.env.get('DESIGNER_PORTAL_URL') ?? 'https://app.patina.cloud';
const INVITE_FROM =
  Deno.env.get('INVITE_FROM') ?? 'Kody at Patina <kody@patina.cloud>';
const DEFAULT_ROLE_NAME = 'independent_designer';
const FOUNDING_INVITE_SEQUENCE_NAME = 'Founding Invite';

interface InviteBody {
  email?: string;
  display_name?: string;
  personal_observation?: string;
  role?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getCallerUser(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

/** Same check as apps/admin-portal/src/lib/supabase-admin.ts getAuthenticatedAdmin(). */
async function callerIsAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('user_roles')
    .select('role_id, roles!inner(domain)')
    .eq('user_id', userId)
    .eq('roles.domain', 'admin');
  if (error) {
    console.error('designer-invite: admin role check failed', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Best-effort enrollment into the "Founding Invite" automated_sequences row.
 * Silently no-ops if the sequence doesn't exist yet or isn't active — this is
 * a deliberate rollout gate for a later wave that seeds the sequence.
 * ON CONFLICT (sequence_id, user_id) DO NOTHING semantics via ignoreDuplicates;
 * total_enrolled is incremented only on an actual (non-duplicate) insert,
 * matching the read-then-write counter pattern in automation-processor.
 */
async function enrollFoundingInvite(admin: SupabaseClient, userId: string): Promise<void> {
  try {
    const { data: sequence, error: seqError } = await admin
      .from('automated_sequences')
      .select('id, total_enrolled')
      .eq('name', FOUNDING_INVITE_SEQUENCE_NAME)
      .eq('status', 'active')
      .maybeSingle();
    if (seqError || !sequence) return;

    const { data: inserted, error: enrollError } = await admin
      .from('sequence_enrollments')
      .upsert(
        {
          sequence_id: sequence.id,
          user_id: userId,
          current_step: 0,
          status: 'active',
          next_step_at: new Date().toISOString(),
        },
        { onConflict: 'sequence_id,user_id', ignoreDuplicates: true },
      )
      .select('id');
    if (enrollError) {
      console.error('designer-invite: sequence enrollment failed', enrollError);
      return;
    }
    if (inserted && inserted.length > 0) {
      await admin
        .from('automated_sequences')
        .update({ total_enrolled: (sequence.total_enrolled ?? 0) + 1 })
        .eq('id', sequence.id);
    }
  } catch (err) {
    console.error('designer-invite: enrollFoundingInvite threw', err);
  }
}

async function handleInvite(req: Request): Promise<Response> {
  const caller = await getCallerUser(req);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!(await callerIsAdmin(admin, caller.id))) {
    return json({ error: 'forbidden' }, 403);
  }

  let body: InviteBody;
  try {
    body = (await req.json()) as InviteBody;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) return json({ error: 'email_required' }, 400);

  const personalObservation = body.personal_observation?.trim();
  if (!personalObservation) {
    return json({ error: 'personal_observation_required' }, 400);
  }

  const displayName = body.display_name?.trim() || undefined;
  const roleName = body.role?.trim() || DEFAULT_ROLE_NAME;

  const { data: role, error: roleError } = await admin
    .from('roles')
    .select('id, name')
    .eq('name', roleName)
    .maybeSingle();
  if (roleError) {
    console.error('designer-invite: role lookup failed', roleError);
    return json({ error: 'role_lookup_failed' }, 500);
  }
  if (!role) {
    return json({ error: `role_not_found:${roleName}` }, 400);
  }

  const redirectTo = `${DESIGNER_PORTAL_URL}/auth/callback?next=/desk`;

  let genData: any;
  let genError: any;
  ({ data: genData, error: genError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: displayName ? { display_name: displayName } : undefined,
      redirectTo,
    },
  }));

  if (genError) {
    // Most commonly: "User already registered" — fall back to a magic link so
    // an existing account can still be (re)onboarded as a designer.
    console.warn(
      'designer-invite: invite generateLink failed, falling back to magiclink:',
      genError.message ?? genError,
    );
    ({ data: genData, error: genError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    }));
  }

  if (genError || !genData?.user) {
    console.error('designer-invite: generateLink failed', genError);
    return json({ error: 'generate_link_failed', detail: genError?.message }, 502);
  }

  const userId: string = genData.user.id;
  const actionLink: string | undefined = genData.properties?.action_link;

  // ── Upsert profile + role grant ──────────────────────────────────────────
  const profileUpsert: Record<string, unknown> = { id: userId, is_designer: true };
  if (displayName) profileUpsert.display_name = displayName;
  const { error: profileError } = await admin.from('profiles').upsert(profileUpsert);
  if (profileError) {
    console.error('designer-invite: profile upsert failed', profileError);
    return json({ error: 'profile_upsert_failed' }, 500);
  }

  const { error: roleInsertError } = await admin.from('user_roles').upsert(
    { user_id: userId, role_id: role.id, granted_by: caller.id },
    { onConflict: 'user_id,role_id', ignoreDuplicates: true },
  );
  if (roleInsertError) {
    console.error('designer-invite: role grant failed', roleInsertError);
    return json({ error: 'role_grant_failed' }, 500);
  }

  // ── Render + send the branded email (fail loud — never send unbranded) ──
  const firstName = (displayName ?? email.split('@')[0]).trim().split(/\s+/)[0];
  const rendered = await renderTemplateFromDb(admin, 'designer-invite', {
    first_name: firstName,
    personal_observation: personalObservation,
    action_link: actionLink ?? redirectTo,
  });
  if (!rendered) {
    console.error('designer-invite: template_missing:designer-invite');
    return json({ error: 'template_missing:designer-invite' }, 500);
  }

  const sendResult = await sendCompliantEmail(admin, {
    to: email,
    subject: rendered.subject || 'An invitation to Patina',
    html: rendered.html,
    from: INVITE_FROM,
    userId,
    notificationType: 'designer_invite',
    category: 'transactional',
    templateId: 'designer-invite',
    metadata: { invite: true, template_id: 'designer-invite' },
  });
  if (!sendResult.success && !sendResult.suppressed) {
    console.error('designer-invite: send failed', sendResult.error);
    return json({ error: 'send_failed', detail: sendResult.error }, 502);
  }

  // ── Measurement (non-fatal — capturePosthogEvent never throws) ──────────
  // Email domain only, never the full address, in an analytics property.
  await capturePosthogEvent(userId, 'designer_invite_sent', {
    email_domain: email.split('@')[1] ?? '',
    invited_by: caller.id,
    surface: 'admin-web',
  });

  // ── Best-effort sequence enrollment (rollout-gated) ─────────────────────
  await enrollFoundingInvite(admin, userId);

  const isProd = Deno.env.get('ENVIRONMENT') === 'production';
  const emailDevMode = Deno.env.get('EMAIL_DEV_MODE');
  const includeActionLink = !isProd && !!emailDevMode;

  return json({
    userId,
    email,
    ...(includeActionLink ? { actionLink } : {}),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  return handleInvite(req);
});
