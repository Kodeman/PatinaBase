import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, notFound, badRequest, serverError } from '@/lib/admin-api';

// GET /api/catalog/products/[id]
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return notFound('Product not found');
    return serverError(error.message);
  }

  return NextResponse.json(data);
}

// PATCH /api/catalog/products/[id]
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const body = await req.json();

  // Map camelCase fields to snake_case DB columns
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.shortDescription !== undefined) updateData.description = body.shortDescription;
  if (body.brand !== undefined) updateData.brand = body.brand;
  if (body.category !== undefined) updateData.category = body.category;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.price !== undefined) updateData.price_retail = Math.round(body.price * 100);
  if (body.priceTrade !== undefined) updateData.price_trade = Math.round(body.priceTrade * 100);
  if (body.slug !== undefined) updateData.slug = body.slug;
  if (body.sku !== undefined) updateData.sku = body.sku;
  if (body.materials !== undefined) updateData.materials = body.materials;
  if (body.images !== undefined) updateData.images = body.images;
  if (body.tags !== undefined) updateData.tags = body.tags;
  if (body.styleTags !== undefined) updateData.style_tags = body.styleTags;
  if (body.sourceUrl !== undefined) updateData.source_url = body.sourceUrl;
  if (body.seoTitle !== undefined) updateData.seo_title = body.seoTitle;
  if (body.seoDescription !== undefined) updateData.seo_description = body.seoDescription;

  if (Object.keys(updateData).length === 0) {
    return badRequest('No fields to update');
  }

  const { data, error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return notFound('Product not found');
    return serverError(error.message);
  }

  return NextResponse.json(data);
}

// DELETE /api/catalog/products/[id]
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) return serverError(error.message);

  return NextResponse.json({ success: true });
}
