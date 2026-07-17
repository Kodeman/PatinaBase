import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, badRequest, notFound, serverError } from '@/lib/supabase-admin';

// POST /api/admin/fulfillment/pos/[poId]/ack — record a vendor acknowledgment
// (S3, spec §5.3). Body: { committedShip: 'YYYY-MM-DD', ackMethod, ackRef }.
//
// Two consequences, both required by the spec:
//   1. fulfillment_record_ack sets the PO's committed_ship — the client-ETA
//      basis (there is no separate order ETA column; the committed ship date IS
//      the ETA the client is told). A re-ack RE-DATES it. Also advances the
//      PO/lines to acknowledged and logs po.acknowledged.
//   2. THEN this route drafts the client note (fulfillment_record_client_note,
//      draft phase) — an ETA-change note that logs notification.drafted. The
//      operator sends it later with `n` (S4's dispatcher). Client-safe: order
//      number + ETA only, never a vendor name or PO number (spec §6).

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = new Date(m ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ poId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as any;
  const { poId } = await params;
  const actor = auth.user.email ?? auth.user.id;

  let body: { committedShip?: string; ackMethod?: string; ackRef?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid body');
  }
  const committedShip = body.committedShip;
  if (!committedShip || !/^\d{4}-\d{2}-\d{2}$/.test(committedShip)) {
    return badRequest('committedShip (YYYY-MM-DD) is required');
  }

  try {
    // 1. Record the ack — re-dates committed_ship (the client ETA basis).
    const { error: ackErr } = await db.rpc('fulfillment_record_ack', {
      p_po_id: poId,
      p_committed_ship: committedShip,
      p_ack_method: body.ackMethod ?? null,
      p_ack_ref: body.ackRef ?? null,
      p_actor: actor,
    });
    if (ackErr) {
      if (/po .* not found/i.test(ackErr.message ?? '')) return notFound('PO not found');
      throw ackErr;
    }

    // Resolve the order for the client note.
    const { data: po } = await db
      .from('fulfillment_vendor_pos')
      .select('order_id')
      .eq('id', poId)
      .maybeSingle();
    const orderId: string | null = po?.order_id ?? null;

    // 2. Draft the client ETA-change note.
    // PRIMARY: S4's dispatcher route composes the client-safe body itself.
    // FALLBACK (this isolated worktree, where S4's route isn't present): draft
    // directly via the RPC. The combined pass exercises S4's route for real.
    let noteId: string | null = null;
    let draftedVia: 'notify-route' | 'fallback-rpc' | 'skipped' = 'skipped';

    if (orderId) {
      try {
        const draftRes = await fetch(
          new URL('/api/admin/fulfillment/notifications/draft', request.url),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              cookie: request.headers.get('cookie') ?? '',
            },
            body: JSON.stringify({ orderId, transition: 'eta_change' }),
          },
        );
        if (draftRes.ok) {
          const body = await draftRes.json().catch(() => ({}));
          noteId = body?.data?.note_id ?? body?.data?.noteId ?? null;
          draftedVia = 'notify-route';
        } else {
          // 404 (route absent in this worktree) or any non-2xx → fall back.
          console.warn(
            `ack: notifications/draft returned ${draftRes.status}; falling back to direct note draft`,
          );
        }
      } catch (e) {
        console.warn('ack: notifications/draft unreachable; falling back to direct note draft', e);
      }

      if (draftedVia !== 'notify-route') {
        const { data: order } = await db
          .from('fulfillment_orders')
          .select('order_no')
          .eq('id', orderId)
          .maybeSingle();
        // S4 replaces body rendering with _shared/fulfillment-templates.ts
        const draftedBody = `Good news — your order #${order?.order_no ?? ''} is confirmed with your maker and is now expected to ship by ${fmtDate(committedShip)}. We'll be in touch as it progresses.`;
        const { data: nid, error: noteErr } = await db.rpc('fulfillment_record_client_note', {
          p_note_id: null,
          p_order_id: orderId,
          p_transition: 'eta_change',
          p_channel: 'email',
          p_template_key: 'eta_change',
          p_drafted_body: draftedBody,
          p_sent_body: null,
          p_edit_diff: null,
          p_resend_message_id: null,
          p_skipped_reason: null,
          p_actor: actor,
        });
        if (noteErr) throw noteErr;
        noteId = nid ?? null;
        draftedVia = 'fallback-rpc';
      }
    }

    return NextResponse.json({ data: { ok: true, committedShip, noteId, draftedVia } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to record the acknowledgment');
  }
}
