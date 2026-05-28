import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

interface FacetValue {
  value: string;
  count: number;
}

function tally(rows: Array<Record<string, unknown>>, key: string): FacetValue[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value === 'string' && value.length > 0) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

// GET /api/search/search/facets - Facet counts (category, brand) over the
// published catalog. Returns { facets: Record<string, FacetValue[]> }.
export async function GET(_request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet updated for new columns
    const supabase: any = await createServerClient();

    const { data, error } = await supabase
      .from('products')
      .select('category, brand')
      .eq('status', 'published')
      .limit(1000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;

    return NextResponse.json({
      data: {
        facets: {
          category: tally(rows, 'category'),
          brand: tally(rows, 'brand'),
        },
      },
    });
  } catch (error) {
    console.error('[API] GET /search/facets error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
