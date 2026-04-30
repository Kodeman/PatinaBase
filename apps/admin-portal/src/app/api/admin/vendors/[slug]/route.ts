import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  badRequest,
  notFound,
  serverError,
} from '@/lib/supabase-admin';
import { VendorPipeline } from '@patina/types';

type Vendor = VendorPipeline.Vendor;
type VendorStage = VendorPipeline.VendorStage;

const ALLOWED_UPDATE_FIELDS = new Set<keyof Vendor>([
  'name',
  'website_url',
  'location_city',
  'location_state',
  'location_country',
  'year_established',
  'product_categories',
  'price_range_low',
  'price_range_high',
  'company_size',
  'primary_contact_name',
  'primary_contact_email',
  'primary_contact_phone',
  'primary_contact_role',
  'trade_account_status',
  'trade_discount_pct',
  'payment_terms',
  'drop_ship_capable',
  'data_format',
  'feed_url',
  'feed_frequency',
  'notes',
  'leah_notes',
  'source',
  'has_hard_veto',
  'veto_reason',
  'stage',
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;

  const { slug } = await params;

  try {
    const { data: vendor, error } = await db
      .from('pipeline_vendors')
      .select('*, pipeline_vendor_scores(*)')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw error;
    if (!vendor) return notFound(`Vendor "${slug}" not found`);

    const { data: coworkTasks } = await db
      .from('cowork_tasks')
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json({
      data: {
        ...vendor,
        scores: vendor.pipeline_vendor_scores ?? [],
        cowork_tasks: coworkTasks ?? [],
      },
    });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load vendor');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;

  const { slug } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_UPDATE_FIELDS.has(key as keyof Vendor)) {
      updates[key] = value;
    }
  }

  if (typeof updates.stage === 'string') {
    const stage = updates.stage as VendorStage;
    if (
      ![
        'discovery',
        'qualification',
        'outreach',
        'negotiation',
        'onboarding',
        'live',
        'paused',
        'rejected',
      ].includes(stage)
    ) {
      return badRequest(`Invalid stage: ${stage}`);
    }
    updates.stage_changed_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return badRequest('No valid fields to update');
  }

  try {
    const { data, error } = await db
      .from('pipeline_vendors')
      .update(updates)
      .eq('slug', slug)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFound(`Vendor "${slug}" not found`);

    return NextResponse.json({ data: data as Vendor });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to update vendor');
  }
}
