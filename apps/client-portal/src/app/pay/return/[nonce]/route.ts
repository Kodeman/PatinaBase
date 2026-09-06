import { NextResponse } from "next/server";
import { createServiceClient } from "@patina/supabase/server";

import { payLinkRequestAllowed } from "../../[token]/invoice-link";

export const dynamic = "force-dynamic";

/* ── THE NONCE (S10) ─────────────────────────────────────────────────────────
   The token is a permanent bearer credential, and a Stripe Session's
   `success_url` is visible in the dashboard, in event payloads, in webhook
   logs and in any data export, indefinitely. So Stripe is handed a
   single-purpose nonce instead, and this route trades it back for the token
   at the moment the guest returns.

   Both rails come through here — the signed-in `create-checkout-session`
   invoice path too — so Stripe never sees a token at all.

   A nonce that names nothing lands on the same dead sheet a guessed token
   does. There is no "expired return" sentence: it would tell a guesser that
   the shape of the guess was right. ─────────────────────────────────────── */

const NONCE_PATTERN = /^[0-9a-f]{64}$/;

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

/**
 * Only these ride along to the sheet. Copying the incoming query wholesale
 * would let anything Stripe (or anyone) appended land on a bearer URL.
 */
const CARRIED_PARAMS = [
  "checkout",
  "session_id",
  "checkout_attempt_id",
  "payment_id",
] as const;

/**
 * The attempt's active link token, or null.
 *
 * §2.6's `resolve_invoice_return_nonce(p_nonce) RETURNS text` is called rather
 * than reading the two tables directly (S-1/I-2/I-3). Two reasons, and the
 * second is the load-bearing one:
 *
 *  - the "active link only" rule then lives in ONE place instead of two;
 *  - a hand-rolled PostgREST embed needs a structural cast asserting that
 *    `invoice_links` comes back as an OBJECT rather than an array. Nothing in
 *    the code, the generated types or a passing test proves that, the cast
 *    would keep compiling unchanged after W1 lands — silently suppressing the
 *    very shape error it hides — and if it were ever wrong, every return from
 *    Stripe on BOTH rails would 303 to `/pay/dead`.
 */
async function resolveReturnNonce(nonce: string): Promise<string | null> {
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.rpc(
      // W1-TYPES: cast removed at integration — W1 regenerates
      // database.types.ts with resolve_invoice_return_nonce; until then the
      // generated Database carries no such function name.
      "resolve_invoice_return_nonce" as never,
      { p_nonce: nonce } as never,
    );
    if (error) return null;
    const token = data as unknown;
    return typeof token === "string" && NONCE_PATTERN.test(token)
      ? token
      : null;
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ nonce: string }> },
) {
  const { nonce } = await params;

  const dead = () =>
    NextResponse.redirect(new URL("/pay/dead", request.url), {
      status: 303,
      headers: PRIVATE_HEADERS,
    });

  const { allowed } = await payLinkRequestAllowed(new Headers(request.headers));
  if (!allowed) return dead();
  if (!NONCE_PATTERN.test(nonce)) return dead();

  const token = await resolveReturnNonce(nonce);
  if (!token) return dead();

  const incoming = new URL(request.url).searchParams;
  const target = new URL(`/pay/${token}`, request.url);
  for (const key of CARRIED_PARAMS) {
    const value = incoming.get(key);
    if (value) target.searchParams.set(key, value);
  }

  return NextResponse.redirect(target, {
    status: 303,
    headers: PRIVATE_HEADERS,
  });
}
