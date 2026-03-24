import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// GET /api/waitlist - List waitlist entries with optional filters
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const url = new URL(request.url);
  const search = url.searchParams.get('search') ?? '';
  const status = url.searchParams.get('status') ?? 'all';
  const role = url.searchParams.get('role') ?? '';
  const source = url.searchParams.get('source') ?? '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10)));
  const offset = (page - 1) * pageSize;

  try {
    let query = adminClient
      .from('waitlist')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Filter by conversion status
    if (status === 'pending') {
      query = query.is('converted_at', null);
    } else if (status === 'converted') {
      query = query.not('converted_at', 'is', null);
    }

    // Filter by role
    if (role) {
      query = query.eq('role', role);
    }

    // Filter by source
    if (source) {
      query = query.eq('source', source);
    }

    // Search by email
    if (search) {
      query = query.ilike('email', `%${search}%`);
    }

    // Pagination
    query = query.range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) return serverError(error.message);

    const entries = (data ?? []).map((row: any) => ({
      id: row.id,
      email: row.email,
      source: row.source,
      role: row.role,
      utmSource: row.utm_source,
      utmMedium: row.utm_medium,
      utmCampaign: row.utm_campaign,
      utmContent: row.utm_content,
      utmTerm: row.utm_term,
      referrer: row.referrer,
      signupPage: row.signup_page,
      ctaText: row.cta_text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      convertedAt: row.converted_at,
      authUserId: row.auth_user_id,
    }));

    return NextResponse.json({
      data: { data: entries, meta: { total: count ?? 0, page, pageSize } },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to list waitlist entries');
  }
}
