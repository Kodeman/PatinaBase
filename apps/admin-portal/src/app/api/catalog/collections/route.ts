import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, serverError } from '@/lib/admin-api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCollection(col: any) {
  return {
    id: col.id,
    name: col.name,
    slug: col.slug,
    type: col.type,
    description: col.description,
    coverImage: col.cover_image,
    isPublic: col.is_public,
    status: col.status,
    featured: col.featured,
    tags: col.tags ?? [],
    displayOrder: col.display_order,
    publishedAt: col.published_at,
    scheduledPublishAt: col.scheduled_publish_at,
    seoTitle: col.seo_title,
    seoDescription: col.seo_description,
    rule: col.rule,
    createdBy: col.created_by,
    productCount: col.collection_products?.length ?? col.product_count ?? 0,
    createdAt: col.created_at,
    updatedAt: col.updated_at,
  };
}

// GET /api/catalog/collections - List all collections (admin: all users)
export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
  const q = searchParams.get('q');
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const featured = searchParams.get('featured');
  const sortBy = searchParams.get('sortBy') || 'created_at';
  const sortOrder = searchParams.get('sortOrder') || 'desc';

  let query = supabase
    .from('collections')
    .select('*, collection_products(product_id)', { count: 'exact' });

  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  if (status) query = query.eq('status', status);
  if (type) query = query.eq('type', type);
  if (featured === 'true') query = query.eq('featured', true);

  const sortColMap: Record<string, string> = {
    name: 'name',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    displayOrder: 'display_order',
    publishedAt: 'published_at',
  };
  const col = sortColMap[sortBy] || sortBy;
  query = query.order(col, { ascending: sortOrder === 'asc' });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) return serverError(error.message);

  const total = count ?? 0;
  return NextResponse.json({
    data: (data ?? []).map(mapCollection),
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

// POST /api/catalog/collections - Create collection (admin)
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const body = await req.json();
  const slug = body.slug || body.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const { data, error } = await supabase
    .from('collections')
    .insert({
      name: body.name,
      slug,
      type: body.type || 'manual',
      description: body.description || null,
      cover_image: body.coverImage || null,
      is_public: body.isPublic ?? false,
      status: body.status || 'draft',
      featured: body.featured ?? false,
      tags: body.tags ?? [],
      display_order: body.displayOrder ?? 0,
      published_at: body.publishedAt || null,
      scheduled_publish_at: body.scheduledPublishAt || null,
      seo_title: body.seoTitle || null,
      seo_description: body.seoDescription || null,
      rule: body.rule || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return serverError(error.message);
  return NextResponse.json(mapCollection(data), { status: 201 });
}
