import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  mapUserToResponse,
  badRequest,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';

// GET /api/users - List users with optional filters
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const url = new URL(request.url);
  const query = url.searchParams.get('query') ?? '';
  const status = url.searchParams.get('status') ?? '';
  const role = url.searchParams.get('role') ?? '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10)));

  try {
    // Fetch auth users via admin API
    const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({
      page,
      perPage: pageSize,
    });
    if (authError) return serverError(authError.message);

    const authUsers = authData.users;
    const total = authData.total ?? authUsers.length;

    if (authUsers.length === 0) {
      return NextResponse.json({
        data: { data: [], meta: { total: 0, page, pageSize } },
      });
    }

    const userIds = authUsers.map((u) => u.id);

    // Fetch profiles and roles in parallel
    const [profilesRes, userRolesRes] = await Promise.all([
      adminClient.from('profiles').select('id, display_name, avatar_url').in('id', userIds),
      adminClient
        .from('user_roles')
        .select('user_id, roles!inner(id, name, description)')
        .in('user_id', userIds),
    ]);

    const profileMap = new Map(
      (profilesRes.data ?? []).map((p: any) => [p.id, p])
    );
    const roleMap = new Map<string, any[]>();
    for (const ur of userRolesRes.data ?? []) {
      const existing = roleMap.get((ur as any).user_id) ?? [];
      existing.push((ur as any).roles);
      roleMap.set((ur as any).user_id, existing);
    }

    let users = authUsers.map((u) =>
      mapUserToResponse(u, profileMap.get(u.id) ?? null, roleMap.get(u.id) ?? [])
    );

    // Apply filters client-side (Supabase admin.listUsers doesn't support these filters natively)
    if (query) {
      const q = query.toLowerCase();
      users = users.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          (u.displayName?.toLowerCase().includes(q) ?? false)
      );
    }
    if (status) {
      users = users.filter((u) => u.status === status);
    }
    if (role) {
      users = users.filter((u) => u.roles.some((r) => r.name === role || r.id === role));
    }

    return NextResponse.json({
      data: { data: users, meta: { total, page, pageSize } },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to list users');
  }
}

// POST /api/users - Create a new user
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;

  let body: { email?: string; displayName?: string; roleIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (!body.email) return badRequest('email is required');

  try {
    // Create auth user (sends invitation email automatically)
    const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
      email: body.email,
      email_confirm: false,
      user_metadata: { display_name: body.displayName },
    });

    if (createError) return badRequest(createError.message);
    const newUser = newUserData.user;

    // Create or update profile
    await adminClient.from('profiles').upsert({
      id: newUser.id,
      display_name: body.displayName ?? null,
    });

    // Assign roles if provided
    if (body.roleIds && body.roleIds.length > 0) {
      const roleInserts = body.roleIds.map((roleId) => ({
        user_id: newUser.id,
        role_id: roleId,
        granted_by: adminUser.id,
      }));
      await adminClient.from('user_roles').insert(roleInserts);
    }

    // Audit log
    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'user.create',
      resourceType: 'user',
      resourceId: newUser.id,
      newValues: { email: body.email, displayName: body.displayName, roleIds: body.roleIds },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    // Fetch the complete user to return
    const { data: roles } = await adminClient
      .from('user_roles')
      .select('roles!inner(id, name, description)')
      .eq('user_id', newUser.id);

    const { data: profile } = await adminClient
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', newUser.id)
      .single();

    return NextResponse.json({
      data: {
        user: mapUserToResponse(
          newUser,
          profile,
          (roles ?? []).map((r: any) => r.roles)
        ),
        invitationSent: true,
      },
    }, { status: 201 });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to create user');
  }
}
