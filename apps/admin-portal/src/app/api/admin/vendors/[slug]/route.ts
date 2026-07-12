import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getAuthenticatedAdmin,
  badRequest,
  createAuditLog,
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
      .from('agent_tasks')
      .select('*')
      .eq('entity_type', 'pipeline_vendor')
      .eq('entity_id', vendor.id)
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

  // stage moves through move_pipeline_stage (00305) — the single audited
  // write path shared with the Mission Control pipeline boards (WP-2.2) —
  // never a bare column UPDATE, so every stage change gets a
  // pipeline_stage_events row regardless of which surface (this legacy
  // route or the new board) triggered it. Every other field still updates
  // directly, same as before this refactor.
  const requestedStage = typeof body.stage === 'string' ? (body.stage as VendorStage) : undefined;

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key !== 'stage' && ALLOWED_UPDATE_FIELDS.has(key as keyof Vendor)) {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length === 0 && requestedStage === undefined) {
    return badRequest('No valid fields to update');
  }

  try {
    let vendorRow: Vendor | null = null;

    if (Object.keys(updates).length > 0) {
      const { data, error } = await db
        .from('pipeline_vendors')
        .update(updates)
        .eq('slug', slug)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      if (!data) return notFound(`Vendor "${slug}" not found`);
      vendorRow = data as Vendor;
    }

    if (requestedStage !== undefined) {
      if (!vendorRow) {
        const { data, error } = await db
          .from('pipeline_vendors')
          .select('*')
          .eq('slug', slug)
          .maybeSingle();
        if (error) throw error;
        if (!data) return notFound(`Vendor "${slug}" not found`);
        vendorRow = data as Vendor;
      }

      const client: SupabaseClient = auth.adminClient;
      const { data: moveResult, error: moveError } = await client.rpc('move_pipeline_stage', {
        p_entity_type: 'pipeline_vendor',
        p_entity_id: vendorRow.id,
        p_to_stage: requestedStage,
        p_actor: auth.user.email ?? auth.user.id,
      });

      if (moveError) {
        // move_pipeline_stage RAISEs on an invalid stage — a caller mistake.
        return badRequest(moveError.message);
      }

      const result = moveResult as { from_stage: string | null; to_stage: string; unchanged: boolean };

      await createAuditLog(auth.adminClient, {
        userId: auth.user.id,
        action: 'pipeline.stage_move',
        resourceType: 'pipeline_vendor',
        resourceId: vendorRow.id,
        oldValues: { stage: result.from_stage },
        newValues: { stage: result.to_stage },
        metadata: { unchanged: result.unchanged, via: 'vendors_patch_legacy' },
      });

      // Re-fetch so the response carries the fresh stage + stage_changed_at
      // (move_pipeline_stage doesn't return the full row, only the move summary).
      const { data: refreshed, error: refetchError } = await db
        .from('pipeline_vendors')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (refetchError) throw refetchError;
      vendorRow = refreshed as Vendor;
    }

    return NextResponse.json({ data: vendorRow as Vendor });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to update vendor');
  }
}
