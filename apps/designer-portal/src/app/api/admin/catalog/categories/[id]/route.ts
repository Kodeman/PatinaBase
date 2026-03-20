import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/admin/catalog/categories/[id]
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
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      name: data.name,
      slug: data.slug,
      parentId: data.parent_id,
      description: data.description,
      imageUrl: data.image_url,
      productCount: data.product_count,
      sortOrder: data.sort_order,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    console.error('[API] GET /admin/catalog/categories/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/catalog/categories/[id]
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
    if (body.parentId !== undefined) updateData.parent_id = body.parentId;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.image !== undefined) updateData.image_url = body.image;
    if (body.imageUrl !== undefined) updateData.image_url = body.imageUrl;
    if (body.order !== undefined) updateData.sort_order = body.order;
    if (body.sortOrder !== undefined) updateData.sort_order = body.sortOrder;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      id: data.id,
      name: data.name,
      slug: data.slug,
      parentId: data.parent_id,
      description: data.description,
      imageUrl: data.image_url,
      productCount: data.product_count,
      sortOrder: data.sort_order,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    console.error('[API] PATCH /admin/catalog/categories/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/catalog/categories/[id]
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
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] DELETE /admin/catalog/categories/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
