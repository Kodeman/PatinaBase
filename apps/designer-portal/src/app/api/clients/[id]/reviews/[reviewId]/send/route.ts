import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// POST /api/clients/[id]/reviews/[reviewId]/send
//
// CLI-09 / CLI-19: send (or schedule) a review request for an existing
// client_reviews row.
//   • [id]       — designer_clients row id (scopes the row to the designer).
//   • [reviewId] — client_reviews row id.
//   • Body { mode: 'send' | 'schedule', scheduledFor?: ISO string }.
//
// 'send'      -> request_status='sent',   request_sent_at=now()  (mirrors the
//                review-requests auto-sender edge function).
// 'schedule'  -> request_status='queued', scheduled_for=<scheduledFor>.
//
// RLS ("Designers can manage their reviews", migration 00062) scopes the row.
// Real review-request email delivery is owned by the review-requests cron edge
// function; here we persist the workflow state. Best-effort dispatch on 'send'
// is attempted but never blocks the response (deferred in local).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; reviewId: string }> }
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

    const { id: designerClientId, reviewId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const mode: 'send' | 'schedule' = body.mode === 'schedule' ? 'schedule' : 'send';
    const nowIso = new Date().toISOString();

    let update: Record<string, unknown>;
    if (mode === 'schedule') {
      const scheduledFor: string | undefined = body.scheduledFor;
      if (!scheduledFor || Number.isNaN(new Date(scheduledFor).getTime())) {
        return NextResponse.json(
          { error: 'scheduledFor (ISO date) is required to schedule' },
          { status: 400 }
        );
      }
      update = {
        request_status: 'queued',
        scheduled_for: new Date(scheduledFor).toISOString(),
      };
    } else {
      update = { request_status: 'sent', request_sent_at: nowIso };
    }

    const { data: review, error: updateError } = await supabase
      .from('client_reviews')
      .update(update)
      .eq('id', reviewId)
      .eq('designer_client_id', designerClientId)
      .select(
        `
        id,
        request_status,
        request_sent_at,
        scheduled_for,
        project:projects!project_id(id, name),
        designer_client:designer_clients!designer_client_id(
          client_email,
          client_name,
          client:profiles!client_id(email, full_name)
        )
      `
      )
      .single();

    if (updateError) {
      console.error('[API] review send/schedule update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
    if (!review) {
      return NextResponse.json({ error: 'Review request not found' }, { status: 404 });
    }

    // Best-effort email on immediate send — never blocks success.
    let emailDispatched = false;
    if (mode === 'send') {
      const dc = review.designer_client;
      const clientEmail = dc?.client?.email || dc?.client_email || null;
      if (clientEmail) {
        try {
          const { error: fnError } = await supabase.functions.invoke('notification-dispatch', {
            body: {
              user_id: dc?.client?.id ?? user.id,
              type: 'review_request',
              channel: 'email',
              template_id: 'review_request',
              data: {
                to: clientEmail,
                client_name: dc?.client?.full_name || dc?.client_name || null,
                project_name: review.project?.name ?? null,
                project_id: review.project?.id ?? null,
              },
              priority: 'normal',
            },
          });
          emailDispatched = !fnError;
        } catch (err) {
          console.warn('[API] review-request email dispatch deferred:', err);
        }
      }
    }

    return NextResponse.json({
      data: {
        id: review.id,
        request_status: review.request_status,
        request_sent_at: review.request_sent_at,
        scheduled_for: review.scheduled_for,
        emailDispatched,
      },
    });
  } catch (error) {
    console.error('[API] POST /clients/[id]/reviews/[reviewId]/send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
