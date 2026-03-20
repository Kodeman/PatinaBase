import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// POST /api/admin/catalog/products/[id]/publish
export async function POST(
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
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      id: data.id,
      status: data.status,
      publishedAt: data.published_at,
    });
  } catch (error) {
    console.error('[API] POST /admin/catalog/products/[id]/publish error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
