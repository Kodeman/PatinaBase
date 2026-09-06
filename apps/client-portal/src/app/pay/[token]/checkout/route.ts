import { NextResponse } from "next/server";

import {
  INVOICE_LINK_TOKEN_PATTERN,
  payLinkRequestAllowed,
} from "../invoice-link";

export const dynamic = "force-dynamic";

/**
 * The one guest endpoint, reached only through this same-origin route.
 *
 * The browser never calls `invoice-link-checkout` itself: the function's CORS
 * is not a wildcard, and this hop is what keeps the anon key and the origin
 * check on the server side of the wall. Errors are returned VERBATIM with the
 * function's own status — the function is the authority on why a checkout was
 * refused, and re-wording it here would drift from the SQL that raised it.
 *
 * J29 — the method check below is a SHAPE check, not an entitlement check: it
 * rejects a word that is not one of the three rails, and deliberately does not
 * intersect against this invoice's `pay.rails`. Doing so would mean resolving
 * the link here on every POST — a second DB round trip, and a cheaper oracle
 * than the sheet, which is exactly what the limiter above exists to prevent.
 * `invoice-link-checkout` holds the authority and refuses a closed rail with
 * its own error, which this route relays verbatim.
 */

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

const PAYMENT_METHODS = new Set(["card", "us_bank_account", "check"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Over-limit and malformed answer alike, and say nothing more than the page
  // would: this route must not be a cheaper oracle than the sheet it serves.
  const { allowed } = await payLinkRequestAllowed(new Headers(request.headers));
  if (!allowed) {
    return NextResponse.json(
      { error: "invoice_not_found" },
      { status: 404, headers: PRIVATE_HEADERS },
    );
  }
  if (!INVOICE_LINK_TOKEN_PATTERN.test(token)) {
    return NextResponse.json(
      { error: "invoice_not_found" },
      { status: 404, headers: PRIVATE_HEADERS },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    method?: unknown;
  } | null;
  const method = typeof body?.method === "string" ? body.method : "";
  if (!PAYMENT_METHODS.has(method)) {
    return NextResponse.json(
      { error: "bad_payment_method" },
      { status: 400, headers: PRIVATE_HEADERS },
    );
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { error: "stripe_error" },
      { status: 502, headers: PRIVATE_HEADERS },
    );
  }

  // NO `Origin` header, deliberately (S-4). §4.1 designed this server-side hop
  // as the Origin-ABSENT branch — the function 403s any Origin that is not
  // byte-equal to its `CLIENT_PORTAL_URL` secret, so sending one would make
  // every guest checkout depend on `NEXT_PUBLIC_APP_URL` matching that secret
  // in all three environments. A trailing slash or an unset staging secret
  // would turn the whole till into "Unable to open the payment page just now."
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/invoice-link-checkout`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ token, method }),
      },
    );
    const payload = (await response.json().catch(() => null)) as unknown;
    return NextResponse.json(payload ?? { error: "stripe_error" }, {
      status: response.status,
      headers: PRIVATE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      { error: "stripe_error" },
      { status: 502, headers: PRIVATE_HEADERS },
    );
  }
}
