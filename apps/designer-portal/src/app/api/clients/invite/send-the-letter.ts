import { NextResponse } from 'next/server';
import { badRequest, serverError } from '@/lib/supabase-admin';

const FUNCTIONS_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;

/**
 * The letter path. Everything today's Branch B does for the auth account, the
 * profile and the role grant now happens INSIDE the client-invite edge
 * function — that function is the one place that knows whether GoTrue minted a
 * new user, and notification_log.user_id is NOT NULL, so the account must exist
 * before the send. This route keeps what it has always owned: the
 * designer_clients row and the activity log.
 *
 * Split out of route.ts: a route module may only export HTTP method handlers
 * (GET/POST/etc.) and a small allow-list of config fields — anything else
 * trips Next's route-module type check (`.next/types/app/**\/route.ts`
 * fails with "Property 'sendTheLetter' is incompatible with index
 * signature"). This function is exported for `__tests__/send-the-letter.test.ts`
 * only, so it lives in its own non-route module.
 */
export async function sendTheLetter(args: {
  adminClient: any;
  callerUser: { id: string; email?: string | null };
  clientEmail: string;
  clientName?: string;
  source: 'direct' | 'referral';
  notes?: string;
  existingRow: { id: string } | null;
  note: string | null;
  projectId: string | null;
}) {
  const {
    adminClient, callerUser, clientEmail, clientName, source, notes,
    existingRow, note, projectId,
  } = args;

  // R8/R11: projectId is body-supplied and drives both the edge function's
  // studio-identity resolution and the note it seeds into that project — so a
  // caller-owned project is confirmed here, before either happens. "Owns"
  // mirrors R11's authorship rule: the project's lead designer, or any active
  // member of the project's studio.
  if (projectId) {
    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('id, designer_id, studio_id')
      .eq('id', projectId)
      .maybeSingle();
    if (projectError) {
      return serverError(`Failed to verify project access: ${projectError.message}`);
    }
    // Mirrors is_active_org_member (00556: role <> 'guest' AND
    // organizations.status = 'active' — "a suspended/deactivated organization
    // confers no co-membership") rather than calling that RPC directly: it
    // reads auth.uid() and this route only holds a service-role adminClient,
    // which has no caller JWT, so the RPC would always resolve false here.
    let hasAccess = !!project && project.designer_id === callerUser.id;
    if (!hasAccess && project?.studio_id) {
      const { data: membership } = await adminClient
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', project.studio_id)
        .eq('user_id', callerUser.id)
        .eq('status', 'active')
        .neq('role', 'guest')
        .maybeSingle();
      if (membership) {
        const { data: org } = await adminClient
          .from('organizations')
          .select('status')
          .eq('id', project.studio_id)
          .maybeSingle();
        hasAccess = org?.status === 'active';
      }
    }
    if (!hasAccess) {
      return badRequest('Project not found');
    }
  }

  const { data: existingProfile, error: existingProfileError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', clientEmail)
    .maybeSingle();
  if (existingProfileError) {
    return serverError(`Failed to check for an existing account: ${existingProfileError.message}`);
  }

  // R13: an account that already exists gets the short notice letter, never a
  // silent link. Today this branch tells the designer an invite went and sends
  // the homeowner nothing.
  const kind: 'invite' | 'notice' = existingProfile ? 'notice' : 'invite';

  // Write (or link) the roster row FIRST, so the letter can carry the
  // designer_client_id the People Room row reads its status through.
  let designerClientId: string;
  if (existingRow) {
    designerClientId = existingRow.id;
  } else {
    // Add Person carries no designerClientId, so an email already on this
    // designer's roster used to fall straight into the insert and hit
    // idx_designer_clients_unique_email (designer_id, client_email) — a 500,
    // and no letter. Reuse the row instead, exactly as the R73 branch does.
    const { data: onRoster, error: rosterError } = await adminClient
      .from('designer_clients')
      .select('id')
      .eq('designer_id', callerUser.id)
      .eq('client_email', clientEmail)
      .limit(1)
      .maybeSingle();
    if (rosterError) {
      return serverError(`Failed to check your roster: ${rosterError.message}`);
    }
    if (onRoster) {
      designerClientId = onRoster.id;
    } else {
      const { data: inserted, error: dcError } = await adminClient
        .from('designer_clients')
        .insert({
          designer_id: callerUser.id,
          client_email: clientEmail,
          client_name: clientName ?? null,
          source,
          notes: notes ?? null,
          status: 'active',
        })
        .select('id')
        .single();
      if (dcError) {
        return serverError(`Failed to create client relationship: ${dcError.message}`);
      }
      designerClientId = inserted.id;
    }
  }

  const upstream = `${FUNCTIONS_BASE.replace(/\/$/, '')}/client-invite`;
  const res = await fetch(upstream, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      designerClientId,
      email: clientEmail,
      clientName: clientName ?? null,
      projectId,
      note,
      kind,
      writerId: callerUser.id,
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    profileId?: string | null;
    kind?: 'invite' | 'notice';
    error?: string;
  };
  if (!res.ok) {
    return badRequest(payload.error ?? 'Could not send the letter just now.');
  }

  const profileId = payload.profileId ?? null;
  if (profileId) {
    await adminClient
      .from('designer_clients')
      .update({ client_id: profileId })
      .eq('id', designerClientId);
  }

  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('display_name, full_name')
    .eq('id', callerUser.id)
    .maybeSingle();
  const writerName =
    callerProfile?.full_name ?? callerProfile?.display_name ?? callerUser.email ?? 'Someone';
  const label = clientName?.trim() || clientEmail;

  // lens-4 §B.9: the actor is the designer, not the system. The transport
  // belongs in telemetry, not in a line a studio owner reads.
  await adminClient.from('client_activity_log').insert({
    designer_client_id: designerClientId,
    activity_type: 'note',
    title: `${writerName} wrote to ${label}`,
    description: `Letter sent to ${clientEmail} · ${note ? 'with a note' : 'no note'}`,
    actor_name: writerName,
    metadata: {
      actor_id: callerUser.id,
      client_email: clientEmail,
      letter: true,
      kind: payload.kind ?? kind,
      has_note: !!note,
    },
  });

  return NextResponse.json({
    designerClientId,
    profileId,
    invited: true,
    alreadyExists: kind === 'notice',
    kind: payload.kind ?? kind,
  });
}
