import { NextRequest, NextResponse } from 'next/server';
import type { createAdminClient } from '@patina/supabase/client';
import { getAuthenticatedAdmin, createAuditLog, badRequest, notFound, serverError, getClientIp } from '@/lib/supabase-admin';
import { mapStudioRpcError } from '../../../_lib';

type AdminClient = ReturnType<typeof createAdminClient>;

// 'owner' is deliberately absent — ownership only moves through
// admin_transfer_studio_ownership.
const ASSIGNABLE_ROLES = ['admin', 'member', 'guest'] as const;
const TITLE_MAX_LENGTH = 120;

async function loadMember(adminClient: AdminClient, studioId: string, memberId: string) {
  const { data, error } = await adminClient
    .from('organization_members')
    .select('id, organization_id, user_id, role, status, organizations!inner(type)')
    .eq('id', memberId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.organization_id !== studioId) return null;
  const org = (data as { organizations?: { type?: string } | { type?: string }[] }).organizations;
  const orgType = Array.isArray(org) ? org[0]?.type : org?.type;
  if (orgType !== 'design_studio') return null;
  return data as unknown as {
    id: string;
    organization_id: string;
    user_id: string;
    role: string;
    status: string;
  };
}

// PATCH /api/admin/studios/[id]/members/[memberId] — role and/or title change.
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; memberId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id, memberId } = await context.params;

  let body: { role?: string; jobTitle?: string | null; staffRole?: string | null };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (body.role !== undefined) {
    if (body.role === 'owner') {
      return badRequest('Use transfer ownership to make someone the owner');
    }
    if (!(ASSIGNABLE_ROLES as readonly string[]).includes(body.role as string)) {
      return badRequest('role must be one of admin, member, guest');
    }
  }

  for (const field of ['jobTitle', 'staffRole'] as const) {
    const value = body[field];
    if (typeof value === 'string' && value.length > TITLE_MAX_LENGTH) {
      return badRequest(`${field} must be ${TITLE_MAX_LENGTH} characters or fewer`);
    }
  }

  const hasTitleUpdate = body.jobTitle !== undefined || body.staffRole !== undefined;

  try {
    const member = await loadMember(adminClient, id, memberId);
    if (!member) return notFound('Studio member not found');

    // Title first, then the role RPC: the RPC may change what the member is
    // allowed to be, so a rejected role change must not leave a title written
    // against a role that never landed.
    let titleResult: unknown = null;
    if (hasTitleUpdate) {
      const titleUpdates: Record<string, unknown> = {};
      if (body.jobTitle !== undefined) titleUpdates.job_title = body.jobTitle || null;
      if (body.staffRole !== undefined) titleUpdates.staff_role = body.staffRole || null;

      const { data: updated, error: updateError } = await adminClient
        .from('organization_members')
        .update(titleUpdates)
        .eq('id', memberId)
        .select()
        .maybeSingle();
      if (updateError) return serverError(updateError.message);
      titleResult = updated;

      await createAuditLog(adminClient, {
        userId: adminUser.id,
        action: 'studio.member.set_title',
        resourceType: 'organization',
        resourceId: id,
        organizationId: id,
        newValues: { memberId, userId: member.user_id, jobTitle: body.jobTitle, staffRole: body.staffRole },
        ipAddress: getClientIp(request),
        userAgent: request.headers.get('user-agent') ?? undefined,
      });
    }

    if (body.role !== undefined) {
      const { data, error } = await adminClient.rpc('admin_set_studio_member_role', {
        p_actor: adminUser.id,
        p_org_id: id,
        p_user_id: member.user_id,
        p_role: body.role as 'owner' | 'admin' | 'member' | 'guest',
      });
      if (error) return mapStudioRpcError(error.message);

      await createAuditLog(adminClient, {
        userId: adminUser.id,
        action: 'studio.member.set_role',
        resourceType: 'organization',
        resourceId: id,
        organizationId: id,
        newValues: { memberId, userId: member.user_id, role: body.role },
        ipAddress: getClientIp(request),
        userAgent: request.headers.get('user-agent') ?? undefined,
      });

      return NextResponse.json({ data });
    }

    if (hasTitleUpdate) return NextResponse.json({ data: titleResult });

    return badRequest('No updatable fields provided');
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to update studio member');
  }
}

// DELETE /api/admin/studios/[id]/members/[memberId] — remove member or cancel invite.
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; memberId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id, memberId } = await context.params;

  try {
    const member = await loadMember(adminClient, id, memberId);
    if (!member) return notFound('Studio member not found');

    const { error } = await adminClient.rpc('admin_remove_studio_member', {
      p_actor: adminUser.id,
      p_org_id: id,
      p_user_id: member.user_id,
    });
    if (error) return mapStudioRpcError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: member.status === 'invited' ? 'studio.invite.cancel' : 'studio.member.remove',
      resourceType: 'organization',
      resourceId: id,
      organizationId: id,
      newValues: { memberId, userId: member.user_id },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to remove studio member');
  }
}
