import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, notFound, serverError } from '@/lib/admin-api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCollection(data: any) {
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    type: data.type,
    description: data.description,
    coverImage: data.cover_image,
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const { data, error } = await supabase
    .from('collections')
    .select('*, collection_products(id, product_id, position, notes, added_at, product:products(*))')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return notFound('Collection not found');
    return serverError(error.message);
  }

  const collection = mapCollection(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (data.collection_products ?? []).map((cp: any) => ({
    id: cp.id,
    productId: cp.product_id,
    position: cp.position,
    notes: cp.notes,
    addedAt: cp.added_at,
    product: cp.product,
  }));

  return NextResponse.json({
    ...collection,
    items,
    productCount: items.length,
  });
}

// PATCH /api/catalog/collections/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json();
  const updateData: Record<string, unknown> = {};

  if (body.name !== undefined) updateData.name = body.name;
  if (body.slug !== undefined) updateData.slug = body.slug;
  if (body.type !== undefined) updateData.type = body.type;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.coverImage !== undefined) updateData.cover_image = body.coverImage;
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
    if (error.code === 'PGRST116') return notFound('Collection not found');
    return serverError(error.message);
  }

  return NextResponse.json(mapCollection(data));
}

// DELETE /api/catalog/collections/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const { error } = await supabase
    .from('collections')
    .delete()
    .eq('id', id);

  if (error) return serverError(error.message);
  return NextResponse.json({ success: true });
}
