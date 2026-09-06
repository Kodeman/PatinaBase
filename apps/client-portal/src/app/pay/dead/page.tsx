import type { Metadata } from "next";

import { DeadLink } from "../[token]/settling-sheet";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoice · Patina",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Where a return nonce that names nothing lands. The same sheet a dead token
 * gets, for the same reason: a guest who followed a stale Stripe return has no
 * more business learning why than a guesser does.
 */
export default function PayDeadPage() {
  return <DeadLink />;
}
