import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// S7 Leah ruling (R1.4, §9.4) — rule_leah_review writes back to the exception
// (approve → resolved; reject → reopened). On approve we ALSO draft the client
// substitution note through S4's single template source (fulfillment-notify,
// transition 'substitution'), composing a CLIENT-SAFE note here: it names the
// item and the plain-language difference from the comparison card, never a
// vendor. Reusing S4's edge fn keeps the leak-tested boundary intact.

function substitutionNote(itemName: string | null, payload: Record<string, unknown>): string {
  const comparison = (payload.comparison as Record<string, unknown>) ?? payload;
  const difference = typeof comparison.difference === 'string' ? comparison.difference : null;
  const priceDelta = Number(comparison.price_delta_cents ?? 0);
  const leadDelta = Number(comparison.lead_delta_days ?? 0);
  const item = itemName ?? 'one of the pieces on your order';
  const diffClause = difference ? ` — a very similar option with a ${difference}` : ' to a very similar option';
  const noChange = priceDelta === 0 && leadDelta === 0 ? ' at no change to your price or timeline' : '';
  return `We've made a small update to ${item}${diffClause}${noChange}. We think you'll love it, but just say the word if you'd prefer the original.`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const actor = auth.user.email ?? auth.user.id;
  const { id } = await params;

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (body.status !== 'approved' && body.status !== 'rejected') {
    return badRequest("status must be 'approved' or 'rejected'");
  }

  try {
    // fetch the review's payload + item name BEFORE ruling (for the note copy)
    const { data: review } = await db
      .from('leah_reviews')
      .select('exception_id, payload')
      .eq('id', id)
      .maybeSingle();

    const { data: ruled, error } = await db.rpc('rule_leah_review', {
      p_review_id: id,
      p_status: body.status,
      p_ruled_by: actor,
    });
    if (error) {
      if (/already ruled|not found/i.test(error.message ?? '')) return badRequest(error.message);
      throw error;
    }
    const result = (ruled ?? {}) as { order_id?: string; exception_id?: string };

    let noteDrafted = false;
    if (body.status === 'approved' && result.order_id) {
      // client-safe items for the order (no cancelled lines)
      const { data: items } = await db
        .from('fulfillment_order_items')
        .select('id, item_name, qty, line_state')
        .eq('order_id', result.order_id)
        .neq('line_state', 'cancelled');
      const excItemId = review?.exception_id
        ? (await db.from('fulfillment_exceptions').select('order_item_id').eq('id', review.exception_id).maybeSingle())
            .data?.order_item_id
        : null;
      const itemName =
        (items ?? []).find((i) => i.id === excItemId)?.item_name ??
        (items ?? [])[0]?.item_name ??
        null;
      const context = {
        items: (items ?? []).map((i) => ({ name: i.item_name, qty: i.qty })),
        eta: null,
        exceptionNote: substitutionNote(itemName, (review?.payload as Record<string, unknown>) ?? {}),
      };
      const { error: draftErr } = await db.functions.invoke('fulfillment-notify', {
        body: { action: 'draft', order_id: result.order_id, transition: 'substitution', context, actor },
      });
      noteDrafted = !draftErr;
    }

    return NextResponse.json({ data: { ...result, status: body.status, noteDrafted } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to rule review');
  }
}
