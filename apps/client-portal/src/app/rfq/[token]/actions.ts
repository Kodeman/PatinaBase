'use server';

/**
 * Trade RFQ guest page server action (Trade Scope RFQ dispatch, Phase 2).
 *
 * Calls submit_trade_rfq_response directly — no pre-resolve check. The RPC
 * re-resolves the token itself and is the sole authority on outcome: it can
 * tell an invalid/dead token (invalid_rfq_link) apart from a live token whose
 * ask has simply closed since the page loaded (bid_window_closed), because
 * _execute_trade_scope_authorized's post-signature delta revokes this ask's
 * token in the SAME transaction that closes it. A pre-resolve call would see
 * that revoked token first and answer NULL — indistinguishable from a token
 * that never existed — masking the true "the work was awarded" outcome as a
 * generic 'invalid' one. Letting submit_trade_rfq_response classify directly
 * is what surfaces the correct sentence to the party (see
 * rfq-response-form.tsx's bid_window_closed branch).
 *
 * submit_trade_rfq_response is service_role ONLY — this file is the only
 * caller a login-less guest surface has.
 */

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@patina/supabase/server';
import { isLikelyTradeRfqToken } from './types';

export type SubmitRfqResponseResult =
  | { status: 'saved'; amountCents: number; respondedAt: string | null }
  | { status: 'replayed'; amountCents: number; respondedAt: string | null }
  | { status: 'bid_locked' }
  | { status: 'bid_window_closed' }
  | { status: 'invalid' };

export async function submitRfqResponse(
  token: string,
  input: { amountCents: number; note?: string | null },
): Promise<SubmitRfqResponseResult> {
  if (!isLikelyTradeRfqToken(token)) return { status: 'invalid' };
  if (!Number.isFinite(input.amountCents) || input.amountCents < 0) {
    return { status: 'invalid' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceClient() as any;

  const { data, error } = await admin.rpc('submit_trade_rfq_response', {
    p_token: token,
    p_amount_cents: Math.round(input.amountCents),
    p_note: input.note?.trim() || null,
  });

  if (error) {
    const message = typeof error.message === 'string' ? error.message : '';
    if (message.includes('bid_locked')) return { status: 'bid_locked' };
    if (message.includes('bid_window_closed')) return { status: 'bid_window_closed' };
    return { status: 'invalid' };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) return { status: 'invalid' };

  // The page reads the RFQ's status and any existing response fresh on every
  // request (force-dynamic) — revalidate so a reload after submitting shows
  // the just-saved state rather than a cached pre-submit read.
  revalidatePath(`/rfq/${token}`);

  const amountCents =
    typeof row.amountCents === 'number'
      ? row.amountCents
      : typeof row.amount_cents === 'number'
        ? row.amount_cents
        : input.amountCents;
  const respondedAt =
    typeof row.respondedAt === 'string'
      ? row.respondedAt
      : typeof row.responded_at === 'string'
        ? row.responded_at
        : null;

  return {
    status: row.replayed === true ? 'replayed' : 'saved',
    amountCents,
    respondedAt,
  };
}
