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
  /** '' when the homeowner gave only a phone (P21). */
  clientEmail: string;
  /** P21 - her phone. The identity itself when there is no email. */
  clientPhone?: string | null;
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
  const clientPhone = args.clientPhone?.trim() || null;
  // P21 - THE IDENTITY, READ ONCE. A letter with no email is addressed by
  // phone: no account is looked up, none is minted, and nothing is mailed.
  // Normalizing it is the database's job (normalize_client_invitation_phone,
  // 00650), so the number reaching the invitation and the number reaching the
  // consent ledger can never be two different readings of what she typed.
  const byPhone = !clientEmail;

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

  // NOT ASKED FOR A PHONE LETTER. profiles is keyed on the email, so asking it
  // about a homeowner who has none could only answer about somebody else - and
  // R13's notice ("you already have an account") cannot apply to a recipient
  // who, by construction, has no account to hold.
  let existingProfile: { id: string } | null = null;
  if (!byPhone) {
    const { data, error: existingProfileError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', clientEmail)
      .maybeSingle();
    if (existingProfileError) {
      return serverError(`Failed to check for an existing account: ${existingProfileError.message}`);
    }
    existingProfile = data;
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
    // A phone letter asks the same question of the column that holds ITS
    // identity, so writing to the same homeowner twice from the same sheet does
    // not fork her household.
    //
    // SQ-108 INFO-5 — ONE HOUSEHOLD, HOWEVER SHE TYPED THE NUMBER. That match
    // used to be on `client_phone` AS TYPED, so "(608) 555-0143" today and
    // "608-555-0143" next week were two different strings and one homeowner
    // became two roster rows, each with its own letters and its own activity.
    // The normalized reading already exists — `client_phone_e164`, kept by
    // 00583's trigger — and so does the one normalizer that writes it:
    // `normalize_phone_e164` (00281:81), the same rule
    // `normalize_client_invitation_phone` puts the letter's own phone through.
    // So the number is read through THAT function, once, and the roster is
    // asked about the normalized column. No second reading is written in
    // TypeScript, where it could only drift from the one the database holds.
    // A number it cannot read falls back to the typed column: the send is about
    // to be refused as `invalid_phone` anyway, and matching every unparseable
    // row against NULL would be worse than matching none.
    let matchColumn = 'client_email';
    let matchValue: string | null = clientEmail;
    if (byPhone) {
      const { data: normalizedPhone, error: normalizeError } =
        await adminClient.rpc('normalize_phone_e164', { p_phone: clientPhone });
      if (normalizeError) {
        return serverError(`Failed to read that phone number: ${normalizeError.message}`);
      }
      const e164 = typeof normalizedPhone === 'string' ? normalizedPhone.trim() : '';
      matchColumn = e164 ? 'client_phone_e164' : 'client_phone';
      matchValue = e164 || clientPhone;
    }
    const { data: onRoster, error: rosterError } = await adminClient
      .from('designer_clients')
      .select('id')
      .eq('designer_id', callerUser.id)
      .eq(matchColumn, matchValue)
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
          client_email: byPhone ? null : clientEmail,
          client_phone: clientPhone,
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
    // `phone` and the 'phone' kind are added ONLY when there is a phone to
    // reach her on, so an email letter's request body is byte-identical to the
    // one this route has always sent.
    body: JSON.stringify({
      designerClientId,
      email: clientEmail,
      clientName: clientName ?? null,
      projectId,
      note,
      kind: byPhone ? 'phone' : kind,
      writerId: callerUser.id,
      ...(clientPhone ? { phone: clientPhone } : {}),
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    profileId?: string | null;
    kind?: 'invite' | 'notice';
    /**
     * P21: what happened to her text — 'sms_sent', 'sms_deferred' (quiet hours
     * holds it for the morning) or 'sms_failed'. NOT a link: the capability is
     * the homeowner's own credential and the send is server-side end to end, so
     * it never comes back here and never reaches a browser (SQ-111 INFO-7).
     */
    deliver?: string;
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
  const label = clientName?.trim() || clientEmail || 'your client';

  // lens-4 §B.9: the actor is the designer, not the system. The transport
  // belongs in telemetry, not in a line a studio owner reads.
  //
  // SQ-111 INFO-7 — THE LINE SAYS WHAT HAPPENED. It used to say "a text is
  // next", written when the sending was still SQ-18's to build. The text goes
  // out inside this same send now, so the line reads the verdict it came back
  // with rather than promising something that may already have happened, been
  // held for the morning, or been refused. Her number is not repeated here; the
  // roster row holds it.
  const textLine = (deliver: string | undefined): string => {
    if (deliver === 'sms_sent') return 'sent by text';
    if (deliver === 'sms_deferred') return 'the text goes out in the morning';
    return 'the text has not gone out yet';
  };
  await adminClient.from('client_activity_log').insert({
    designer_client_id: designerClientId,
    activity_type: 'note',
    title: `${writerName} wrote to ${label}`,
    description: byPhone
      ? `Letter ${textLine(payload.deliver)} · ${note ? 'with a note' : 'no note'}`
      : `Letter sent to ${clientEmail} · ${note ? 'with a note' : 'no note'}`,
    actor_name: writerName,
    metadata: {
      actor_id: callerUser.id,
      client_email: clientEmail || null,
      letter: true,
      kind: payload.kind ?? kind,
      has_note: !!note,
      // Which identity carried the letter, and what happened to the text.
      // Neither the phone nor the capability token is written into this log.
      ...(byPhone ? { identity: 'phone', deliver: payload.deliver ?? null } : {}),
    },
  });

  return NextResponse.json({
    designerClientId,
    profileId,
    invited: true,
    alreadyExists: kind === 'notice',
    kind: payload.kind ?? kind,
    // P21 - what happened to her text, and nothing else. Present only for a
    // phone letter, so an email letter's response stays exactly the shape it
    // was. The capability link is gone from here (SQ-111 INFO-7): it is the
    // homeowner's credential, the send that uses it is server-side, and the one
    // thing shipping it to the designer's browser could do is leak it.
    ...(byPhone ? { deliver: payload.deliver ?? 'sms_pending' } : {}),
  });
}
