import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@patina/supabase';
import { createServerClient } from '@patina/supabase/server';
import { mapUserToResponse, serverError } from '@/lib/supabase-admin';

// GET /api/users/me - Get current admin user
export async function GET(_request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const adminClient = createAdminClient();

    const [profileRes, rolesRes] = await Promise.all([
      adminClient.from('profiles').select('display_name, avatar_url').eq('id', user.id).single(),
      adminClient
        .from('user_roles')
        .select('roles!inner(id, name, description, role_permissions(permissions(id, name, description, resource, action)))')
        .eq('user_id', user.id),
    ]);

    return NextResponse.json({
      data: mapUserToResponse(
        user,
        profileRes.data,
        (rolesRes.data ?? []).map((r: any) => r.roles)
      ),
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to get current user');
  }
}
