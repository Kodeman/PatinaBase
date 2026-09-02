import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { toInt } from '../../_lib';

// GET /api/admin/studios/[id]/projects — projects owned by this studio.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  const url = new URL(request.url);
  const page = toInt(url.searchParams.get('page'), 1, { min: 1, max: Number.MAX_SAFE_INTEGER });
  const pageSize = toInt(url.searchParams.get('pageSize'), 20, { min: 1, max: 100 });
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const { data, error, count } = await adminClient
      .from('projects')
      .select('id, name, status, created_at', { count: 'exact' })
      .eq('studio_id', id)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) return serverError(error.message);

    const projects = (data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      status: p.status ?? undefined,
      createdAt: p.created_at,
    }));

    return NextResponse.json({ data: { data: projects, meta: { total: count ?? 0, page, pageSize } } });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to list studio projects');
  }
}
