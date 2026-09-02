import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';
import {
  mapStudioOverviewRow,
  mapStudioRpcError,
  sanitizeFilterTerm,
  toInt,
  type ProfileRow,
  type StudioOverviewRow,
} from './_lib';

// GET /api/admin/studios — list studios from admin_studio_overview (00556).
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const url = new URL(request.url);
  const query = url.searchParams.get('query')?.trim() || undefined;
  const status = url.searchParams.get('status')?.trim() || undefined;
  const tier = url.searchParams.get('tier')?.trim() || undefined;
  const page = toInt(url.searchParams.get('page'), 1, { min: 1, max: Number.MAX_SAFE_INTEGER });
  const pageSize = toInt(url.searchParams.get('pageSize'), 20, { min: 1, max: 100 });
  // PostgREST reads , ( ) as filter syntax inside .or()/.ilike() — strip them
  // before interpolation so a search term can't inject extra clauses.
  const safeQuery = query ? sanitizeFilterTerm(query) : undefined;

  try {
    let ownerIds: string[] | null = null;
    if (safeQuery) {
      const { data: matchingOwners } = await adminClient
        .from('profiles')
        .select('id')
        .ilike('email', `%${safeQuery}%`)
        .limit(200);
      ownerIds = (matchingOwners ?? []).map((p: { id: string }) => p.id);
    }

    let q = adminClient.from('admin_studio_overview').select('*', { count: 'exact' });

    if (safeQuery) {
      const nameOrSlug = `name.ilike.%${safeQuery}%,slug.ilike.%${safeQuery}%`;
      if (ownerIds && ownerIds.length > 0) {
        q = q.or(`${nameOrSlug},owner_user_id.in.(${ownerIds.join(',')})`);
      } else {
        q = q.or(nameOrSlug);
      }
    }
    if (status) q = q.eq('status', status as 'active' | 'suspended' | 'pending_approval' | 'deactivated');
    if (tier) q = q.eq('subscription_tier', tier as 'free' | 'professional' | 'enterprise');

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, to);
    if (error) return serverError(error.message);

    const rows = (data ?? []) as StudioOverviewRow[];
    const ownerUserIds = Array.from(
      new Set(rows.map((r) => r.owner_user_id).filter((id): id is string => !!id)),
    );

    const ownerProfiles = new Map<string, ProfileRow>();
    if (ownerUserIds.length > 0) {
      const { data: profiles } = await adminClient
        .from('profiles')
        .select('id, email, display_name, avatar_url')
        .in('id', ownerUserIds);
      for (const p of (profiles ?? []) as ProfileRow[]) {
        ownerProfiles.set(p.id, p);
      }
    }

    const studios = rows.map((row) =>
      mapStudioOverviewRow(row, ownerProfiles.get(row.owner_user_id ?? '') ?? null),
    );

    return NextResponse.json({
      data: { data: studios, meta: { total: count ?? 0, page, pageSize } },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to list studios');
  }
}

// POST /api/admin/studios — create a studio for a user (admin_create_studio_for_user).
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;

  let body: { ownerUserId?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const ownerUserId = body.ownerUserId?.trim();
  const name = body.name?.trim();
  if (!ownerUserId) return badRequest('ownerUserId is required');
  if (!name) return badRequest('name is required');

  try {
    const { data, error } = await adminClient.rpc('admin_create_studio_for_user', {
      p_actor: adminUser.id,
      p_owner_user_id: ownerUserId,
      p_name: name,
    });
    if (error) return mapStudioRpcError(error.message);

    const org = data as { id: string };

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'studio.create',
      resourceType: 'organization',
      resourceId: org.id,
      organizationId: org.id,
      newValues: { ownerUserId, name },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { studioId: org.id } }, { status: 201 });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to create studio');
  }
}
