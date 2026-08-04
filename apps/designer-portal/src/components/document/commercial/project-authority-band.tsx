"use client";

import { useProjectBillingAuthority } from "@/hooks/use-commercial-documents";
import type { ProjectBillingAuthority } from "@/lib/document/commercial-documents";

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);

export function ProjectAuthorityBandForProject({
  projectId,
}: {
  projectId: string;
}) {
  const authority = useProjectBillingAuthority(projectId);
  if (authority.isLoading || authority.error || !authority.data) return null;
  return <ProjectAuthorityBand authority={authority.data} />;
}

/** DTO-driven shell: Hours/Accounts can pass the canonical live summary later. */
export function ProjectAuthorityBand({
  authority,
}: {
  authority: ProjectBillingAuthority;
}) {
  const ceiling = Math.max(0, authority.ceilingCents);
  const percent =
    ceiling > 0
      ? Math.min(100, Math.round((authority.accruedCents / ceiling) * 100))
      : 0;
  const retainerPending = authority.state === "retainer_pending";

  return (
    <section
      aria-label="Design billing authority"
      className="mb-5 border-l-[3px] border-[var(--color-sage)] bg-[rgba(168,181,160,0.1)] px-4 py-3.5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          Design authority · {authority.state.replace("_", " ")}
        </p>
        {authority.billingThrough && (
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Billing through {authority.billingThrough}
          </span>
        )}
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-pearl)]">
        <div
          className="h-full rounded-full bg-[var(--color-sage)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-3 text-[11.5px] text-[var(--color-charcoal)]">
        <span>
          {money(authority.accruedCents, authority.currency)} accrued ·{" "}
          {money(authority.invoicedCents, authority.currency)} invoiced
        </span>
        <strong>
          {money(authority.remainingCents, authority.currency)} remains of{" "}
          {money(authority.ceilingCents, authority.currency)}
        </strong>
      </div>

      {(retainerPending || authority.pendingAuthorizationCents > 0) && (
        <p className="mt-2 border-t border-[var(--doc-ink-border)] pt-2 text-[11px] text-[var(--color-mocha)]">
          {retainerPending
            ? `${money(authority.retainerAmountCents - authority.retainerPaidCents, authority.currency)} of the retainer remains before billing authority becomes active.`
            : `${money(authority.pendingAuthorizationCents, authority.currency)} is awaiting additional written authorization.`}
        </p>
      )}
    </section>
  );
}
