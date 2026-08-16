import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedDesignerAdmin,
  badRequest,
  serverError,
} from '@/lib/supabase-admin';

// The client (homeowner) accepting this invite must land on the CLIENT
// portal, not here. Without an explicit `redirectTo`, GoTrue falls back to
// its site_url default (the designer portal's origin) — a homeowner who
// clicks the email link would land in the designer's workspace instead of
// their own. Same env var + fallback the Weekly Pulse email leg already uses
// (see app/api/pulse/send-email/route.ts).
const CLIENT_PORTAL_URL =
  process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL ?? 'https://client.patina.cloud';

interface InviteRequestBody {
  studioId?: string;
  clientEmail?: string;
  clientName?: string;
  source?: 'direct' | 'referral';
  notes?: string;
  invite?: boolean;
  /**
   * R73 invite-on-send: when set, do NOT insert a new designer_clients row —
   * invite/link the profile for this EXISTING row (a captured household with
   * client_id NULL) and set its client_id. clientEmail defaults to the row's
   * client_email.
   */
  designerClientId?: string;
}

/**
 * POST /api/clients/invite
 *
 * Creates a designer_clients relationship and optionally invites the client
 * via Supabase Auth magic-link email — or, with `designerClientId`, links an
 * EXISTING designer_clients row (R73 invite-on-send).
 *
 * Branches:
 *  1. Profile exists → link to existing profile, skip auth invite.
 *  2. No profile + invite=true (default) → inviteUserByEmail, create profile + user_roles.
 *  3. No profile + invite=false → insert designer_clients with client_email/client_name only
 *     (new-row mode only; the existing-row mode always requires an invite/link).
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedDesignerAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: callerUser, adminClient } = auth;

  let body: InviteRequestBody;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return badRequest('Invalid JSON body');
  }

  const { studioId, source = 'direct', notes, invite = true, designerClientId } = body;
  if (!studioId) {
    return badRequest('studioId is required');
  }

  // This service-role route must not infer a workspace from current
  // memberships. The browser supplies one exact ID, and the route verifies
  // both the caller's live designer role and that exact active, non-guest
  // design-studio membership before any invite or write side effect.
  const [{ data: designerRole, error: roleError }, { data: membership, error: membershipError }] =
    await Promise.all([
      (adminClient as any)
        .from('user_roles')
        .select('role_id, roles!inner(domain)')
        .eq('user_id', callerUser.id)
        .eq('roles.domain', 'designer')
        .limit(1)
        .maybeSingle(),
      (adminClient as any)
        .from('organization_members')
        .select('id, organizations!inner(id,type,status)')
        .eq('user_id', callerUser.id)
        .eq('organization_id', studioId)
        .eq('status', 'active')
        .neq('role', 'guest')
        .eq('organizations.type', 'design_studio')
        .eq('organizations.status', 'active')
        .maybeSingle(),
    ]);
  if (roleError || membershipError) {
    return serverError('Failed to verify studio authority');
  }
  if (!designerRole || !membership) {
    return NextResponse.json({ error: 'Studio workspace not authorized' }, { status: 403 });
  }
  let clientName = body.clientName;
  const rawEmail = body.clientEmail;

  let clientEmail = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

  // ── R73: resolve the existing designer_clients row up front ──────────────
  // Ownership-guarded (designer_id must be the caller). The row's stored
  // contact info fills any gaps in the request body.
  let existingRow: {
    id: string;
    client_id: string | null;
    client_email: string | null;
    client_name: string | null;
    studio_id: string;
  } | null = null;

  if (designerClientId) {
    const { data: row, error: rowError } = await (adminClient as any)
      .from('designer_clients')
      .select('id, designer_id, studio_id, client_id, client_email, client_name')
      .eq('id', designerClientId)
      .eq('designer_id', callerUser.id)
      .eq('studio_id', studioId)
      .maybeSingle();

    if (rowError) {
      return serverError(`Failed to load client relationship: ${rowError.message}`);
    }
    if (!row) {
      return badRequest('Client relationship not found');
    }

    existingRow = row;

    // Already linked — idempotent success (another act got there first).
    if (row.client_id) {
      return NextResponse.json({
        designerClientId: row.id,
        profileId: row.client_id,
        invited: false,
        alreadyExists: true,
      });
    }

    if (!clientEmail) {
      clientEmail = (row.client_email ?? '').trim().toLowerCase();
    }
    if (!clientName) {
      clientName = row.client_name ?? undefined;
    }
    if (!clientEmail) {
      return badRequest('This client has no email on file — add one before inviting.');
    }
  }

  if (!clientEmail) {
    return badRequest('clientEmail is required');
  }

  try {
    // ── Step 1: Look up existing profile by email ────────────────────────────
    const { data: existingProfile } = await (adminClient as any)
      .from('profiles')
      .select('id, full_name, display_name')
      .eq('email', clientEmail)
      .maybeSingle();

    let clientId: string | null = null;
    let invited = false;
    let alreadyExists = false;

    if (existingProfile) {
      // ── Branch A: Profile exists — link without emailing ──────────────────
      clientId = existingProfile.id;
      alreadyExists = true;
      invited = false;
    } else if (invite) {
      // ── Branch B: No profile + invite=true — invite via Supabase Auth ─────
      const { data: inviteResult, error: inviteError } =
        await adminClient.auth.admin.inviteUserByEmail(clientEmail, {
          data: {
            display_name: clientName,
            full_name: clientName,
            role: 'client',
          },
          // Send the client to the CLIENT portal's callback, not GoTrue's
          // site_url default (the designer portal). client.patina.cloud/**
          // is already in the GoTrue redirect allow-list.
          redirectTo: `${CLIENT_PORTAL_URL}/auth/callback?type=invite`,
        });

      if (inviteError) {
        // GoTrue returns "User already registered" when the auth user exists
        // but the profiles row doesn't (race / partial earlier flow).
        // Surface a clean message rather than a raw 500.
        return badRequest(
          inviteError.message ?? 'Failed to send invite — user may already exist in auth',
        );
      }

      const newUser = inviteResult?.user;
      if (!newUser) {
        return serverError('Auth invite returned no user');
      }

      clientId = newUser.id;
      invited = true;

      // Upsert profile row — profiles.display_name is the column from the schema
      await (adminClient as any).from('profiles').upsert({
        id: newUser.id,
        email: clientEmail,
        display_name: clientName ?? null,
        full_name: clientName ?? null,
        role: 'client',
      });

      // Look up the 'client' role id and assign it
      const { data: clientRole } = await (adminClient as any)
        .from('roles')
        .select('id')
        .eq('name', 'client')
        .single();

      if (clientRole) {
        await (adminClient as any).from('user_roles').insert({
          user_id: newUser.id,
          role_id: clientRole.id,
          granted_by: callerUser.id,
        });
      }
    }
    // ── Branch C: No profile + invite=false — no email, no auth user ─────────
    // clientId stays null; we store contact info directly on the row.
    // (New-row mode only — linking an existing row without a profile would be
    // a no-op, so the R73 path requires the invite.)
    if (existingRow && clientId == null) {
      return badRequest('An invite is required to link this client.');
    }

    // ── Step 2: Write the designer_clients row ────────────────────────────────
    let designerClient: { id: string };

    if (existingRow) {
      // R73 — link the EXISTING row: set client_id from the resolved/created
      // profile. client_email/client_name stay in place for provenance (the
      // joined profile now leads on both).
      const { data: updated, error: dcError } = await (adminClient as any)
        .from('designer_clients')
        .update({ client_id: clientId })
        .eq('id', existingRow.id)
        .select()
        .single();

      if (dcError) {
        return serverError(`Failed to link client relationship: ${dcError.message}`);
      }
      designerClient = updated;
    } else {
      const insertData =
        clientId != null
          ? {
              designer_id: callerUser.id,
              studio_id: studioId,
              client_id: clientId,
              source,
              notes: notes ?? null,
              status: 'active',
            }
          : {
              designer_id: callerUser.id,
              studio_id: studioId,
              client_email: clientEmail,
              client_name: clientName ?? null,
              source,
              notes: notes ?? null,
              status: 'active',
            };

      const { data: inserted, error: dcError } = await (adminClient as any)
        .from('designer_clients')
        .insert(insertData)
        .select()
        .single();

      if (dcError) {
        return serverError(`Failed to create client relationship: ${dcError.message}`);
      }
      designerClient = inserted;
    }

    // ── Step 3: Look up caller's display name for the activity log ────────────
    const { data: callerProfile } = await (adminClient as any)
      .from('profiles')
      .select('display_name, full_name')
      .eq('id', callerUser.id)
      .maybeSingle();

    const actorName =
      callerProfile?.full_name ??
      callerProfile?.display_name ??
      callerUser.email ??
      'Unknown';

    // ── Step 4: Write audit row to client_activity_log ───────────────────────
    // Column names: designer_client_id, activity_type, title, description, actor_name, metadata
    // (There is no actor_id column in client_activity_log)
    const activityType = 'note'; // closest seeded value; 'invite_sent' is not seeded
    const activityTitle = invited
      ? `Invite sent to ${clientEmail}`
      : alreadyExists
        ? `Client linked (already had Patina account)`
        : `Client added (no invite)`;

    await (adminClient as any).from('client_activity_log').insert({
      designer_client_id: designerClient.id,
      activity_type: activityType,
      title: activityTitle,
      description: invited
        ? `Magic-link invite sent via Supabase Auth`
        : alreadyExists
          ? `Linked to existing profile ${clientId}`
          : `Contact info stored without sending invite`,
      actor_name: actorName,
      metadata: {
        actor_id: callerUser.id,
        client_email: clientEmail,
        invited,
        already_exists: alreadyExists,
        // R73 invite-on-send: true when this linked an existing captured row.
        linked_existing_row: !!existingRow,
      },
    });

    return NextResponse.json({
      designerClientId: designerClient.id,
      profileId: clientId,
      invited,
      alreadyExists,
    });
  } catch (err: any) {
    console.error('[clients/invite] Unexpected error:', err);
    return serverError(err?.message ?? 'Internal server error');
  }
}
