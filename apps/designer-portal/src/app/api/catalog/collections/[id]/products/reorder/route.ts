import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// PUT /api/catalog/collections/:id/products/reorder - Reorder products
export async function PUT(
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
    const productIds: string[] = body.productIds;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: 'productIds array is required' }, { status: 400 });
    }

    // Update positions based on array order
    const updates = productIds.map((productId, index) =>
      supabase
        .from('collection_products')
        .update({ position: index })
        .eq('collection_id', id)
        .eq('product_id', productId)
    );

    const results = await Promise.all(updates);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, count: productIds.length });
  } catch (error) {
    console.error('[API] PUT /catalog/collections/[id]/products/reorder error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
