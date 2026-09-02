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
import type { Database } from '@patina/supabase';

// Written out rather than inferred: the generated Database type is large enough
// that TypeScript refuses to serialize this signature (TS7056).
type DesignerAdminAuth =
  | { error: NextResponse }
  | { user: User; adminClient: ReturnType<typeof createAdminClient> };

/**
 * Role domains a route may demand. Narrowed from the generated `role_domain`
 * enum rather than written out, so a rename in the database is a type error
 * here rather than a silently empty `.in()` filter.
 */
export type RoleDomain = Extract<
  Database['public']['Enums']['role_domain'],
  'designer' | 'admin'
>;

const DEFAULT_DOMAINS: readonly RoleDomain[] = ['designer', 'admin'];

/**
 * Validate the caller is authenticated and holds a role in one of `domains`.
 * Returns `{ user, adminClient }` on success, or `{ error: NextResponse }` on failure.
 *
 * Default permitted domains: 'designer' | 'admin'. Pass `['admin']` on a route
 * whose verb is staff-only (the admin catalogue's POST/PATCH/DELETE).
 *
 * FAIL-CLOSED, and deliberately unlike `middleware.ts`. `userHasDesignerPortalRole`
 * returns `true` when the role lookup throws or the service-role key is missing,
 * so a DB blip cannot lock a designer out of the shell. An API route is the
 * opposite trade: admitting an unverified caller to the trade file on a transient
 * error is the failure that matters. The three outcomes are kept DISTINCT rather
 * than collapsed into one 403 — a lookup failure is a 503 and is logged, so a
 * real designer seeing "Forbidden" is never the symptom of a database problem.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in the runtime environment
 * (`createAdminClient()` throws without it). On Cloudflare that is a Worker
 * SECRET, not a `wrangler.jsonc` var — runbook Block A checks it before deploy.
 */
export async function getAuthenticatedDesignerAdmin(
  request: NextRequest,
  options?: { domains?: readonly RoleDomain[] },
): Promise<DesignerAdminAuth> {
  const domains = options?.domains ?? DEFAULT_DOMAINS;

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
  let adminClient: ReturnType<typeof createAdminClient>;
  try {
    adminClient = createAdminClient();
  } catch (cause) {
    console.error('[auth] role lookup unavailable: admin client could not be built', cause);
    return {
      error: NextResponse.json(
        { error: 'Role check unavailable' },
        { status: 503 },
      ),
    };
  }

  // Check the user holds at least one role in a permitted domain
  const { data: designerRoles, error: roleError } = await adminClient
    .from('user_roles')
    .select('role_id, roles!inner(domain)')
    .eq('user_id', user.id)
    .in('roles.domain', [...domains]);

  if (roleError) {
    // NOT a 403: the caller may well hold the role. Saying "Forbidden" here
    // sends a real designer chasing their permissions instead of the outage.
    console.error('[auth] role lookup failed for user', user.id, roleError);
    return {
      error: NextResponse.json(
        { error: 'Role check unavailable' },
        { status: 503 },
      ),
    };
  }

  if (!designerRoles || designerRoles.length === 0) {
    return {
      error: NextResponse.json(
        {
          error:
            domains.length === 1 && domains[0] === 'admin'
              ? 'Forbidden: admin role required'
              : 'Forbidden: designer or admin role required',
        },
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
