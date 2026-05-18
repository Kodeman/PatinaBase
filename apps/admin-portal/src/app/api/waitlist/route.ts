import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { mapWaitlistRow } from './_mappers';

// GET /api/waitlist - List waitlist entries with optional filters
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user, adminClient } = auth;

  const url = new URL(request.url);
  const search = url.searchParams.get('search') ?? '';
  const status = url.searchParams.get('status') ?? 'all';
  const role = url.searchParams.get('role') ?? '';
  const source = url.searchParams.get('source') ?? '';
  const stage = url.searchParams.get('stage') ?? '';
  const assignedTo = url.searchParams.get('assignedTo') ?? '';
  const hasOverdueFollowUp = url.searchParams.get('hasOverdueFollowUp') === 'true';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10)));
  const offset = (page - 1) * pageSize;

  try {
    let query = adminClient
      .from('waitlist')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Filter by conversion status (legacy)
    if (status === 'pending') {
      query = query.is('converted_at', null);
    } else if (status === 'converted') {
      query = query.not('converted_at', 'is', null);
    }

    if (role) query = query.eq('role', role);
    if (source) query = query.eq('source', source);
    if (stage) query = query.eq('qualification_stage', stage);

    if (assignedTo === 'me') {
      query = query.eq('assigned_admin_id', user.id);
    } else if (assignedTo === 'unassigned') {
      query = query.is('assigned_admin_id', null);
    } else if (assignedTo) {
      query = query.eq('assigned_admin_id', assignedTo);
    }

    if (hasOverdueFollowUp) {
      query = query
        .not('next_follow_up_at', 'is', null)
        .lt('next_follow_up_at', new Date().toISOString());
    }

    if (search) query = query.ilike('email', `%${search}%`);

    query = query.range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) return serverError(error.message);

    const entries = (data ?? []).map(mapWaitlistRow);

    return NextResponse.json({
      data: { data: entries, meta: { total: count ?? 0, page, pageSize } },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to list waitlist entries');
  }
}
