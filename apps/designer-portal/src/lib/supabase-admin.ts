/**
 * Designer-portal server-side admin helpers.
 *
 * IMPORTANT: This file must never be imported from client components.
 * The guard below will blow up loudly if it is.
 */
if (typeof window !== 'undefined') {
  throw new Error('supabase-admin must not be imported in client code');
}

import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@patina/supabase/client';
import { createServerClient } from '@patina/supabase/server';

type AuthenticatedDesignerAdminResult =
  | {
      user: User;
      adminClient: ReturnType<typeof createAdminClient>;
      error?: never;
    }
  | {
      error: NextResponse;
      user?: never;
      adminClient?: never;
    };

/**
 * Validate the caller is authenticated and has a designer-domain or admin-domain role.
 * Returns `{ user, adminClient }` on success, or `{ error: NextResponse }` on failure.
 *
 * Permitted role domains: 'designer' | 'admin'
 */
export async function getAuthenticatedDesignerAdmin(
  request: NextRequest,
): Promise<AuthenticatedDesignerAdminResult> {
  // Validate the caller's session cookie
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // Build service-role admin client — bypasses RLS
  const adminClient = createAdminClient();

  // Check the user has at least one designer-domain or admin-domain role
  const { data: designerRoles } = await adminClient
    .from('user_roles')
    .select('role_id, roles!inner(domain)')
    .eq('user_id', user.id)
    .in('roles.domain', ['designer', 'admin']);

  if (!designerRoles || designerRoles.length === 0) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden: designer or admin role required' },
        { status: 403 },
      ),
    };
  }

  return { user, adminClient };
}

/** Standard 400 helper */
export function badRequest(message: string, details?: unknown): NextResponse {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status: 400 },
  );
}

/** Standard 500 helper */
export function serverError(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Extract client IP from request headers */
export function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null
  );
}
