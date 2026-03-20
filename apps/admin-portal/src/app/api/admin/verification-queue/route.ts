import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// GET /api/admin/verification-queue - List designer applications for review
// This is an alias for /api/admin/designer-applications used by the verification page
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? 'pending';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '50', 10)));
  const offset = (page - 1) * pageSize;

  try {
    const { data, error, count } = await adminClient
      .from('designer_applications')
      .select('*', { count: 'exact' })
      .eq('status', status as any)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) return serverError(error.message);

    // Get emails and profiles
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

    // Map to the DesignerProfile shape expected by the verification page
    const profiles = (data ?? []).map((app: any) => ({
      userId: app.user_id,
      email: emailMap.get(app.user_id) ?? '',
      displayName: profileMap.get(app.user_id)?.display_name ?? undefined,
      businessName: app.business_name,
      website: app.portfolio_url,
      documents: [],
      status: app.status === 'pending' ? 'submitted' : app.status === 'under_review' ? 'in_review' : app.status,
      reviewerId: app.reviewed_by,
      reviewedAt: app.reviewed_at,
      notes: app.review_notes,
      createdAt: app.created_at,
      updatedAt: app.updated_at,
      // Extra fields for the review UI
      applicationId: app.id,
      yearsExperience: app.years_experience,
      specialties: app.specialties,
      certifications: app.certifications,
    }));

    return NextResponse.json({
      data: { data: profiles, meta: { total: count ?? 0, page, pageSize } },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to list verification queue');
  }
}
