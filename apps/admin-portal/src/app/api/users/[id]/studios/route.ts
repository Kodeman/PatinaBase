import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// GET /api/users/[id]/studios — studio memberships for the Studios tab on
// the user detail page.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  try {
    const { data, error } = await adminClient
      .from('organization_members')
      .select(
        'organization_id, role, status, job_title, staff_role, organizations!inner(id, name, slug, status, type)',
      )
      .eq('user_id', id)
      .eq('organizations.type', 'design_studio')
      .neq('status', 'removed');

    if (error) return serverError(error.message);

    const memberships = (data ?? []).map((row: any) => ({
      organizationId: row.organization_id,
      organizationName: row.organizations.name,
      organizationSlug: row.organizations.slug,
      organizationStatus: row.organizations.status,
      role: row.role,
      status: row.status,
      jobTitle: row.job_title ?? undefined,
      staffRole: row.staff_role ?? undefined,
    }));

    return NextResponse.json({ data: memberships });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to list user studio memberships');
  }
}
