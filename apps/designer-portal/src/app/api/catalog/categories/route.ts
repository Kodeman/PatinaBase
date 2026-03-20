import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/catalog/categories - List categories
export async function GET(request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get('parentId');

    let query = supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (parentId) {
      query = query.eq('parent_id', parentId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const categories = (data ?? []).map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      parentId: cat.parent_id,
      description: cat.description,
      imageUrl: cat.image_url,
      productCount: cat.product_count,
      sortOrder: cat.sort_order,
      isActive: cat.is_active,
      createdAt: cat.created_at,
      updatedAt: cat.updated_at,
    }));

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('[API] GET /catalog/categories error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
