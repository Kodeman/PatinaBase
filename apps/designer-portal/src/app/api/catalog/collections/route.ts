import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/catalog/collections - List collections with filters and pagination
export async function GET(request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();

    const { searchParams } = new URL(request.url);
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

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const collections = (data ?? []).map((col: any) => ({
      id: col.id,
      name: col.name,
      slug: col.slug,
      type: col.type,
      description: col.description,
      coverImage: col.cover_image,
      heroImage: col.cover_image,
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
      productCount: col.collection_products?.length ?? 0,
      createdAt: col.created_at,
      updatedAt: col.updated_at,
    }));

    const total = count ?? 0;
    return NextResponse.json({
      collections,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('[API] GET /catalog/collections error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/catalog/collections - Create collection (auth required)
export async function POST(request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();

    // Auto-generate slug from name if not provided
    const slug = body.slug || body.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const { data, error } = await supabase
      .from('collections')
      .insert({
        name: body.name,
        slug,
        type: body.type || 'manual',
        description: body.description || null,
        cover_image: body.coverImage || body.heroImage || body.cover_image || null,
        is_public: body.isPublic ?? body.is_public ?? false,
        status: body.status || 'draft',
        featured: body.featured ?? false,
        tags: body.tags ?? [],
        display_order: body.displayOrder ?? body.display_order ?? 0,
        published_at: body.publishedAt || null,
        scheduled_publish_at: body.scheduledPublishAt || null,
        seo_title: body.seoTitle || null,
        seo_description: body.seoDescription || null,
        rule: body.rule || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      id: data.id,
      name: data.name,
      slug: data.slug,
      type: data.type,
      description: data.description,
      coverImage: data.cover_image,
      heroImage: data.cover_image,
      isPublic: data.is_public,
      status: data.status,
      featured: data.featured,
      tags: data.tags ?? [],
      displayOrder: data.display_order,
      publishedAt: data.published_at,
      scheduledPublishAt: data.scheduled_publish_at,
      seoTitle: data.seo_title,
      seoDescription: data.seo_description,
      rule: data.rule,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }, { status: 201 });
  } catch (error) {
    console.error('[API] POST /catalog/collections error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
