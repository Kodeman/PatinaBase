import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, badRequest, serverError } from '@/lib/admin-api';

// GET /api/catalog/products - List products
export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
  const q = searchParams.get('q');
  const status = searchParams.get('status');
  const category = searchParams.get('category');
  const brand = searchParams.get('brand');
  const sortBy = searchParams.get('sortBy') || 'created_at';
  const sortOrder = searchParams.get('sortOrder') || 'desc';

  let query = supabase.from('products').select('*', { count: 'exact' });

  if (q) query = query.ilike('name', `%${q}%`);
  if (status) query = query.eq('status', status);
  if (category) query = query.eq('category', category);
  if (brand) query = query.eq('brand', brand);

  const sortColMap: Record<string, string> = {
    name: 'name',
    price: 'price_retail',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    publishedAt: 'published_at',
    status: 'status',
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
    data: data ?? [],
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

// POST /api/catalog/products - Create product
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const body = await req.json();
  if (!body.name) return badRequest('Product name is required');

  const { data, error } = await supabase
    .from('products')
    .insert({
      name: body.name,
      description: body.description || body.shortDescription || null,
      brand: body.brand || null,
      category: body.category || 'decor',
      status: body.status || 'draft',
      price_retail: body.price != null ? Math.round(body.price * 100) : null,
      price_trade: body.priceTrade != null ? Math.round(body.priceTrade * 100) : null,
      slug: body.slug || null,
      sku: body.sku || null,
      materials: body.materials || [],
      images: body.images || [],
      tags: body.tags || [],
      style_tags: body.styleTags || [],
      source_url: body.sourceUrl || '',
      captured_by: user.id,
    })
    .select()
    .single();

  if (error) return serverError(error.message);
  return NextResponse.json(data, { status: 201 });
}
