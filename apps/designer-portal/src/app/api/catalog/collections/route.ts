import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/catalog/collections - List collections
export async function GET(_request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();

    const { data, error } = await supabase
      .from('collections')
      .select('*, collection_products(product_id)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const collections = (data ?? []).map((col: any) => ({
      id: col.id,
      name: col.name,
      description: col.description,
      coverImage: col.cover_image,
      isPublic: col.is_public,
      createdBy: col.created_by,
      productCount: col.collection_products?.length ?? 0,
      createdAt: col.created_at,
      updatedAt: col.updated_at,
    }));

    return NextResponse.json({ collections });
  } catch (error) {
    console.error('[API] GET /catalog/collections error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/catalog/collections - Create collection (auth required)
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
      .from('collections')
      .insert({
        name: body.name,
        description: body.description || null,
        cover_image: body.coverImage || body.cover_image || null,
        is_public: body.isPublic ?? body.is_public ?? false,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
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
    }, { status: 201 });
  } catch (error) {
    console.error('[API] POST /catalog/collections error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
