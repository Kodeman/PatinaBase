import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// GET /api/roles/[id]/users - Get users assigned to this role
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10)));
  const offset = (page - 1) * pageSize;

  try {
    const { count } = await adminClient
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role_id', id);

    const { data, error } = await adminClient
      .from('user_roles')
      .select('user_id, granted_at, granted_by, profiles!inner(id, display_name, avatar_url)')
      .eq('role_id', id)
      .order('granted_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) return serverError(error.message);

    // Get email addresses from auth
    const userIds = (data ?? []).map((d: any) => d.user_id);
    const emailMap = new Map<string, string>();
    if (userIds.length > 0) {
      // Fetch auth users in batches
      const { data: authData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      for (const u of authData?.users ?? []) {
        if (userIds.includes(u.id)) {
          emailMap.set(u.id, u.email ?? '');
        }
      }
    }

    const users = (data ?? []).map((d: any) => ({
      id: d.user_id,
      email: emailMap.get(d.user_id) ?? '',
      displayName: d.profiles?.display_name ?? undefined,
      avatarUrl: d.profiles?.avatar_url ?? undefined,
      assignedAt: d.granted_at,
      assignedBy: d.granted_by ?? undefined,
    }));

    return NextResponse.json({
      data: { data: users, meta: { total: count ?? 0, page, pageSize } },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to get role users');
  }
}

// POST /api/roles/[id]/users - Bulk assign role to users
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  let body: { userIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (!body.userIds || body.userIds.length === 0) return badRequest('userIds is required');

  try {
    let successCount = 0;
    const failures: Record<string, string> = {};

    for (const userId of body.userIds) {
      const { error } = await adminClient.from('user_roles').insert({
        user_id: userId,
        role_id: id,
        granted_by: adminUser.id,
      });
      if (error) {
        failures[userId] = error.code === '23505' ? 'Already assigned' : error.message;
      } else {
        successCount++;
      }
    }

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'role.bulk_assign',
      resourceType: 'role',
      resourceId: id,
      newValues: { userIds: body.userIds, successCount, failedCount: Object.keys(failures).length },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      data: { successCount, failedCount: Object.keys(failures).length, failures },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to bulk assign role');
  }
}

// DELETE /api/roles/[id]/users - Bulk remove role from users
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  let body: { userIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (!body.userIds || body.userIds.length === 0) return badRequest('userIds is required');

  try {
    const { error } = await adminClient
      .from('user_roles')
      .delete()
      .eq('role_id', id)
      .in('user_id', body.userIds);

    if (error) return serverError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'role.bulk_remove',
      resourceType: 'role',
      resourceId: id,
      newValues: { userIds: body.userIds },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      data: { successCount: body.userIds.length, failedCount: 0, failures: {} },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to bulk remove role');
  }
}
