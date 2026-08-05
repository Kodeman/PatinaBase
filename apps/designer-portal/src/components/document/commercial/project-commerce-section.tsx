"use client";

import { DerivedBudgetGrid } from "./derived-budget-grid";
import { AuthorizationsLedger } from "./authorizations-ledger";

export function ProjectCommerceSection({
  projectId,
  projectName,
  clientName,
}: {
  projectId: string;
  /**
   * Forwarded to AuthorizationsLedger → TradeScopeDetail's work order, which
   * prints it in its header. Optional and defaults to '' (TradeScopeDetail's
   * own default) rather than required, so a caller that has not resolved a
   * project title yet still renders the rest of this section.
   */
  projectName?: string;
  /**
   * Forwarded the same way, to the record-on-paper sheets both detail surfaces
   * open — so the FF&E and trade acts prefill the client's name the way the
   * design-services act does. Optional for the same reason as projectName.
   */
  clientName?: string;
}) {
  return (
    <section
      aria-label="Project commercial planning"
      className="mb-5 border border-[var(--doc-ink-border)] bg-[rgba(255,255,255,0.42)] px-4 py-4"
    >
      <DerivedBudgetGrid projectId={projectId} />
      <div className="my-5 border-t border-[var(--doc-ink-border)]" />
      <AuthorizationsLedger
        projectId={projectId}
        projectName={projectName}
        clientName={clientName}
      />
    </section>
  );
}
