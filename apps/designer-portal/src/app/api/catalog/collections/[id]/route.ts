import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// Helper to map DB row to API response
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCollection(data: any) {
  return {
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
  };
}

// GET /api/catalog/collections/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();

    const { data, error } = await supabase
      .from('collections')
      .select('*, collection_products(id, product_id, position, notes, product:products(*))')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const collection = mapCollection(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products = (data.collection_products ?? []).map((cp: any) => ({
      id: cp.id,
      productId: cp.product_id,
      position: cp.position,
      notes: cp.notes,
      product: cp.product,
    }));

    return NextResponse.json({
      ...collection,
      items: products,
      products: data.collection_products ?? [],
      productCount: products.length,
    });
  } catch (error) {
    console.error('[API] GET /catalog/collections/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/catalog/collections/:id
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

    // Map all camelCase fields to snake_case
    if (body.name !== undefined) updateData.name = body.name;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.coverImage !== undefined) updateData.cover_image = body.coverImage;
    if (body.heroImage !== undefined) updateData.cover_image = body.heroImage;
    if (body.isPublic !== undefined) updateData.is_public = body.isPublic;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.featured !== undefined) updateData.featured = body.featured;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.displayOrder !== undefined) updateData.display_order = body.displayOrder;
    if (body.publishedAt !== undefined) updateData.published_at = body.publishedAt;
    if (body.scheduledPublishAt !== undefined) updateData.scheduled_publish_at = body.scheduledPublishAt;
    if (body.seoTitle !== undefined) updateData.seo_title = body.seoTitle;
    if (body.seoDescription !== undefined) updateData.seo_description = body.seoDescription;
    if (body.rule !== undefined) updateData.rule = body.rule;

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('collections')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(mapCollection(data));
  } catch (error) {
    console.error('[API] PATCH /catalog/collections/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/catalog/collections/:id
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
      .from('collections')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] DELETE /catalog/collections/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
