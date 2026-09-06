import { NextResponse } from "next/server";

import { payLinkRequestAllowed, resolveInvoiceLink } from "../invoice-link";

export const dynamic = "force-dynamic";

/**
 * The sheet's own re-read while a return from Checkout waits to be confirmed.
 *
 * Two things keep this from being the cheaper oracle it would otherwise be
 * (S2): it carries the SAME limiter as the page, and it re-resolves with
 * `p_record_view=false` so polling cannot inflate the link's view count.
 *
 * It returns the moving parts only — never the record, never the studio,
 * never the payload's own contract fields.
 */

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const { allowed } = await payLinkRequestAllowed(new Headers(request.headers));
  if (!allowed) {
    return NextResponse.json(
      { error: "invoice_not_found" },
      { status: 404, headers: PRIVATE_HEADERS },
    );
  }

  const resolved = await resolveInvoiceLink(token, { recordView: false });
  if (!resolved) {
    return NextResponse.json(
      { error: "invoice_not_found" },
      { status: 404, headers: PRIVATE_HEADERS },
    );
  }

  if (resolved.kind !== "invoice") {
    return NextResponse.json(
      { kind: resolved.kind },
      { headers: PRIVATE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      kind: resolved.kind,
      status: resolved.invoice.status,
      amount_paid_cents: resolved.invoice.amount_paid_cents,
      balance_cents: resolved.invoice.balance_cents,
      payments: resolved.payments,
      // I-7: `processing` is server-authoritative on the SSR payload, so it is
      // server-authoritative here too. Deriving it from `payments[]` on the
      // poll only (which G8 permits) would leave two definitions of one word,
      // and they would disagree the day the resolver counts `requires_refund`.
      processing: resolved.pay.processing,
    },
    { headers: PRIVATE_HEADERS },
  );
}
