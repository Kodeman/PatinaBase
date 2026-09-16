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
   the shape of the guess was right.

   ONLY A SUCCESS COMES HERE, AND ONLY ONCE (R-BT). Stripe's cancel_url is the
   /pay/<token> the payer opened, so pressing Back at Checkout never touches
   this route. And the nonce is spent by its first resolution: a replay — the
   back button, a prefetch, a mail-client link scanner — answers `spent`,
   rotates nothing, and lands on /pay/used, which says so in a sentence. It is
   the one return state that is NOT the dead sheet: the holder has proved she
   came back from Checkout once already, so there is nothing left to conceal
   from her, and the address she is already on must survive her refresh. */

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
 * What the return nonce is worth now.
 *
 * §2.6's `resolve_invoice_return_nonce(p_nonce)` is called rather than reading
 * the two tables directly (S-1/I-2/I-3). Two reasons, and the second is the
 * load-bearing one:
 *
 *  - the "active link only" rule then lives in ONE place instead of two;
 *  - a hand-rolled PostgREST embed needs a structural cast asserting that
 *    `invoice_links` comes back as an OBJECT rather than an array. Nothing in
 *    the code, the generated types or a passing test proves that, the cast
 *    would keep compiling unchanged after W1 lands — silently suppressing the
 *    very shape error it hides — and if it were ever wrong, every return from
 *    Stripe on BOTH rails would 303 to `/pay/dead`.
 *
 * Since 00636 the RPC answers jsonb, because the three outcomes are not one
 * value: `{state:'rotated',token}` on the first resolution, `{state:'spent'}`
 * on any replay, and NULL for a malformed, unknown or revoked nonce.
 */
type ReturnNonceOutcome =
  | { kind: "rotated"; token: string }
  | { kind: "spent" }
  | { kind: "dead" };

async function resolveReturnNonce(nonce: string): Promise<ReturnNonceOutcome> {
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.rpc(
      "resolve_invoice_return_nonce",
      { p_nonce: nonce },
    );
    if (error || !data || typeof data !== "object") return { kind: "dead" };
    const answer = data as { state?: unknown; token?: unknown };
    if (answer.state === "spent") return { kind: "spent" };
    return answer.state === "rotated" &&
      typeof answer.token === "string" &&
      NONCE_PATTERN.test(answer.token)
      ? { kind: "rotated", token: answer.token }
      : { kind: "dead" };
  } catch {
    return { kind: "dead" };
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

  const outcome = await resolveReturnNonce(nonce);
  if (outcome.kind === "dead") return dead();
  if (outcome.kind === "spent") {
    // Nothing rotated, nothing died: the address this nonce already minted is
    // still live, and the page says what happened rather than showing the
    // dead sheet to someone who simply pressed Back (R-BT).
    return NextResponse.redirect(new URL("/pay/used", request.url), {
      status: 303,
      headers: PRIVATE_HEADERS,
    });
  }

  const incoming = new URL(request.url).searchParams;
  const target = new URL(`/pay/${outcome.token}`, request.url);
  for (const key of CARRIED_PARAMS) {
    const value = incoming.get(key);
    if (value) target.searchParams.set(key, value);
  }

  return NextResponse.redirect(target, {
    status: 303,
    headers: PRIVATE_HEADERS,
  });
}
