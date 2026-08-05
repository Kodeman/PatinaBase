"use client";

import { DerivedBudgetGrid } from "./derived-budget-grid";
import { AuthorizationsLedger } from "./authorizations-ledger";

export function ProjectCommerceSection({ projectId }: { projectId: string }) {
  return (
    <section
      aria-label="Project commercial planning"
      className="mb-5 border border-[var(--doc-ink-border)] bg-[rgba(255,255,255,0.42)] px-4 py-4"
    >
      <DerivedBudgetGrid projectId={projectId} />
      <div className="my-5 border-t border-[var(--doc-ink-border)]" />
      <AuthorizationsLedger projectId={projectId} />
    </section>
  );
}
