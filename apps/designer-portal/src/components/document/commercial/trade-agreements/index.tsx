"use client";

/**
 * The Trade Agreements strip — P14, studio-side.
 *
 * It sits in the turnkey composer's right rail rather than in the Money
 * room's `authorizations-ledger.tsx`, deliberately: that file belongs to
 * another wave and another lane, and mounting there would mean editing a file
 * this lane does not own. The strip is self-contained, so moving it later is
 * one import line.
 *
 * A Trade Agreement needs a project. An origin agreement has none until
 * countersign creates one, so the strip says that rather than showing an
 * empty list as if the studio had simply not engaged anybody.
 */

import { useState } from "react";
import { useTradeAgreements } from "@patina/supabase";
import { Button } from "@/components/ui/controls";
import { TradeAgreementComposer } from "./trade-agreement-composer";
import { TradeAgreementRow } from "./trade-agreement-row";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export const NO_PROJECT_YET =
  "Trade Agreements open once this agreement is executed and its project exists.";

export function TradeAgreementsStrip({
  projectId,
  studioId,
  sourceProposalId,
}: {
  projectId: string | null;
  studioId: string | null;
  sourceProposalId: string | null;
}) {
  const agreements = useTradeAgreements(projectId);
  const [composing, setComposing] = useState(false);

  return (
    <section
      aria-label="Trade Agreements"
      className="border-t border-[var(--doc-ink-border)] pt-4"
    >
      <p className={LABEL}>Trade Agreements</p>
      {projectId === null ? (
        <p className="mt-2 text-[11.5px] italic text-[var(--text-muted)]">
          {NO_PROJECT_YET}
        </p>
      ) : composing ? (
        <div className="mt-3">
          <TradeAgreementComposer
            projectId={projectId}
            studioId={studioId}
            sourceProposalId={sourceProposalId}
            onDone={() => setComposing(false)}
            onCancel={() => setComposing(false)}
          />
        </div>
      ) : (
        <>
          {(agreements.data ?? []).length === 0 ? (
            <p className="mt-2 text-[11.5px] italic text-[var(--text-muted)]">
              No trades engaged on this project yet.
            </p>
          ) : (
            <ul className="mt-2 border-t border-[var(--doc-ink-border)]">
              {(agreements.data ?? []).map((agreement) => (
                <TradeAgreementRow
                  key={agreement.id}
                  agreement={agreement}
                  projectId={projectId}
                />
              ))}
            </ul>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={() => setComposing(true)}
          >
            + New Trade Agreement
          </Button>
        </>
      )}
    </section>
  );
}

export { TradeAgreementComposer } from "./trade-agreement-composer";
export { TradeAgreementRow } from "./trade-agreement-row";
export { TradeAgreementStatus } from "./trade-agreement-status";
