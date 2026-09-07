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
 * sign_trade_agreement_by_token is service_role ONLY — this file is the only
 * caller a login-less guest surface has.
 */

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
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
  const outcome = typeof row?.status === 'string' ? row.status : null;

  if (outcome === 'agreement_void') return { status: 'agreement_void' };
  if (outcome !== 'signed' && outcome !== 'already_signed') return { status: 'invalid' };

  // The page reads the agreement and any existing signature fresh on every
  // request (force-dynamic) — revalidate so a reload after signing shows the
  // settled receipt rather than a cached pre-signature read.
  revalidatePath(`/trade/${token}`);

  return {
    status: outcome === 'already_signed' ? 'already_signed' : 'saved',
    signedName: typeof row?.signedName === 'string' ? row.signedName : signedName,
    signedAt: typeof row?.signedAt === 'string' ? row.signedAt : null,
  };
}
