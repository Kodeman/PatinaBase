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

interface NonceLookupRow {
  invoice_links: { token: string; status: string } | null;
}

/**
 * The attempt's active link token, or null.
 *
 * service_role reads both tables directly: `invoice_checkout_attempts` carries
 * the nonce, `invoice_links` carries the token, and the join is the whole
 * lookup. A revoked or closed link resolves to nothing, so a return that comes
 * back after a Regenerate dies rather than reopening a retired address.
 */
async function resolveReturnNonce(nonce: string): Promise<string | null> {
  try {
    // W1-TYPES: cast removed at integration — 00574 adds `invoice_links` and
    // the attempt's `return_nonce` / `invoice_link_id` columns, at which point
    // the generated Database types carry both the table and the relation.
    const admin = createServiceClient() as unknown as {
      from(table: string): {
        select(columns: string): {
          eq(
            column: string,
            value: string,
          ): {
            eq(
              column: string,
              value: string,
            ): {
              maybeSingle(): Promise<{
                data: NonceLookupRow | null;
                error: unknown;
              }>;
            };
          };
        };
      };
    };

    const { data, error } = await admin
      .from("invoice_checkout_attempts")
      .select("invoice_links!inner(token, status)")
      .eq("return_nonce", nonce)
      .eq("invoice_links.status", "active")
      .maybeSingle();

    if (error || !data) return null;
    const token = data.invoice_links?.token;
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

  if (!(await payLinkRequestAllowed(new Headers(request.headers))))
    return dead();
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
