import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoice · Patina",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Where a SPENT return nonce lands (R-BT).
 *
 * The Stripe return address works once: resolving it re-addresses the invoice
 * link and hands the fresh address to the browser that came back from
 * Checkout. A second GET of the same address — the back button, a refresh, a
 * prefetch, a scanner in the payer's mail client — used to rotate the link a
 * second time and kill the address the first return had just handed her.
 * It now rotates nothing, and lands here.
 *
 * This is deliberately NOT the dead sheet. `DeadLink` withholds because the
 * holder of a guessed token must learn nothing; whoever reaches this page has
 * already come back from a real Checkout once, so the page tells her plainly
 * what happened and where her invoice is.
 */
export default function PayReturnUsedPage() {
  return (
    <div className="flex justify-center px-5 pb-[120px] pt-10">
      <section
        className="w-full max-w-[560px] border border-[var(--border-subtle)] px-8 py-14 text-center"
        aria-labelledby="pay-used-head"
        data-testid="pay-return-used"
      >
        <h1 id="pay-used-head" className="sr-only">
          You have already come back from this payment
        </h1>
        <p className="text-[17px] leading-[1.7] text-[var(--text-body)]">
          You have already come back from this payment, and this return address
          only works once. Your invoice is at the address the studio sent you.
        </p>
      </section>
    </div>
  );
}
