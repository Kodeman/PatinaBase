import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase';

// GET /api/me - Get current user profile with roles
export async function GET(_request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const adminClient = createAdminClient();

    const [profileRes, rolesRes] = await Promise.all([
      adminClient
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .single(),
      adminClient
        .from('user_roles')
        .select('roles!inner(id, name, display_name, description, domain)')
        .eq('user_id', user.id),
    ]);

    return NextResponse.json({
      data: {
        id: user.id,
        email: user.email,
        emailVerified: !!user.email_confirmed_at,
        displayName: profileRes.data?.display_name ?? undefined,
        avatarUrl: profileRes.data?.avatar_url ?? undefined,
        roles: (rolesRes.data ?? []).map((r: any) => ({
          id: r.roles.id,
          name: r.roles.name,
          displayName: r.roles.display_name,
          domain: r.roles.domain,
        })),
        createdAt: user.created_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message ?? 'Failed to get profile' },
      { status: 500 }
    );
  }
}
