import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, createAuditLog, badRequest, serverError, getClientIp } from '@/lib/supabase-admin';
import { mapMemberRow, mapStudioRpcError, type MemberRow, type ProfileRow } from '../../_lib';

// 'owner' is deliberately absent — ownership only moves through
// admin_transfer_studio_ownership.
const ASSIGNABLE_ROLES = ['admin', 'member', 'guest'] as const;
const TEAMMATE_TYPES = ['member', 'designer', 'trades'] as const;

// GET /api/admin/studios/[id]/members — active + invited + suspended roster.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  try {
    const { data, error } = await adminClient
      .from('organization_members')
      .select(
        '*, organizations!inner(type), profiles!organization_members_user_id_fkey(id, email, display_name, avatar_url)',
      )
      .eq('organization_id', id)
      .eq('organizations.type', 'design_studio')
      .in('status', ['active', 'invited', 'suspended'])
      .order('created_at', { ascending: true });

    if (error) return serverError(error.message);

    const members = (data ?? []).map((row: any) =>
      mapMemberRow(row as MemberRow, (row.profiles as ProfileRow) ?? null),
    );

    return NextResponse.json({ data: members });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to list studio members');
  }
}

// POST /api/admin/studios/[id]/members — admin_add_studio_member.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  let body: {
    userId?: string;
    role?: string;
    teammateType?: string;
    jobTitle?: string;
    staffRole?: string;
  };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const userId = body.userId?.trim();
  if (!userId) return badRequest('userId is required');

  const role = body.role?.trim() || undefined;
  if (role === 'owner') return badRequest('Use transfer ownership to make someone the owner');
  if (role && !(ASSIGNABLE_ROLES as readonly string[]).includes(role)) {
    return badRequest('role must be one of admin, member, guest');
  }

  const teammateType = body.teammateType?.trim() || undefined;
  if (teammateType && !(TEAMMATE_TYPES as readonly string[]).includes(teammateType)) {
    return badRequest('teammateType must be one of member, designer, trades');
  }

  try {
    const { data, error } = await adminClient.rpc('admin_add_studio_member', {
      p_actor: adminUser.id,
      p_org_id: id,
      p_user_id: userId,
      p_role: role as 'owner' | 'admin' | 'member' | 'guest' | undefined,
      p_teammate_type: teammateType,
      p_job_title: body.jobTitle?.trim() || undefined,
      p_staff_role: body.staffRole?.trim() || undefined,
    });
    if (error) return mapStudioRpcError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'studio.member.add',
      resourceType: 'organization',
      resourceId: id,
      organizationId: id,
      newValues: { userId, role, teammateType },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to add studio member');
  }
}
