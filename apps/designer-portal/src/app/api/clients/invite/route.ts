import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedDesignerAdmin,
  badRequest,
  serverError,
} from '@/lib/supabase-admin';

interface InviteRequestBody {
  clientEmail: string;
  clientName?: string;
  source?: 'direct' | 'referral';
  notes?: string;
  invite?: boolean;
}

/**
 * POST /api/clients/invite
 *
 * Creates a designer_clients relationship and optionally invites the client
 * via Supabase Auth magic-link email.
 *
 * Branches:
 *  1. Profile exists → link to existing profile, skip auth invite.
 *  2. No profile + invite=true (default) → inviteUserByEmail, create profile + user_roles.
 *  3. No profile + invite=false → insert designer_clients with client_email/client_name only.
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

  const { clientName, source = 'direct', notes, invite = true } = body;
  const rawEmail = body.clientEmail;

  if (!rawEmail || typeof rawEmail !== 'string') {
    return badRequest('clientEmail is required');
  }

  const clientEmail = rawEmail.trim().toLowerCase();

  if (!clientEmail) {
    return badRequest('clientEmail cannot be blank');
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

    // ── Step 2: Insert designer_clients row ──────────────────────────────────
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

    const { data: designerClient, error: dcError } = await (adminClient as any)
      .from('designer_clients')
      .insert(insertData)
      .select()
      .single();

    if (dcError) {
      return serverError(`Failed to create client relationship: ${dcError.message}`);
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
