"use client";

/**
 * Where one Trade Agreement stands, in words.
 *
 * No badge, no colour-as-status, no checkmark — the paper register the whole
 * Contract Room is written in. A state is a sentence about what has happened,
 * and "Signed" carries the date and the name because that is the fact that
 * matters, not the fact that a state column changed.
 */

import type { TradeAgreement, TradeAgreementState } from "@patina/types";
import { formatCalendarDate } from "@/lib/document/format";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export const STATE_LABELS: Record<TradeAgreementState, string> = {
  draft: "Draft",
  sent: "Sent",
  signed: "Signed",
  void: "Withdrawn",
};

export function TradeAgreementStatus({
  agreement,
}: {
  agreement: TradeAgreement;
}) {
  if (agreement.state === "signed" && agreement.subSignature) {
    return (
      <span data-trade-state="signed" className={LABEL}>
        Signed by {agreement.subSignature.signedName} ·{" "}
        {formatCalendarDate(agreement.subSignature.signedAt)}
      </span>
    );
  }
  if (agreement.state === "sent" && agreement.sentAt) {
    return (
      <span data-trade-state="sent" className={LABEL}>
        Sent {formatCalendarDate(agreement.sentAt)}
      </span>
    );
  }
  return (
    <span data-trade-state={agreement.state} className={LABEL}>
      {STATE_LABELS[agreement.state]}
    </span>
  );
}
