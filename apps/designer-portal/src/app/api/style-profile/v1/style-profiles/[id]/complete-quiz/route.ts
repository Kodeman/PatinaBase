import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// POST /api/style-profile/v1/style-profiles/:id/complete-quiz
// Stores the raw quiz answers into signal_history. There is no dedicated quiz
// scoring backend yet, so this records the submission and returns the profile
// id rather than 404ing (which would silently drop the answers).
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

    const answers = await request.json().catch(() => ({}));

    const { data: existing } = await supabase
      .from('user_style_signals')
      .select('signal_history')
      .eq('user_id', id)
      .maybeSingle();

    const history: unknown[] = Array.isArray(existing?.signal_history)
      ? existing.signal_history
      : [];
    const nextHistory = [
      ...history,
      { kind: 'quiz', answers, submittedAt: new Date().toISOString() },
    ];

    const { error } = await supabase
      .from('user_style_signals')
      .upsert(
        { user_id: id, signal_history: nextHistory },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('[API] complete-quiz upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { data: { id, userId: id, quizCompleted: true } },
      { status: 201 }
    );
  } catch (error) {
    console.error('[API] POST /style-profile/v1/style-profiles/[id]/complete-quiz error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
