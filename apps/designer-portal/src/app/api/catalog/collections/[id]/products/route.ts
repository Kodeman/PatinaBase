import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/catalog/collections/:id/products - List products in collection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();

    const { searchParams } = new URL(request.url);
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

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = count ?? 0;
    return NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      products: (data ?? []).map((cp: any) => ({
        id: cp.id,
        productId: cp.product_id,
        position: cp.position,
        notes: cp.notes,
        addedAt: cp.added_at,
        product: cp.product,
      })),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error('[API] GET /catalog/collections/[id]/products error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/catalog/collections/:id/products - Add product to collection
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    if (!body.productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    // Get the next position
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
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Product already in collection' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      id: data.id,
      productId: data.product_id,
      position: data.position,
      notes: data.notes,
      addedAt: data.added_at,
    }, { status: 201 });
  } catch (error) {
    console.error('[API] POST /catalog/collections/[id]/products error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/catalog/collections/:id/products - Remove product from collection
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json({ error: 'productId query param is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('collection_products')
      .delete()
      .eq('collection_id', id)
      .eq('product_id', productId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] DELETE /catalog/collections/[id]/products error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
