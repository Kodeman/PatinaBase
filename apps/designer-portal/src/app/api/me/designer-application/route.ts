import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';

// GET /api/me/designer-application - Get current application status
export async function GET(_request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const adminClient = createAdminClient();

    const { data } = await adminClient
      .from('designer_applications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!data) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({
      data: {
        id: data.id,
        status: data.status,
        businessName: data.business_name,
        portfolioUrl: data.portfolio_url,
        yearsExperience: data.years_experience,
        specialties: data.specialties,
        certifications: data.certifications,
        referralSource: data.referral_source,
        additionalInfo: data.additional_info,
        reviewNotes: data.review_notes,
        reviewedAt: data.reviewed_at,
        createdAt: data.created_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ data: null });
  }
}

// POST /api/me/designer-application - Submit a designer application
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    const adminClient = createAdminClient();

    // Check for existing pending application
    const { data: existing } = await adminClient
      .from('designer_applications')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['pending', 'under_review'])
      .single();

    if (existing) {
      return NextResponse.json({
        data: { id: existing.id, status: existing.status, message: 'Application already submitted' },
      });
    }

    const { data, error } = await adminClient
      .from('designer_applications')
      .insert({
        user_id: user.id,
        business_name: body.businessName ?? null,
        portfolio_url: body.portfolioUrl ?? null,
        years_experience: body.yearsExperience ?? null,
        specialties: body.specialties ?? [],
        certifications: body.certifications ?? [],
        referral_source: body.referralSource ?? null,
        additional_info: body.additionalInfo ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'SUBMIT_FAILED', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        id: data.id,
        status: 'pending',
        message: 'Application submitted successfully. We will review it shortly.',
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message ?? 'Failed to submit application' },
      { status: 500 }
    );
  }
}
