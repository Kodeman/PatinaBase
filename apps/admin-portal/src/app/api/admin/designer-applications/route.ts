import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// GET /api/admin/designer-applications - List designer applications
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10)));
  const offset = (page - 1) * pageSize;

  try {
    let query = adminClient
      .from('designer_applications')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status as any);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) return serverError(error.message);

    // Get emails and profiles for all users
    const userIds = (data ?? []).map((d: any) => d.user_id);
    const emailMap = new Map<string, string>();
    const profileMap = new Map<string, any>();
    if (userIds.length > 0) {
      const [authResult, profileResult] = await Promise.all([
        adminClient.auth.admin.listUsers({ perPage: 1000 }),
        adminClient.from('profiles').select('id, display_name, avatar_url').in('id', userIds),
      ]);
      for (const u of authResult.data?.users ?? []) {
        if (userIds.includes(u.id)) {
          emailMap.set(u.id, u.email ?? '');
        }
      }
      for (const p of profileResult.data ?? []) {
        profileMap.set(p.id, p);
      }
    }

    const applications = (data ?? []).map((app: any) => ({
      id: app.id,
      userId: app.user_id,
      email: emailMap.get(app.user_id) ?? '',
      displayName: profileMap.get(app.user_id)?.display_name ?? undefined,
      avatarUrl: profileMap.get(app.user_id)?.avatar_url ?? undefined,
      status: app.status,
      businessName: app.business_name,
      portfolioUrl: app.portfolio_url,
      yearsExperience: app.years_experience,
      specialties: app.specialties,
      certifications: app.certifications,
      referralSource: app.referral_source,
      additionalInfo: app.additional_info,
      reviewedBy: app.reviewed_by,
      reviewedAt: app.reviewed_at,
      reviewNotes: app.review_notes,
      createdAt: app.created_at,
      updatedAt: app.updated_at,
    }));

    return NextResponse.json({
      data: { data: applications, meta: { total: count ?? 0, page, pageSize } },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to list applications');
  }
}
