// Supabase Edge Function: workspace-member-invite
//
// POST / — a studio owner/admin invites a teammate to their workspace by
// email. The teammate may be a **designer** (granted the studio_designer role
// + is_designer, unlocking the designer portal + design-request pool) or a
// plain **collaborator** ('member'/'trades' — Field captures/scans, no designer
// powers). Brand-new users are minted server-side (email sign-in is
// shouldCreateUser:false, so invited teammates need an auth user already; the
// invite link also sidesteps prod's email-confirm requirement).
//
// Structure mirrors designer-invite/index.ts (render-from-DB + the single
// sendCompliantEmail chokepoint). The caller must be an ACTIVE owner/admin of
// the TARGET organization, OR a platform admin (roles.domain = 'admin') — the
// admin portal's studio roster invites through this same function (00556). The
// response reports which of the two acted as `actorKind`. Either way the
// organization itself must be `active`, else 409 organization_not_active.
//
// ── LOAD-BEARING ORDER ──────────────────────────────────────────────────────
// The organization_members row (status='invited') is inserted BEFORE any
// profiles.is_designer flip or studio_designer grant. Migration 00295's
// provision_studio_on_designer trigger skips users who already hold ANY
// membership row (any status), so inserting the membership first prevents a
// spurious personal studio from being minted for the invitee. Violating this
// order would give every invited designer their own throwaway studio.
//
// 00290's fc_sync_is_designer_from_role trigger (AFTER INSERT ON user_roles)
// is on this branch and would flip is_designer on its own — but the role
// grant above uses ignoreDuplicates, so no INSERT (and thus no trigger fire)
// happens when the role row already exists. For designer invites we
// therefore BOTH insert the role AND directly upsert profiles.is_designer =
// true: the direct upsert is intentional, not a pre-00290 workaround, and is
// idempotent alongside 00290's trigger (same value, either order).
//
// verify_jwt = true (config.toml). The platform verifies the caller's JWT; we
// then resolve the caller and require either an active owner/admin membership
// in the target organization or an admin-domain role before doing anything.
//
// Required env (auto-injected by the platform):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:
//   DESIGNER_PORTAL_URL — default https://app.patina.cloud
//   INVITE_FROM         — default 'Patina <hello@patina.cloud>'
//   ENVIRONMENT, EMAIL_DEV_MODE — gate whether the response echoes actionLink

// deno-lint-ignore-file no-explicit-any

import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { renderTemplateFromDb } from '../_shared/render-template.ts';
import { sendCompliantEmail } from '../_shared/send-email.ts';
import {
  type InviteEmailOutcome,
  inviteEmailOutcome,
  isInvitableOrgStatus,
  resolveInviteActor,
  TEMPLATE_MISSING_OUTCOME,
} from './lib.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DESIGNER_PORTAL_URL =
  Deno.env.get('DESIGNER_PORTAL_URL') ?? 'https://app.patina.cloud';
const INVITE_FROM = Deno.env.get('INVITE_FROM') ?? 'Patina <hello@patina.cloud>';

const STUDIO_DESIGNER_ROLE = 'studio_designer';
const INVITE_TTL_DAYS = 7;

type MemberRole = 'member' | 'admin' | 'guest';
type TeammateType = 'designer' | 'trades' | 'member';

interface InviteBody {
  organization_id?: string;
  email?: string;
  member_role?: string;
  teammate_type?: string;
  name?: string;
  job_title?: string;
  staff_role?: string;
}

// Browser-facing: the invite modal (designer portal) calls this via
// supabase.functions.invoke, which fires a CORS preflight (custom auth/apikey
// headers + JSON body → non-simple request). We MUST answer OPTIONS and echo
// these headers on every response — otherwise the browser blocks the call
// before the handler runs, and supabase-js surfaces a FunctionsFetchError
// ("Failed to send a request to the Edge Function"). Mirrors the proven
// create-checkout-session pattern.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Resolve the calling user from the forwarded Authorization header. */
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

/** First word of a display name, else the email local-part. */
function deriveFirstName(name: string | undefined, email: string): string {
  const source = (name ?? '').trim() || email.split('@')[0];
  return source.trim().split(/\s+/)[0] || email.split('@')[0];
}

async function handleInvite(req: Request): Promise<Response> {
  const caller = await getCallerUser(req);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: InviteBody;
  try {
    body = (await req.json()) as InviteBody;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const organizationId = body.organization_id?.trim();
  if (!organizationId) return json({ error: 'organization_id_required' }, 400);

  const email = body.email?.trim().toLowerCase();
  if (!email) return json({ error: 'email_required' }, 400);

  if (
    body.member_role &&
    body.member_role !== 'admin' &&
    body.member_role !== 'member' &&
    body.member_role !== 'guest'
  ) {
    return json({ error: 'invalid_member_role' }, 400);
  }
  const memberRole: MemberRole =
    body.member_role === 'admin' || body.member_role === 'guest'
      ? body.member_role
      : 'member';

  const teammateType: TeammateType =
    body.teammate_type === 'designer'
      ? 'designer'
      : body.teammate_type === 'trades'
        ? 'trades'
        : 'member';

  const name = body.name?.trim() || undefined;

  // Call Sheet (Wave 1): optional job_title / staff_role, written at insert
  // time. Both are free TEXT (vocab is code-resident in
  // packages/types/src/studio-config.ts) — trim + cap 120 chars, matching the
  // set_my_member_title RPC's own limit (00416).
  const jobTitle = body.job_title?.trim() || undefined;
  if (jobTitle && jobTitle.length > 120) {
    return json({ error: 'invalid_job_title' }, 400);
  }
  const staffRole = body.staff_role?.trim() || undefined;
  if (staffRole && staffRole.length > 120) {
    return json({ error: 'invalid_job_title' }, 400);
  }

  // ── Target organization (email copy; the gates fire after authz) ─────────
  // Fetched here for the studio name. Existence and status are GATED BELOW,
  // after authz — an unauthorized caller must not learn from a 404/409 whether
  // an organization id exists or what state it is in.
  const { data: org } = await admin
    .from('organizations')
    .select('name, status')
    .eq('id', organizationId)
    .maybeSingle();
  const studioName = (org as { name?: string } | null)?.name?.trim() || 'the studio';

  // ── Caller authz: active owner/admin of the org, else a platform admin ────
  const { data: callerMembership, error: authzError } = await admin
    .from('organization_members')
    .select('role, status')
    .eq('user_id', caller.id)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .in('role', ['owner', 'admin'])
    .maybeSingle();
  if (authzError) {
    console.error('workspace-member-invite: authz query failed', authzError);
    return json({ error: 'authz_query_failed' }, 500);
  }

  // Platform-admin bypass — the admin portal's studio roster invites through
  // this same function. Same check as designer-invite/index.ts callerIsAdmin()
  // and apps/admin-portal getAuthenticatedAdmin(); kept local so no _shared
  // edit forces a fleet-wide redeploy.
  let isPlatformAdmin = false;
  if (!callerMembership) {
    const { data: adminRoles, error: adminRoleError } = await admin
      .from('user_roles')
      .select('role_id, roles!inner(domain)')
      .eq('user_id', caller.id)
      .eq('roles.domain', 'admin');
    if (adminRoleError) {
      console.error('workspace-member-invite: admin role check failed', adminRoleError);
      return json({ error: 'authz_query_failed' }, 500);
    }
    isPlatformAdmin = (adminRoles?.length ?? 0) > 0;
  }

  const actorKind = resolveInviteActor({
    membership: callerMembership,
    isPlatformAdmin,
  });
  if (!actorKind) return json({ error: 'forbidden' }, 403);

  // Authorized — only now may the caller learn about the organization itself.
  // A suspended/deactivated studio takes no new invites from anyone, studio
  // admin or platform admin (00556 makes organizations.status load-bearing).
  if (!org) return json({ error: 'organization_not_found' }, 404);
  if (!isInvitableOrgStatus((org as { status?: string } | null)?.status)) {
    return json({ error: 'organization_not_active' }, 409);
  }

  const { data: inviterProfile } = await admin
    .from('profiles')
    .select('full_name, business_name, display_name')
    .eq('id', caller.id)
    .maybeSingle();
  const inviterName =
    (inviterProfile as any)?.full_name?.trim() ||
    (inviterProfile as any)?.business_name?.trim() ||
    (inviterProfile as any)?.display_name?.trim() ||
    (actorKind === 'platform_admin' ? 'The Patina team' : 'A studio admin');

  // 1. Generate the token first so it can ride inside the invite redirect.
  const token = crypto.randomUUID(); // 36 chars — fits invitation_token VARCHAR(64)
  const redirectTo = `${DESIGNER_PORTAL_URL}/auth/callback?next=${encodeURIComponent(
    '/auth/accept-invite?token=' + token,
  )}`;

  // 2. Mint / resolve the auth user. `invite` creates a brand-new user; on
  //    "already registered" fall back to `magiclink` so an existing user can be
  //    invited into the workspace too. (The link is only sent on the happy
  //    path — for an already-active member we early-return without emailing.)
  let genData: any;
  let genError: any;
  ({ data: genData, error: genError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: name ? { display_name: name } : undefined,
      redirectTo,
    },
  }));

  if (genError) {
    console.warn(
      'workspace-member-invite: invite generateLink failed, falling back to magiclink:',
      genError.message ?? genError,
    );
    ({ data: genData, error: genError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    }));
  }

  if (genError || !genData?.user) {
    console.error('workspace-member-invite: generateLink failed', genError);
    return json({ error: 'generate_link_failed', detail: genError?.message }, 502);
  }

  const userId: string = genData.user.id;
  const actionLink: string | undefined = genData.properties?.action_link;

  // 3. organization_members FIRST (load-bearing — see header). Re-invite
  //    semantics: active → 409 (no email); invited → refresh token/expiry;
  //    removed/suspended → flip back to invited with a new token.
  const { data: existing, error: existingError } = await admin
    .from('organization_members')
    .select('id, status')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (existingError) {
    console.error('workspace-member-invite: membership lookup failed', existingError);
    return json({ error: 'membership_lookup_failed' }, 500);
  }
  if ((existing as { status?: string } | null)?.status === 'active') {
    return json({ error: 'already_member' }, 409);
  }

  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const membershipUpsert: Record<string, unknown> = {
    user_id: userId,
    organization_id: organizationId,
    role: memberRole,
    status: 'invited',
    invitation_token: token,
    invitation_expires_at: expiresAt,
    invited_by: caller.id,
  };
  // Only set job_title/staff_role when the caller actually sent one — an
  // unconditional key here would NULL out an existing title on the re-invite
  // refresh path (existing → invited → active keeps this same upsert).
  if (jobTitle) membershipUpsert.job_title = jobTitle;
  if (staffRole) membershipUpsert.staff_role = staffRole;
  const { error: upsertError } = await admin.from('organization_members').upsert(
    membershipUpsert,
    { onConflict: 'user_id,organization_id' },
  );
  if (upsertError) {
    console.error('workspace-member-invite: membership upsert failed', upsertError);
    return json({ error: 'membership_upsert_failed' }, 500);
  }

  // 4. profiles upsert (email + optional display_name — NEVER is_designer here).
  const profileUpsert: Record<string, unknown> = { id: userId, email };
  if (name) profileUpsert.display_name = name;
  const { error: profileError } = await admin.from('profiles').upsert(profileUpsert);
  if (profileError) {
    console.error('workspace-member-invite: profile upsert failed', profileError);
    return json({ error: 'profile_upsert_failed' }, 500);
  }

  // 5. Designer teammate → grant studio_designer AND flip is_designer directly.
  //    Membership row (step 3) already suppresses the personal-studio trigger.
  if (teammateType === 'designer') {
    const { data: role, error: roleError } = await admin
      .from('roles')
      .select('id')
      .eq('name', STUDIO_DESIGNER_ROLE)
      .maybeSingle();
    if (roleError || !role) {
      console.error('workspace-member-invite: studio_designer role lookup failed', roleError);
      return json({ error: 'role_lookup_failed' }, 500);
    }
    const { error: grantError } = await admin.from('user_roles').upsert(
      { user_id: userId, role_id: (role as { id: string }).id, granted_by: caller.id },
      { onConflict: 'user_id,role_id', ignoreDuplicates: true },
    );
    if (grantError) {
      console.error('workspace-member-invite: role grant failed', grantError);
      return json({ error: 'role_grant_failed' }, 500);
    }
    // Direct is_designer flip — intentional and idempotent alongside 00290's
    // sync trigger (belt-and-suspenders for the ignoreDuplicates no-insert
    // case above). The membership row already exists, so 00295's trigger
    // no-ops on this update.
    const { error: designerFlagError } = await admin
      .from('profiles')
      .upsert({ id: userId, is_designer: true });
    if (designerFlagError) {
      console.error('workspace-member-invite: is_designer flip failed', designerFlagError);
      return json({ error: 'designer_flag_failed' }, 500);
    }
  }

  // 6. Render + send the branded invite. Past this line the membership is
  //    durably committed, so an email failure is REPORTED, never raised: the
  //    caller gets 200 with email_status='failed' plus an email_error, and the
  //    portal offers a resend rather than treating the whole invite as lost.
  //    Only pre-upsert validation/authz still answers with an error status.
  const isProd = Deno.env.get('ENVIRONMENT') === 'production';
  const emailDevMode = Deno.env.get('EMAIL_DEV_MODE');
  const includeActionLink = !isProd && !!emailDevMode;

  const respond = (outcome: InviteEmailOutcome) =>
    json({
      userId,
      email,
      status: 'invited',
      organizationId,
      teammateType,
      memberRole,
      actorKind,
      ...outcome,
      ...(includeActionLink ? { actionLink } : {}),
    });

  const firstName = deriveFirstName(name, email);
  const rendered = await renderTemplateFromDb(admin, 'workspace-invite', {
    first_name: firstName,
    inviter_name: inviterName,
    studio_name: studioName,
    action_link: actionLink ?? redirectTo,
  });
  if (!rendered) {
    console.error('workspace-member-invite: template_missing:workspace-invite');
    return respond(TEMPLATE_MISSING_OUTCOME);
  }

  const sendResult = await sendCompliantEmail(admin, {
    to: email,
    subject: rendered.subject || `You're invited to ${studioName} on Patina`,
    html: rendered.html,
    from: INVITE_FROM,
    userId,
    notificationType: 'workspace_invite',
    category: 'transactional',
    templateId: 'workspace-invite',
    metadata: {
      invite: true,
      template_id: 'workspace-invite',
      organization_id: organizationId,
      teammate_type: teammateType,
      member_role: memberRole,
    },
  });
  if (!sendResult.success && !sendResult.suppressed) {
    console.error('workspace-member-invite: send failed', sendResult.error);
  }

  return respond(inviteEmailOutcome(sendResult));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }
  return handleInvite(req);
});
