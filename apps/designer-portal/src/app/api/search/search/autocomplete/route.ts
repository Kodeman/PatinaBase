import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/search/search/autocomplete - Name suggestions for a query prefix.
export async function GET(request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet updated for new columns
    const supabase: any = await createServerClient();
    const { searchParams } = new URL(request.url);

    const q = searchParams.get('q')?.trim() || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10) || 10, 25);

    if (q.length < 2) {
      return NextResponse.json({ data: { suggestions: [] } });
    }

    const { data, error } = await supabase
      .from('products')
      .select('name')
      .eq('status', 'published')
      .ilike('name', `%${q}%`)
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const suggestions = Array.from(
      new Set((data ?? []).map((p: { name: string }) => p.name).filter(Boolean))
    ).slice(0, limit);

    return NextResponse.json({ data: { suggestions } });
  } catch (error) {
    console.error('[API] GET /search/autocomplete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
