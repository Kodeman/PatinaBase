"use client";

import { useProjectBillingAuthority } from "@/hooks/use-commercial-documents";
import type { ProjectBillingAuthority } from "@/lib/document/commercial-documents";
import { ProjectServicesAddendumAction } from "./project-services-addendum-action";

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);

export function ProjectAuthorityBandForProject({
  projectId,
  allowAddendum = false,
}: {
  projectId: string;
  allowAddendum?: boolean;
}) {
  const authority = useProjectBillingAuthority(projectId);
  if (authority.isLoading || authority.error || !authority.data) return null;
  return (
    <>
      <ProjectAuthorityBand authority={authority.data} />
      {allowAddendum && authority.data.state !== "superseded" && (
        <ProjectServicesAddendumAction projectId={projectId} />
      )}
    </>
  );
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
      aria-label="Design billing budget"
      className="mb-5 border-l-[3px] border-[var(--color-sage)] bg-[rgba(168,181,160,0.1)] px-4 py-3.5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          Budget · {authority.state.replace("_", " ")}
        </p>
        {authority.billingThrough && (
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
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
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] text-[var(--color-charcoal)] sm:grid-cols-4">
        <AuthorityFigure
          label="authorized"
          value={money(authority.authorizedCents, authority.currency)}
        />
        <AuthorityFigure
          label="accrued"
          value={money(authority.accruedCents, authority.currency)}
        />
        <AuthorityFigure
          label="pending"
          value={money(authority.pendingAuthorizationCents, authority.currency)}
        />
        <AuthorityFigure
          label="remaining"
          value={money(authority.remainingCents, authority.currency)}
        />
      </div>

      {authority.rates.length > 0 && (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          Agreement v{authority.activeRateVersion} ·{" "}
          {authority.rates
            .map(
              (rate) =>
                `${rate.roleName} ${money(rate.hourlyRateCents, authority.currency)}/hr`,
            )
            .join(" · ")}
        </p>
      )}

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

function AuthorityFigure({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="block font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </span>
      <strong>{value}</strong>
    </span>
  );
}
