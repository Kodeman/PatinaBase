import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  notFound,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';
import { mapStudioOverviewRow, type StudioOverviewRow } from '../_lib';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SUBSCRIPTION_TIERS = ['free', 'professional', 'enterprise'] as const;
// Fields an admin may clear back to NULL by sending an explicit null.
const NULLABLE_FIELDS = new Set(['website', 'description', 'email', 'phone', 'logoUrl', 'address']);
const PATCHABLE_FIELDS = [
  'name',
  'slug',
  'website',
  'description',
  'email',
  'phone',
  'logoUrl',
  'subscriptionTier',
  'address',
] as const;

const FIELD_TO_COLUMN: Record<(typeof PATCHABLE_FIELDS)[number], string> = {
  name: 'name',
  slug: 'slug',
  website: 'website',
  description: 'description',
  email: 'email',
  phone: 'phone',
  logoUrl: 'logo_url',
  subscriptionTier: 'subscription_tier',
  address: 'address',
};

// GET /api/admin/studios/[id]
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { id } = await context.params;

  try {
    const { data, error } = await adminClient
      .from('admin_studio_overview')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return serverError(error.message);
    if (!data) return notFound('Studio not found');

    const row = data as StudioOverviewRow;
    let ownerProfile = null;
    if (row.owner_user_id) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('id, email, display_name, avatar_url')
        .eq('id', row.owner_user_id)
        .maybeSingle();
      ownerProfile = profile;
    }

    return NextResponse.json({ data: mapStudioOverviewRow(row, ownerProfile) });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to get studio');
  }
}

// PATCH /api/admin/studios/[id] — profile-field update (plain service-role write).
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (typeof body.slug === 'string' && !SLUG_RE.test(body.slug.trim())) {
    return badRequest('slug must be lowercase letters, digits, and single hyphens');
  }

  if (
    body.subscriptionTier !== undefined &&
    !(SUBSCRIPTION_TIERS as readonly unknown[]).includes(body.subscriptionTier)
  ) {
    return badRequest('subscriptionTier must be one of free, professional, enterprise');
  }

  const updates: Record<string, unknown> = {};
  for (const field of PATCHABLE_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null && !NULLABLE_FIELDS.has(field)) continue;
    updates[FIELD_TO_COLUMN[field]] = value;
  }

  if (Object.keys(updates).length === 0) {
    return badRequest('No updatable fields provided');
  }

  try {
    const { data, error } = await adminClient
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .eq('type', 'design_studio')
      .select('id')
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'That slug is already in use' }, { status: 409 });
      }
      return serverError(error.message);
    }
    if (!data) return notFound('Studio not found');

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: 'studio.update',
      resourceType: 'organization',
      resourceId: id,
      organizationId: id,
      newValues: updates,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    const { data: refreshed, error: refetchError } = await adminClient
      .from('admin_studio_overview')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (refetchError || !refreshed) return serverError('Failed to re-fetch studio after update');

    const row = refreshed as StudioOverviewRow;
    let ownerProfile = null;
    if (row.owner_user_id) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('id, email, display_name, avatar_url')
        .eq('id', row.owner_user_id)
        .maybeSingle();
      ownerProfile = profile;
    }

    return NextResponse.json({ data: mapStudioOverviewRow(row, ownerProfile) });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to update studio');
  }
}
