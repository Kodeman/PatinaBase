import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, badRequest, serverError } from '@/lib/admin-api';

// GET /api/catalog/collections/:id/products
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from('collection_products')
    .select('id, product_id, position, notes, added_at, product:products(*)', { count: 'exact' })
    .eq('collection_id', id)
    .order('position', { ascending: true })
    .range(from, to);

  if (error) return serverError(error.message);

  const total = count ?? 0;
  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: (data ?? []).map((cp: any) => ({
      id: cp.id,
      productId: cp.product_id,
      position: cp.position,
      notes: cp.notes,
      addedAt: cp.added_at,
      product: cp.product,
    })),
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
}

// POST /api/catalog/collections/:id/products - Add product
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json();
  if (!body.productId) return badRequest('productId is required');

  // Get next position
  const { data: maxPos } = await supabase
    .from('collection_products')
    .select('position')
    .eq('collection_id', id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const position = body.position ?? ((maxPos?.position ?? -1) + 1);

  const { data, error } = await supabase
    .from('collection_products')
    .insert({
      collection_id: id,
      product_id: body.productId,
      position,
      notes: body.notes || null,
    })
    .select('id, product_id, position, notes, added_at')
    .single();

  if (error) {
    if (error.code === '23505') return badRequest('Product already in collection');
    return serverError(error.message);
  }

  return NextResponse.json({
    id: data.id,
    productId: data.product_id,
    position: data.position,
    notes: data.notes,
    addedAt: data.added_at,
  }, { status: 201 });
}

// DELETE /api/catalog/collections/:id/products?productId=xxx
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const productId = new URL(req.url).searchParams.get('productId');
  if (!productId) return badRequest('productId query param is required');

  const { error } = await supabase
    .from('collection_products')
    .delete()
    .eq('collection_id', id)
    .eq('product_id', productId);

  if (error) return serverError(error.message);
  return NextResponse.json({ success: true });
}
