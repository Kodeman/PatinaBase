import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// POST /api/catalog/collections/:id/evaluate - Evaluate rule-based collection
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

    // Call the Postgres function to evaluate rules
    const { data, error } = await supabase.rpc('evaluate_collection_rules', {
      p_collection_id: id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // If the function returned an error in its result
    if (data?.error) {
      return NextResponse.json({ error: data.error }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] POST /catalog/collections/[id]/evaluate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
