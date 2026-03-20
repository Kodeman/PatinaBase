import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// GET /api/permissions - List all available permissions, grouped by resource
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  try {
    const { data, error } = await adminClient
      .from('permissions')
      .select('id, name, resource, action, scope, description')
      .order('resource')
      .order('action');

    if (error) return serverError(error.message);

    const permissions = (data ?? []).map((p: any) => ({
      id: p.id,
      code: p.name,
      resource: p.resource,
      action: p.action,
      scope: p.scope,
      description: p.description ?? undefined,
    }));

    // Group by resource for the grouped response
    const groupMap = new Map<string, typeof permissions>();
    for (const p of permissions) {
      const existing = groupMap.get(p.resource) ?? [];
      existing.push(p);
      groupMap.set(p.resource, existing);
    }

    const groups = Array.from(groupMap.entries()).map(([resource, perms]) => ({
      domain: resource,
      displayName: resource.charAt(0).toUpperCase() + resource.slice(1).replace(/_/g, ' '),
      permissions: perms,
    }));

    return NextResponse.json({
      data: { groups, total: permissions.length },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to list permissions');
  }
}
