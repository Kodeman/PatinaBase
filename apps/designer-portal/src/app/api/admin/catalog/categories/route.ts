import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/admin/catalog/categories - List categories (admin)
export async function GET(_request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

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
    console.error('[API] GET /admin/catalog/categories error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/catalog/categories - Create category (admin)
export async function POST(request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();

    const { data, error } = await supabase
      .from('categories')
      .insert({
        name: body.name,
        slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        parent_id: body.parentId || body.parent_id || null,
        description: body.description || null,
        image_url: body.image || body.imageUrl || body.image_url || null,
        sort_order: body.order ?? body.sortOrder ?? 0,
        is_active: body.isActive ?? true,
      })
      .select()
      .single();

    if (error) {
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
    }, { status: 201 });
  } catch (error) {
    console.error('[API] POST /admin/catalog/categories error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
