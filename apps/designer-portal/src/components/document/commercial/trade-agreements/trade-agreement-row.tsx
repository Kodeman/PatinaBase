"use client";

/**
 * One Trade Agreement, as the studio reads it.
 *
 * The price on this row is the SUB's price. It is studio-side and it stays
 * studio-side: the homeowner reads identities always and awarded prices only
 * under open-book (R13), and the sub reads their own price and nothing else.
 */

import { useState } from "react";
import { useSendTradeAgreement, useVoidTradeAgreement } from "@patina/supabase";
import type { TradeAgreement } from "@patina/types";
import { Button } from "@/components/ui/controls";
import { turnkeyMoney } from "../../rooms/drafting/agreement/turnkey/money";
import { TradeAgreementStatus } from "./trade-agreement-status";

export function TradeAgreementRow({
  agreement,
  projectId,
}: {
  agreement: TradeAgreement;
  projectId: string;
}) {
  const send = useSendTradeAgreement(projectId);
  const voidIt = useVoidTradeAgreement(projectId);
  const [note, setNote] = useState<string | null>(null);
  const [confirmingVoid, setConfirmingVoid] = useState(false);

  const act = async (run: () => Promise<unknown>, fallback: string) => {
    setNote(null);
    try {
      await run();
    } catch (error) {
      setNote(error instanceof Error ? error.message : fallback);
    }
  };

  return (
    <li
      data-trade-agreement-id={agreement.id}
      className="border-b border-[var(--doc-ink-border)] py-2"
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[12.5px] text-[var(--color-charcoal)]">
          {agreement.contactCompanyName ?? agreement.contactDisplayName}
        </span>
        <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
          {turnkeyMoney(agreement.priceCents, agreement.currency)}
        </span>
      </div>
      <p className="text-[11.5px] text-[var(--color-mocha)]">
        {agreement.title}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <TradeAgreementStatus agreement={agreement} />
        {agreement.state === "draft" && (
          <Button
            variant="ghost"
            size="sm"
            loading={send.isPending}
            onClick={() =>
              void act(
                () => send.mutateAsync(agreement.id),
                "That Trade Agreement could not be sent.",
              )
            }
          >
            Send to the trade
          </Button>
        )}
        {agreement.state === "sent" && (
          <Button
            variant="ghost"
            size="sm"
            loading={send.isPending}
            onClick={() =>
              void act(
                () => send.mutateAsync(agreement.id),
                "That Trade Agreement could not be sent again.",
              )
            }
          >
            Send the link again
          </Button>
        )}
        {(agreement.state === "draft" || agreement.state === "sent") &&
          (confirmingVoid ? (
            <Button
              variant="ghost"
              size="sm"
              loading={voidIt.isPending}
              onClick={() =>
                void act(async () => {
                  await voidIt.mutateAsync({
                    agreementId: agreement.id,
                    reason: "Withdrawn by the studio",
                  });
                  setConfirmingVoid(false);
                }, "That Trade Agreement could not be withdrawn.")
              }
            >
              Withdraw it — the link stops working
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingVoid(true)}
            >
              Withdraw
            </Button>
          ))}
      </div>
      {note && (
        <p
          role="alert"
          className="mt-1 text-[11.5px] text-[var(--color-mocha)]"
        >
          {note}
        </p>
      )}
    </li>
  );
}
