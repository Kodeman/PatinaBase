import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedDesignerAdmin,
  badRequest,
  serverError,
} from '@/lib/supabase-admin';

interface InviteRequestBody {
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

  const { source = 'direct', notes, invite = true, designerClientId } = body;
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
  } | null = null;

  if (designerClientId) {
    const { data: row, error: rowError } = await (adminClient as any)
      .from('designer_clients')
      .select('id, designer_id, client_id, client_email, client_name')
      .eq('id', designerClientId)
      .eq('designer_id', callerUser.id)
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
              client_id: clientId,
              source,
              notes: notes ?? null,
              status: 'active',
            }
          : {
              designer_id: callerUser.id,
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
