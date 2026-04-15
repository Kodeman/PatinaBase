import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  badRequest,
  serverError,
} from '@/lib/supabase-admin';
import { VendorPipeline } from '@patina/types';

type Vendor = VendorPipeline.Vendor;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  // The generated Supabase client is strict about insert overloads with untyped
  // JSON body values; cast to a loose shape for raw JSON-in/JSON-out routes.
  const db = auth.adminClient as unknown as { from: (t: string) => any };

  const url = new URL(request.url);
  const stage = url.searchParams.get('stage') ?? undefined;
  const triage = url.searchParams.get('triage_level') ?? undefined;
  const awaitingLeah = url.searchParams.get('awaiting_leah') === 'true';
  const sortBy = (url.searchParams.get('sort_by') ?? 'total_score') as
    | 'total_score'
    | 'updated_at'
    | 'name'
    | 'stage';
  const sortDir = (url.searchParams.get('sort_dir') ?? 'desc') as 'asc' | 'desc';
  const search = url.searchParams.get('search') ?? undefined;

  try {
    let query = db.from('pipeline_vendors').select('*');

    if (stage) query = query.eq('stage', stage);
    if (triage) query = query.eq('triage_level', triage);
    if (awaitingLeah) query = query.eq('awaiting_leah_review', true);
    if (search) query = query.ilike('name', `%${search}%`);

    query = query.order(sortBy, {
      ascending: sortDir === 'asc',
      nullsFirst: false,
    });

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data as Vendor[] });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to list vendors');
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  // The generated Supabase client is strict about insert overloads with untyped
  // JSON body values; cast to a loose shape for raw JSON-in/JSON-out routes.
  const db = auth.adminClient as unknown as { from: (t: string) => any };

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return badRequest('Vendor name is required');

  const slug = slugify(name);
  if (!slug) return badRequest('Vendor name must contain at least one alphanumeric character');

  try {
    const { data, error } = await db
      .from('pipeline_vendors')
      .insert({
        name,
        slug,
        website_url: body.website_url ?? null,
        location_city: body.location_city ?? null,
        location_state: body.location_state ?? null,
        location_country: body.location_country ?? 'US',
        product_categories: body.product_categories ?? [],
        price_range_low: body.price_range_low ?? null,
        price_range_high: body.price_range_high ?? null,
        source: body.source ?? 'manual',
        notes: body.notes ?? null,
        stage: 'discovery',
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return badRequest(`A vendor with slug "${slug}" already exists`);
      }
      throw error;
    }

    if (body.auto_score) {
      await db.from('cowork_tasks').insert({
        task_type: 'auto_score',
        vendor_id: data.id,
        status: 'pending',
        input_payload: { trigger: 'vendor_created', vendor_slug: data.slug },
      });
    }

    return NextResponse.json({ data: data as Vendor }, { status: 201 });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to create vendor');
  }
}
