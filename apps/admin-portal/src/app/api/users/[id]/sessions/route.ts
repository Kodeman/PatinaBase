import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  serverError,
} from '@/lib/supabase-admin';

// GET /api/users/[id]/sessions - Get user sessions
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  try {
    // Query sessions from auth schema via service role RPC
    // The auth.sessions table is not directly accessible via PostgREST,
    // so we use a raw SQL query through rpc or return user factor info
    const { data: authUser, error: userError } = await adminClient.auth.admin.getUserById(id);
    if (userError) return serverError(userError.message);

    // Return user's factor information as session proxy
    const factors = authUser.user?.factors ?? [];
    const sessions = factors.map((f: any) => ({
      id: f.id,
      userId: id,
      factorType: f.factor_type,
      status: f.status,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    }));

    return NextResponse.json({ data: sessions });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to get sessions');
  }
}

// A DELETE handler used to live here for "revoke all sessions". It only
// wrote `app_metadata.sessions_revoked_at` on the user — GoTrue never reads
// that field, so it returned { success: true } while doing nothing; the
// user stayed logged in everywhere. The installed supabase-js
// (@supabase/auth-js 2.98.0) has no admin-side, userId-scoped session
// invalidation call — GoTrueAdminApi.signOut(jwt, scope) needs the specific
// session's own JWT, which the admin portal never holds. Until a real
// mechanism exists (e.g. deleting rows from `auth.sessions` via a
// service-role RPC), there is no revoke path at all: the client-side
// `usersService.revokeAllSessions` and the "Revoke All" button that called it
// were both removed, and SessionList states that the surface is view-only.
