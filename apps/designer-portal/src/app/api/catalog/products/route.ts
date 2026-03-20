import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

function snakeToCamel(product: Record<string, unknown>) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    description: product.description,
    shortDescription: product.short_description,
    category: product.category,
    status: product.status,
    sku: product.sku,
    price: product.price_retail ? (product.price_retail as number) / 100 : null,
    priceRetail: product.price_retail,
    tradePrice: product.price_trade,
    sourceUrl: product.source_url,
    capturedBy: product.captured_by,
    images: product.images ?? [],
    materials: product.materials ?? [],
    dimensions: product.dimensions,
    tags: product.tags ?? [],
    styleTags: product.style_tags ?? [],
    seoTitle: product.seo_title,
    seoDescription: product.seo_description,
    publishedAt: product.published_at,
    vendorId: product.vendor_id,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}

// GET /api/catalog/products - List products
export async function GET(request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet updated for new columns
    const supabase: any = await createServerClient();
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || searchParams.get('limit') || '20', 10);
    const search = searchParams.get('search') || searchParams.get('q');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const brand = searchParams.get('brand');
    const sortBy = searchParams.get('sortBy') || 'created_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('products')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (brand) {
      query = query.ilike('brand', `%${brand}%`);
    }

    query = query.range(from, to).order(sortBy, { ascending: sortOrder === 'asc' });

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      products: (data ?? []).map(snakeToCamel),
      meta: {
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    });
  } catch (error) {
    console.error('[API] GET /catalog/products error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/catalog/products - Create product (auth required)
export async function POST(request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet updated for new columns
    const supabase: any = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();

    // Map camelCase input to snake_case DB columns
    const insertData: Record<string, unknown> = {
      name: body.name,
      slug: body.slug || (body.name ? body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null),
      brand: body.brand,
      description: body.description || body.longDescription,
      short_description: body.shortDescription,
      category: body.category || 'decor',
      status: body.status || 'draft',
      sku: body.sku,
      price_retail: body.price ? Math.round(body.price * 100) : body.priceRetail ?? null,
      price_trade: body.tradePrice ?? body.price_trade ?? null,
      source_url: body.sourceUrl || body.source_url || null,
      images: body.images || [],
      materials: body.materials || [],
      dimensions: body.dimensions || null,
      tags: body.tags || [],
      style_tags: body.styleTags || body.style_tags || [],
      seo_title: body.seoTitle || null,
      seo_description: body.seoDescription || null,
      captured_by: user.id,
      captured_at: new Date().toISOString(),
      vendor_id: body.vendorId || body.vendor_id || null,
    };

    const { data, error } = await supabase
      .from('products')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[API] Create product error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: snakeToCamel(data) }, { status: 201 });
  } catch (error) {
    console.error('[API] POST /catalog/products error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
