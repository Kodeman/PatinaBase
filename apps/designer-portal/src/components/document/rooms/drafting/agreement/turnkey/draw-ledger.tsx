"use client";

/**
 * The draw ledger, studio-side — P9 and P13's other half.
 *
 * These rows are MACHINE STATE. The draws themselves are authored in the
 * `draws` part and freeze at send; `send_commercial_document` materializes
 * this ledger from that frozen payload, and after that only
 * `issue_agreement_draw_invoice` writes to it. Nothing on this strip edits an
 * amount.
 *
 * The deposit is not issued from here. It is offered to the homeowner on her
 * own door the moment she signs (R15/P13) and it is minted by a separate,
 * independently failable call after the signature commits — a billing failure
 * can never roll a signature back. Every OTHER draw is the studio's act, and
 * this is where the studio performs it.
 *
 * Issuing draw two or later notifies the homeowner through
 * `commercial-document-notify` (`agreement_draw_ready`, I-7), keyed on the
 * ledger row. The deposit deliberately sends no email: it reaches her on the
 * door, in the same act, and a second notice would contradict the first.
 */

import { useState } from "react";
import { useIssueAgreementDrawInvoice } from "@patina/supabase";
import type { AgreementDraw } from "@patina/types";
import { Button } from "@/components/ui/controls";
import { useReplayCommercialNotification } from "@/hooks/use-commercial-documents";
import { documentEvents } from "@/lib/analytics/document-events";
import { turnkeyMoney } from "./money";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export const DEPOSIT_DRAW_KEY = "deposit";

/** What a row says about itself, in words. No badge, no colour-as-status. */
export function drawStanding(draw: AgreementDraw): string {
  if (draw.invoiceStatus === "paid") return "Paid";
  if (draw.invoiceId) return "Sent";
  return "Not yet billed";
}

export function DrawLedger({
  proposalId,
  draws,
  executed,
}: {
  proposalId: string;
  draws: AgreementDraw[];
  /** The studio has countersigned. Every draw but the deposit waits for it. */
  executed: boolean;
}) {
  const issue = useIssueAgreementDrawInvoice(proposalId);
  const notify = useReplayCommercialNotification();
  const [note, setNote] = useState<string | null>(null);

  if (draws.length === 0) {
    return (
      <section
        aria-label="Draws"
        className="border-t border-[var(--doc-ink-border)] pt-4"
      >
        <p className={LABEL}>Draws</p>
        <p className="mt-2 text-[11.5px] italic text-[var(--text-muted)]">
          The draw ledger opens when this agreement is sent.
        </p>
      </section>
    );
  }

  const bill = async (draw: AgreementDraw) => {
    setNote(null);
    try {
      const result = await issue.mutateAsync(draw.drawKey);
      setNote(`${draw.label} is billed — ${turnkeyMoney(result.netCents)}.`);
      documentEvents.agreementDrawIssued({
        proposal_id: proposalId,
        draw_key: draw.drawKey,
        is_retainage_release: draw.isRetainageRelease,
      });
      if (draw.drawKey !== DEPOSIT_DRAW_KEY) {
        // Independently failable, like the deposit's own mint: the invoice is
        // already issued and a notification that does not land must not read
        // as a billing failure.
        await notify.mutateAsync({
          documentId: proposalId,
          transition: "agreement_draw_ready",
          eventId: draw.id,
        });
      }
    } catch (error) {
      setNote(
        error instanceof Error
          ? error.message
          : "That draw could not be billed.",
      );
    }
  };

  return (
    <section
      aria-label="Draws"
      className="border-t border-[var(--doc-ink-border)] pt-4"
    >
      <p className={LABEL}>Draws</p>
      <ul className="mt-2 divide-y divide-[var(--doc-ink-border)] border-y border-[var(--doc-ink-border)]">
        {draws.map((draw) => {
          const billable =
            !draw.invoiceId &&
            (draw.drawKey === DEPOSIT_DRAW_KEY ? true : executed);
          return (
            <li key={draw.id} data-draw-key={draw.drawKey} className="py-2">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[12px] text-[var(--text-body)]">
                  {draw.label}
                </span>
                <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                  {turnkeyMoney(draw.netCents)}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-3">
                <span className={LABEL}>{drawStanding(draw)}</span>
                {draw.retainageCents > 0 && (
                  <span className="font-mono text-[11px] text-[var(--color-aged-oak)]">
                    {turnkeyMoney(draw.retainageCents)} held
                  </span>
                )}
                {billable && draw.drawKey !== DEPOSIT_DRAW_KEY && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={issue.isPending}
                    onClick={() => void bill(draw)}
                  >
                    Bill this draw
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {note && (
        <p
          role="status"
          className="mt-2 text-[11.5px] text-[var(--color-mocha)]"
        >
          {note}
        </p>
      )}
    </section>
  );
}
