import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/style-profile/v1/style-profiles/:id/versions
// There is no version-history store yet. We synthesize a single "current"
// version from the profile's last_calculated_at so the client renders a
// timeline instead of falling back to mock data / 404ing.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet updated for these columns
    const supabase: any = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_style_signals')
      .select('user_id, last_calculated_at, updated_at, created_at')
      .eq('user_id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ data: [] });
    }

    const versions = [
      {
        id: `${id}-v1`,
        version: 1,
        createdAt: data.last_calculated_at ?? data.updated_at ?? data.created_at,
        current: true,
      },
    ];

    return NextResponse.json({ data: versions });
  } catch (error) {
    console.error('[API] GET /style-profile/v1/style-profiles/[id]/versions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
