import { NextRequest, NextResponse } from 'next/server';
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

  let body: { displayName?: string; roleName?: string; additionalRoleIds?: string[] };
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

    // Invite user — creates auth user and sends magic-link invitation email
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

    // Link back to application
    const nowIso = new Date().toISOString();
    await (adminClient as any)
      .from(table)
      .update({
        auth_user_id: newUser.id,
        converted_at: nowIso,
        status: 'approved',
        reviewed_by: adminUser.id,
        reviewed_at: nowIso,
      })
      .eq('id', id);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: `application.${type}.onboard`,
      resourceType: 'application',
      resourceId: id,
      newValues: { auth_user_id: newUser.id, role: primaryRoleName, email },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      data: {
        userId: newUser.id,
        email,
        roleAssigned: primaryRoleName,
      },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to onboard application');
  }
}
