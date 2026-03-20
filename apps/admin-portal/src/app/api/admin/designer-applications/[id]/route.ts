import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, notFound, serverError } from '@/lib/supabase-admin';

// GET /api/admin/designer-applications/[id] - Get single application
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  try {
    const { data: app, error } = await adminClient
      .from('designer_applications')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !app) return notFound('Application not found');

    // Get email and profile
    const [authResult, profileResult] = await Promise.all([
      adminClient.auth.admin.getUserById(app.user_id),
      adminClient.from('profiles').select('display_name, avatar_url').eq('id', app.user_id).single(),
    ]);

    return NextResponse.json({
      data: {
        id: app.id,
        userId: app.user_id,
        email: authResult.data?.user?.email ?? '',
        displayName: profileResult.data?.display_name ?? undefined,
        avatarUrl: profileResult.data?.avatar_url ?? undefined,
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
      },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to get application');
  }
}
