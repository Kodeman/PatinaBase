import type { Metadata } from "next";
import { headers } from "next/headers";

import {
  INVOICE_LINK_TOKEN_PATTERN,
  payLinkRequestAllowed,
  resolveInvoiceLink,
} from "./invoice-link";
import { InvoiceSheet } from "./invoice-sheet";
import { PayLinkBeacon } from "./pay-link-beacon";
import { DeadLink, SettlingSheet, WithdrawnSheet } from "./settling-sheet";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoice · Patina",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * `/pay/<token>` — the standing invoice.
 *
 * The 64-hex token IS the credential (256 bits; entropy is the boundary and
 * the limiter is friction, not the other way around). The regex gate runs
 * before any round trip, the limiter before any resolve, and every failure —
 * malformed, unknown, revoked, over-limit, draft, void — renders the same dead
 * sheet, so nothing here is an oracle.
 */
export default async function PayLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!INVOICE_LINK_TOKEN_PATTERN.test(token)) {
    return (
      <>
        <DeadLink />
        <PayLinkBeacon sheet="dead" />
      </>
    );
  }

  const requestHeaders = await headers();
  const { allowed, limiterMissing } =
    await payLinkRequestAllowed(requestHeaders);
  if (!allowed) {
    return (
      <>
        <DeadLink />
        <PayLinkBeacon sheet="dead" limiterMissing={limiterMissing} />
      </>
    );
  }

  const resolved = await resolveInvoiceLink(token);
  if (!resolved) {
    return (
      <>
        <DeadLink />
        <PayLinkBeacon sheet="dead" limiterMissing={limiterMissing} />
      </>
    );
  }
  if (resolved.kind === "settling") {
    return (
      <>
        <SettlingSheet payload={resolved} />
        <PayLinkBeacon sheet="settling" limiterMissing={limiterMissing} />
      </>
    );
  }
  if (resolved.kind === "withdrawn") {
    return (
      <>
        <WithdrawnSheet payload={resolved} />
        <PayLinkBeacon limiterMissing={limiterMissing} />
      </>
    );
  }

  return (
    <>
      <InvoiceSheet token={token} payload={resolved} />
      <PayLinkBeacon limiterMissing={limiterMissing} />
    </>
  );
}
