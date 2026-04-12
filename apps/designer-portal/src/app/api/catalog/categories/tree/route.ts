import { NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/catalog/categories/tree - Category tree with hierarchy
export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[API] GET /catalog/categories/tree error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];

    // Build tree: attach children to their parent nodes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = rows.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      parentId: cat.parent_id,
      description: cat.description,
      imageUrl: cat.image_url,
      productCount: cat.product_count,
      product_count: cat.product_count,
      sortOrder: cat.sort_order,
      isActive: cat.is_active,
      createdAt: cat.created_at,
      updatedAt: cat.updated_at,
      children: [] as any[],
    }));

    // Index by id for quick lookup
    const byId = new Map(mapped.map((c: any) => [c.id, c]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roots: any[] = [];
    for (const node of mapped) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return NextResponse.json(roots);
  } catch (error) {
    console.error('[API] GET /catalog/categories/tree error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
