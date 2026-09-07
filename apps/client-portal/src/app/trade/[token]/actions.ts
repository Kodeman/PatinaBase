'use server';

/**
 * Trade Agreement guest page server action (P14, R16).
 *
 * Calls sign_trade_agreement_by_token directly — no pre-resolve check, for
 * the same reason submit_trade_rfq_response is called directly from
 * rfq/[token]/actions.ts: the RPC re-resolves the token itself and is the
 * sole authority on the outcome. It is what can tell a link that never
 * existed (invalid_link) apart from a live token whose agreement was
 * withdrawn (agreement_void) apart from one already signed (already_signed,
 * which returns the original receipt rather than raising). A pre-resolve call
 * would answer NULL for the withdrawn case — indistinguishable from garbage —
 * and would flatten three different sentences into one wrong one.
 *
 * The RPC classifies on either channel: an outcome key on the returned JSONB,
 * or a raised message carrying the same token. Both are read here, so a
 * backend that raises and a backend that returns produce the same sentence on
 * the page and neither can fall through to a raw DB message.
 *
 * READING THE ANSWER (S5). The build sheet freezes resolve's DTO (I-4) but
 * freezes no success shape for this RPC — it names only the three failure
 * classifications. So the answer is read FAILURE-FIRST: a recognised failure
 * word, or an empty answer, is a failure; anything else the RPC handed back
 * without raising is a committed signature, whatever it chose to call the
 * keys. Reading it success-first would mean an unrecognised receipt shape
 * ({ ok: true }, snake_case names) printed "This link is no longer active."
 * to a sub whose signature had just committed — the one sentence that must
 * never appear over a real signature. Both key spellings are read for the
 * same reason rfq/[token]/actions.ts reads amountCents and amount_cents.
 *
 * sign_trade_agreement_by_token is service_role ONLY — this file is the only
 * caller a login-less guest surface has.
 */

import { headers } from 'next/headers';
import { createServiceClient } from '@patina/supabase/server';
import { resolveClientIp } from '@/lib/utils/client-ip';
import { isLikelyTradeAgreementToken } from './types';

/** The floor the signature table's own CHECK keeps (char_length(btrim(signed_name)) >= 2). */
export const MIN_SIGNED_NAME_LENGTH = 2;

export type SignTradeAgreementResult =
  | { status: 'saved'; signedName: string; signedAt: string | null }
  | { status: 'already_signed'; signedName: string; signedAt: string | null }
  | { status: 'agreement_void' }
  | { status: 'invalid' };

function classifyMessage(message: string): 'agreement_void' | 'invalid' {
  // Only the withdrawn case gets its own sentence. invalid_link and every
  // unrecognized failure read alike, so a dead link never confirms it once
  // existed and a raw DB message never reaches the sub.
  return message.includes('agreement_void') ? 'agreement_void' : 'invalid';
}

/** The withdrawn classification, on whichever word the RPC chose. */
const VOID_OUTCOMES = new Set(['agreement_void', 'void', 'voided']);

/** The dead-link classifications — every one reads as the same sentence. */
const INVALID_OUTCOMES = new Set(['invalid_link', 'invalid', 'not_found', 'expired', 'revoked']);

/**
 * The outcome word, wherever the RPC put it: a classification string, or a
 * `status`/`outcome`/`result` key on the returned object. NULL means the
 * answer carried no classification at all — which, per the failure-first
 * reading above, is a committed signature rather than a failure.
 */
function readOutcome(row: unknown): string | null {
  if (typeof row === 'string') return row;
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  for (const key of ['status', 'outcome', 'result']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function readString(row: unknown, keys: string[]): string | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

export async function signTradeAgreement(
  token: string,
  input: { signedName: string },
): Promise<SignTradeAgreementResult> {
  if (!isLikelyTradeAgreementToken(token)) return { status: 'invalid' };

  const signedName = input.signedName?.trim() ?? '';
  if (signedName.length < MIN_SIGNED_NAME_LENGTH) return { status: 'invalid' };

  // The signing IP is evidence, so it is read from the request the way the
  // prime's own e-signature route reads it — Cloudflare's edge header first,
  // never a value the browser could hand us.
  const signedIp = resolveClientIp(await headers());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceClient() as any;

  const { data, error } = await admin.rpc('sign_trade_agreement_by_token', {
    p_token: token,
    p_signed_name: signedName,
    p_signed_ip: signedIp,
  });

  if (error) {
    const message = typeof error.message === 'string' ? error.message : '';
    return { status: classifyMessage(message) };
  }

  const row = Array.isArray(data) ? data[0] : data;

  // An empty answer is the only shape that is a failure without saying so:
  // there is no receipt in it to show.
  if (row === null || row === undefined) return { status: 'invalid' };

  const outcome = readOutcome(row);

  if (outcome && VOID_OUTCOMES.has(outcome)) return { status: 'agreement_void' };
  if (outcome && INVALID_OUTCOMES.has(outcome)) return { status: 'invalid' };

  // No revalidatePath here (S3). The token is revoked in the same transaction
  // as the signature, so re-rendering this route on the way back would resolve
  // the now-spent token to NULL and replace the just-inked receipt with the
  // not-found page. The receipt is rendered from the component's own state and
  // the route is force-dynamic, so the call bought nothing even when it was
  // harmless.
  return {
    status: outcome === 'already_signed' ? 'already_signed' : 'saved',
    signedName: readString(row, ['signedName', 'signed_name']) ?? signedName,
    signedAt: readString(row, ['signedAt', 'signed_at']),
  };
}
