import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import {
  getAuthenticatedAdmin,
  badRequest,
  serverError,
  createAuditLog,
  getClientIp,
} from '@/lib/supabase-admin';
import {
  APPLICATION_TABLES,
  ONBOARDING_ROLE,
  getApplication,
  type ApplicationType,
} from '@/lib/applications';

function parseType(raw: string): ApplicationType | null {
  if (raw === 'designers') return 'designer';
  if (raw === 'makers') return 'maker';
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;

  const { type: rawType, id } = await params;
  const type = parseType(rawType);
  if (!type) return badRequest('Unknown application type');

  let body: {
    displayName?: string;
    roleName?: string;
    additionalRoleIds?: string[];
    personalObservation?: string;
  };
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }

  const table = APPLICATION_TABLES[type];

  try {
    const application = await getApplication(adminClient, type, id);

    if (application.auth_user_id) {
      return badRequest('Application has already been onboarded');
    }

    const email = application.email.toLowerCase().trim();
    const fallbackName =
      type === 'designer'
        ? [application.first_name, application.last_name].filter(Boolean).join(' ')
        : application.contact_name ?? application.brand_name ?? '';
    const displayName = body.displayName ?? fallbackName ?? undefined;

    let newUserId: string;
    let roleAssigned: string;

    if (type === 'designer') {
      // Branded invite through the designer-invite edge function (Wave 1 of
      // the designer-onboarding program): sets profiles.is_designer, assigns
      // the role, renders + sends the Resend-backed branded email (fails
      // loud if the email_templates row is missing), and best-effort enrolls
      // the new user in the Founding Invite sequence. Invoked via a client
      // bound to THIS admin's own session (not the service-role
      // adminClient) — the edge function verifies the caller by resolving a
      // real user from the forwarded Authorization JWT, which a service-role
      // bearer token cannot satisfy.
      // No fallback to application.review_notes — that field is internal
      // admin commentary and must never render inside the founder-voiced
      // invite letter. The admin must write the note deliberately.
      const personalObservation = (body.personalObservation ?? '').trim();
      if (!personalObservation) {
        return badRequest(
          "personalObservation is required — one specific, personal note about the designer's work; it appears in the invite letter",
        );
      }

      const sessionClient = await createServerClient();
      const { data: inviteData, error: inviteError } = await sessionClient.functions.invoke(
        'designer-invite',
        {
          body: {
            email,
            display_name: displayName,
            personal_observation: personalObservation,
            role: body.roleName,
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

      newUserId = result.userId;
      roleAssigned = body.roleName ?? ONBOARDING_ROLE[type];
    } else {
      // Maker onboarding is unchanged (Wave 1 scope is designers only —
      // designer-invite unconditionally sets is_designer, which would be
      // wrong for a manufacturer account).
      const { data: inviteResult, error: inviteError } =
        await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { display_name: displayName },
        });

      if (inviteError) return badRequest(inviteError.message);
      const newUser = inviteResult.user;
      if (!newUser) return serverError('Auth invite returned no user');

      await adminClient.from('profiles').upsert({
        id: newUser.id,
        display_name: displayName ?? null,
      });

      // Determine role(s)
      const primaryRoleName = body.roleName ?? ONBOARDING_ROLE[type];
      const { data: primaryRole } = await adminClient
        .from('roles')
        .select('id, name')
        .eq('name', primaryRoleName)
        .single();

      if (!primaryRole) {
        return serverError(`Onboarding role '${primaryRoleName}' not found in roles table`);
      }

      const roleInserts = [
        { user_id: newUser.id, role_id: primaryRole.id, granted_by: adminUser.id },
        ...(body.additionalRoleIds ?? []).map((roleId) => ({
          user_id: newUser.id,
          role_id: roleId,
          granted_by: adminUser.id,
        })),
      ];
      if (roleInserts.length > 0) {
        await adminClient.from('user_roles').insert(roleInserts);
      }

      newUserId = newUser.id;
      roleAssigned = primaryRoleName;
    }

    // Link back to application. Status moves to 'onboarding' — the lifecycle
    // will transition to 'active' once the applicant signs in (lazy-synced on
    // detail GET via reconcileActiveStatus).
    const nowIso = new Date().toISOString();
    await (adminClient as any)
      .from(table)
      .update({
        auth_user_id: newUserId,
        converted_at: nowIso,
        status: 'onboarding',
        reviewed_by: adminUser.id,
        reviewed_at: nowIso,
      })
      .eq('id', id);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: `application.${type}.onboard`,
      resourceType: 'application',
      resourceId: id,
      newValues: { auth_user_id: newUserId, role: roleAssigned, email },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      data: {
        userId: newUserId,
        email,
        roleAssigned,
      },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to onboard application');
  }
}
