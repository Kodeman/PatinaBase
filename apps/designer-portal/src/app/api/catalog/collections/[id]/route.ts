import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

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
      .select('*, collection_products(product_id, position, product:products(*))')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      name: data.name,
      description: data.description,
      coverImage: data.cover_image,
      isPublic: data.is_public,
      createdBy: data.created_by,
      products: data.collection_products ?? [],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
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
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.coverImage !== undefined) updateData.cover_image = body.coverImage;
    if (body.isPublic !== undefined) updateData.is_public = body.isPublic;
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

    return NextResponse.json({
      id: data.id,
      name: data.name,
      description: data.description,
      coverImage: data.cover_image,
      isPublic: data.is_public,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
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

    // Delete collection products first
    await supabase
      .from('collection_products')
      .delete()
      .eq('collection_id', id);

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
