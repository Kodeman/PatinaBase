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

// GET /api/admin/catalog/products/[id]
export async function GET(
  _request: NextRequest,
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

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(snakeToCamel(data));
  } catch (error) {
    console.error('[API] GET /admin/catalog/products/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/catalog/products/[id]
export async function PATCH(
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
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.brand !== undefined) updateData.brand = body.brand;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.longDescription !== undefined) updateData.description = body.longDescription;
    if (body.shortDescription !== undefined) updateData.short_description = body.shortDescription;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.sku !== undefined) updateData.sku = body.sku;
    if (body.price !== undefined) updateData.price_retail = Math.round(body.price * 100);
    if (body.priceRetail !== undefined) updateData.price_retail = body.priceRetail;
    if (body.tradePrice !== undefined) updateData.price_trade = body.tradePrice;
    if (body.sourceUrl !== undefined) updateData.source_url = body.sourceUrl;
    if (body.images !== undefined) updateData.images = body.images;
    if (body.materials !== undefined) updateData.materials = body.materials;
    if (body.dimensions !== undefined) updateData.dimensions = body.dimensions;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.styleTags !== undefined) updateData.style_tags = body.styleTags;
    if (body.seoTitle !== undefined) updateData.seo_title = body.seoTitle;
    if (body.seoDescription !== undefined) updateData.seo_description = body.seoDescription;
    if (body.vendorId !== undefined) updateData.vendor_id = body.vendorId;

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(snakeToCamel(data));
  } catch (error) {
    console.error('[API] PATCH /admin/catalog/products/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/catalog/products/[id]
export async function DELETE(
  _request: NextRequest,
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

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] DELETE /admin/catalog/products/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
