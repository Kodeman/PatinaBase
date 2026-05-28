import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// POST /api/style-profile/v1/style-profiles/:id/signals - Append style signals.
// Body: { items: unknown[] }. Signals are appended to signal_history for a
// later recompute pass; the row is created on first signal.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet updated for these columns
    const supabase: any = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const items: unknown[] = Array.isArray(body.items) ? body.items : [];

    const { data: existing, error: readError } = await supabase
      .from('user_style_signals')
      .select('signal_history')
      .eq('user_id', id)
      .maybeSingle();

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }

    const history: unknown[] = Array.isArray(existing?.signal_history)
      ? existing.signal_history
      : [];
    const nextHistory = [...history, ...items];

    const { data, error } = await supabase
      .from('user_style_signals')
      .upsert(
        { user_id: id, signal_history: nextHistory },
        { onConflict: 'user_id' }
      )
      .select('user_id, signal_history')
      .single();

    if (error) {
      console.error('[API] Add style signals error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { data: { id, userId: data.user_id, signalCount: nextHistory.length } },
      { status: 201 }
    );
  } catch (error) {
    console.error('[API] POST /style-profile/v1/style-profiles/[id]/signals error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
