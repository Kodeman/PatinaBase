import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/catalog/categories/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();

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
    console.error('[API] GET /catalog/categories/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
