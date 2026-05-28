import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// POST /api/clients/[id]/nurture-send
//
// CLI-08: send a personalized nurture note to a past client.
//   • [id] is the designer_clients row id (the relationship being nurtured).
//   • Body carries the touchpoint id + composed note content.
//
// Persists the note: writes client_nurture_touchpoints.content, marks
// email_sent_at = now(), and flips status -> 'sent'. RLS ("Designers can
// manage their touchpoints", migration 00062) scopes the row to the calling
// designer.
//
// Best-effort email dispatch is attempted via the notification-dispatch edge
// function. A dispatch failure does NOT fail the request — persistence +
// marking sent is the contract; real delivery is best-effort (and deferred
// in local where the edge function/Resend may be unavailable).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet regenerated for new columns
    const supabase: any = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id: designerClientId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const touchpointId: string | undefined = body.touchpointId;
    const content: string = (body.content ?? '').toString().trim();

    if (!touchpointId) {
      return NextResponse.json({ error: 'touchpointId is required' }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // Persist the note + mark sent. RLS guarantees the touchpoint belongs to
    // this designer; we additionally scope by designer_client_id so the path
    // param and the row agree.
    const { data: touchpoint, error: updateError } = await supabase
      .from('client_nurture_touchpoints')
      .update({ content, email_sent_at: nowIso, status: 'sent' })
      .eq('id', touchpointId)
      .eq('designer_client_id', designerClientId)
      .select(
        `
        id,
        designer_client_id,
        designer_client:designer_clients!designer_client_id(
          client_email,
          client_name,
          client:profiles!client_id(email, full_name)
        )
      `
      )
      .single();

    if (updateError) {
      console.error('[API] nurture-send update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
    if (!touchpoint) {
      return NextResponse.json({ error: 'Touchpoint not found' }, { status: 404 });
    }

    // Best-effort email dispatch — never blocks the success response.
    let emailDispatched = false;
    const dc = touchpoint.designer_client;
    const clientEmail = dc?.client?.email || dc?.client_email || null;
    if (clientEmail) {
      try {
        const { error: fnError } = await supabase.functions.invoke('notification-dispatch', {
          body: {
            user_id: dc?.client?.id ?? user.id,
            type: 'nurture_note',
            channel: 'email',
            template_id: 'nurture_note',
            data: {
              to: clientEmail,
              client_name: dc?.client?.full_name || dc?.client_name || null,
              content,
            },
            priority: 'normal',
          },
        });
        emailDispatched = !fnError;
      } catch (err) {
        // Edge function unavailable (common in local) — note is still
        // persisted + marked sent. Dispatch is deferred.
        console.warn('[API] nurture-send email dispatch deferred:', err);
      }
    }

    return NextResponse.json({
      data: { id: touchpoint.id, status: 'sent', email_sent_at: nowIso, emailDispatched },
    });
  } catch (error) {
    console.error('[API] POST /clients/[id]/nurture-send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
