import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// POST /api/admin/designers/invite — standalone "Invite designer" admin
// action (designer-onboarding program, Wave 4). Distinct from the
// application-review onboard flow (api/admin/applications/[type]/[id]/
// onboard/route.ts) — this route lets an admin invite a designer who never
// filed an application. Same designer-invite edge function underneath, same
// personalObservation requirement and rationale (see that route's comment):
// it renders inside the founder-voiced invite letter, so it must be written
// deliberately, never defaulted or sourced from other free-text fields.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;

  let body: {
    email?: string;
    displayName?: string;
    personalObservation?: string;
    role?: string;
  };
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) return badRequest('email is required');

  const personalObservation = (body.personalObservation ?? '').trim();
  if (!personalObservation) {
    return badRequest(
      "personalObservation is required — one specific, personal note about the designer's work; it appears in the invite letter",
    );
  }

  const displayName = body.displayName?.trim() || undefined;
  const roleName = body.role?.trim() || undefined;

  try {
    // Invoked with THIS admin's own session client (not the service-role
    // adminClient) — designer-invite verifies the caller by resolving a real
    // user from the forwarded Authorization JWT, which a service-role bearer
    // token cannot satisfy. Same wiring as the onboard route's recent rewire.
    const sessionClient = await createServerClient();
    const { data: inviteData, error: inviteError } = await sessionClient.functions.invoke(
      'designer-invite',
      {
        body: {
          email,
          display_name: displayName,
          personal_observation: personalObservation,
          role: roleName,
        },
      },
    );

    if (inviteError) {
      return serverError(inviteError.message ?? 'Failed to send designer invite');
    }
    const result = inviteData as { userId?: string; email?: string } | null;
    if (!result?.userId) {
      return serverError('designer-invite returned no user id');
    }

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'designer.invite',
      resourceType: 'profile',
      resourceId: result.userId,
      newValues: { email, role: roleName ?? 'independent_designer' },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      data: { userId: result.userId, email: result.email ?? email },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to invite designer');
  }
}
