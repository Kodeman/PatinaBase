import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/catalog/vendors - List vendors
export async function GET(_request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();

    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ vendors: data ?? [] });
  } catch (error) {
    console.error('[API] GET /catalog/vendors error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
