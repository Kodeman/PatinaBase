import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from './supabase-admin';

type RouteHandler = (
  request: NextRequest,
  context: any
) => Promise<NextResponse | Response>;

/**
 * Wrap an API route handler to require a specific permission.
 * Uses get_user_permissions() SQL function to check the caller's permissions.
 *
 * Usage:
 *   export const GET = withPermission('admin.users', async (request, context) => { ... });
 */
export function withPermission(
  requiredPermission: string,
  handler: RouteHandler
): RouteHandler {
  return async (request: NextRequest, context: any): Promise<NextResponse | Response> => {
    const auth = await getAuthenticatedAdmin(request);
    if ('error' in auth) return auth.error!;

    const { user, adminClient } = auth;

    // Get user's permissions via the SQL function
    const { data: permissions, error } = await adminClient.rpc('get_user_permissions', {
      p_user_id: user.id,
    });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to check permissions' },
        { status: 500 }
      );
    }

    const userPermissions: string[] = permissions ?? [];

    // Check if user has the required permission
    // Support wildcard: admin.* matches admin.users, admin.system, etc.
    const hasPermission = userPermissions.some((p) => {
      if (p === requiredPermission) return true;
      // Check wildcard: if user has 'admin.*', they have any 'admin.xxx'
      const parts = p.split('.');
      if (parts[parts.length - 1] === '*') {
        const prefix = parts.slice(0, -1).join('.');
        return requiredPermission.startsWith(prefix + '.');
      }
      return false;
    });

    if (!hasPermission) {
      return NextResponse.json(
        { error: `Forbidden: requires ${requiredPermission} permission` },
        { status: 403 }
      );
    }

    return handler(request, context);
  };
}
