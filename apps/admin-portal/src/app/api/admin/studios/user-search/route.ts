import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { sanitizeFilterTerm, toInt } from '../_lib';

// GET /api/admin/studios/user-search?q=&limit=&excludeStudioId= — used by
// UserSearchPicker for "add existing user" / "create studio for" flows.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const limit = toInt(url.searchParams.get('limit'), 20, { min: 1, max: 50 });
  const excludeStudioId = url.searchParams.get('excludeStudioId')?.trim() || undefined;

  if (q.length < 2) {
    return NextResponse.json({ data: [] });
  }

  // PostgREST reads , ( ) as filter syntax inside .or() — strip them before
  // interpolation so a search term can't inject extra clauses.
  const safeQ = sanitizeFilterTerm(q);
  if (safeQ.length < 2) {
    return NextResponse.json({ data: [] });
  }

  try {
    let excludedUserIds: string[] = [];
    if (excludeStudioId) {
      const { data: existing } = await adminClient
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', excludeStudioId)
        .in('status', ['active', 'invited']);
      excludedUserIds = (existing ?? []).map((m: { user_id: string }) => m.user_id);
    }

    let query = adminClient
      .from('profiles')
      .select('id, email, display_name, avatar_url')
      .or(`email.ilike.%${safeQ}%,display_name.ilike.%${safeQ}%`)
      .limit(limit);

    if (excludedUserIds.length > 0) {
      query = query.not('id', 'in', `(${excludedUserIds.join(',')})`);
    }

    const { data, error } = await query;
    if (error) return serverError(error.message);

    const users = (data ?? []).map((p: any) => ({
      id: p.id,
      email: p.email ?? '',
      displayName: p.display_name ?? undefined,
      avatarUrl: p.avatar_url ?? undefined,
    }));

    return NextResponse.json({ data: users });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to search users');
  }
}
