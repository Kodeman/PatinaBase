import { createAdminClient } from '@patina/supabase/client';

export type ApplicationType = 'designer' | 'maker';

export const APPLICATION_TABLES: Record<ApplicationType, string> = {
  designer: 'founding_designer_applications',
  maker: 'maker_applications',
};

export const APPLICATION_STATUSES = [
  'pending',
  'in_review',
  'approved',
  'rejected',
  'archived',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Role to assign on onboarding — designers get independent_designer, makers get brand_admin (vendor domain). */
export const ONBOARDING_ROLE: Record<ApplicationType, string> = {
  designer: 'independent_designer',
  maker: 'brand_admin',
};

export type ApplicationRow = {
  id: string;
  email: string;
  status: ApplicationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  auth_user_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
  referral_source: string | null;
  website: string | null;
  // Designer-only
  first_name?: string;
  last_name?: string;
  company?: string | null;
  motivation?: string | null;
  // Maker-only
  brand_name?: string;
  contact_name?: string;
  description?: string | null;
};

export function normalizeApplication(
  type: ApplicationType,
  row: Record<string, unknown>,
): ApplicationRow {
  return row as ApplicationRow;
}

export async function listApplications(
  adminClient: ReturnType<typeof createAdminClient>,
  type: ApplicationType,
  params: { status?: string; search?: string; page: number; pageSize: number },
) {
  const table = APPLICATION_TABLES[type];
  const offset = (params.page - 1) * params.pageSize;

  let query = (adminClient as any)
    .from(table)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + params.pageSize - 1);

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }
  if (params.search) {
    const term = `%${params.search}%`;
    const searchCols =
      type === 'designer'
        ? 'email.ilike.' + term + ',first_name.ilike.' + term + ',last_name.ilike.' + term + ',company.ilike.' + term
        : 'email.ilike.' + term + ',brand_name.ilike.' + term + ',contact_name.ilike.' + term;
    query = query.or(searchCols);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return {
    data: (data ?? []).map((row: any) => normalizeApplication(type, row)),
    total: count ?? 0,
  };
}

export async function getApplication(
  adminClient: ReturnType<typeof createAdminClient>,
  type: ApplicationType,
  id: string,
) {
  const table = APPLICATION_TABLES[type];
  const { data, error } = await (adminClient as any)
    .from(table)
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return normalizeApplication(type, data as any);
}
