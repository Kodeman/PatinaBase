import { NextResponse } from 'next/server';
import { createAdminClient } from '@patina/supabase/client';
import { createServerClient } from '@patina/supabase/server';

/**
 * Verify the caller is authenticated and has an admin-domain role.
 * Returns the user and a service-role admin client, or a 401/403 response.
 */
export async function getAuthenticatedAdmin(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const adminClient = createAdminClient();

  // Check the user has at least one admin-domain role
  const { data: adminRoles } = await adminClient
    .from('user_roles')
    .select('role_id, roles!inner(domain)')
    .eq('user_id', user.id)
    .eq('roles.domain', 'admin');

  if (!adminRoles || adminRoles.length === 0) {
    return { error: NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 }) };
  }

  return { user, adminClient };
}

/**
 * Insert an audit log entry.
 */
export async function createAuditLog(
  adminClient: ReturnType<typeof createAdminClient>,
  entry: {
    userId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    status?: 'success' | 'failure' | 'denied';
    ipAddress?: string;
    userAgent?: string;
  }
) {
  await adminClient.from('audit_logs').insert({
    user_id: entry.userId,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId,
    old_values: entry.oldValues as any,
    new_values: entry.newValues as any,
    metadata: entry.metadata as any,
    status: (entry.status ?? 'success') as any,
    ip_address: entry.ipAddress as any,
    user_agent: entry.userAgent,
  });
}

/**
 * Map a Supabase auth user + profile + roles into the User shape expected by the frontend.
 */
export function mapUserToResponse(
  authUser: { id: string; email?: string; email_confirmed_at?: string | null; banned_until?: string | null; created_at?: string; updated_at?: string },
  profile: { display_name?: string | null; avatar_url?: string | null } | null,
  roles: Array<{ id: string; name: string; description?: string | null; role_permissions?: Array<{ permissions: { id: string; name: string; description?: string | null; resource: string; action: string } | null }> }>,
) {
  // Determine status from ban state
  let status: 'active' | 'pending' | 'suspended' | 'banned' | 'deleted' = 'active';
  if (authUser.banned_until) {
    const banEnd = new Date(authUser.banned_until);
    // Permanent bans use very long durations (876000h = ~100 years)
    if (banEnd.getFullYear() > 2050) {
      status = 'banned';
    } else {
      status = 'suspended';
    }
  }
  if (!authUser.email_confirmed_at && status === 'active') {
    status = 'pending';
  }

  return {
    id: authUser.id,
    sub: authUser.id,
    email: authUser.email ?? '',
    emailVerified: !!authUser.email_confirmed_at,
    displayName: profile?.display_name ?? undefined,
    avatarUrl: profile?.avatar_url ?? undefined,
    status,
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? undefined,
      permissions: (r.role_permissions ?? [])
        .filter((rp) => rp.permissions)
        .map((rp) => ({
          id: rp.permissions!.id,
          code: rp.permissions!.name,
          description: rp.permissions!.description ?? undefined,
          resource: rp.permissions!.resource,
          action: rp.permissions!.action,
        })),
    })),
    createdAt: authUser.created_at ?? new Date().toISOString(),
    updatedAt: authUser.updated_at ?? new Date().toISOString(),
  };
}

/** Standard error helpers */
export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status: 400 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Extract client IP from request headers */
export function getClientIp(request: Request): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined
  );
}
