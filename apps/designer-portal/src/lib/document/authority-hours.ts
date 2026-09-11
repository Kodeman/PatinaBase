import type { ProjectBillingAuthority } from "./commercial-documents";

// The billing-state primitives live beside the write hooks in @patina/supabase
// (one definition); this module re-exports them so its document-side callers
// keep their import.
export {
  isInvoiceEligibleTimeEntry,
  type TimeBillingState,
  type InvoiceEligibleTimeEntry,
} from "@patina/supabase";
import type { TimeBillingState } from "@patina/supabase";

/**
 * Automatic document time is billable only after the server says an executed
 * authority is active. The database still owns the final classification; this
 * is only the fail-closed billable intent sent when opening a running timer.
 */
export function automaticTimeBillingIntent(
  authority: ProjectBillingAuthority | null | undefined,
): {
  billable: boolean;
  reason: "active" | "no_authority" | "retainer_pending" | "inactive";
} {
  if (!authority) return { billable: false, reason: "no_authority" };
  if (authority.state !== "active") {
    return {
      billable: false,
      reason:
        authority.state === "retainer_pending"
          ? "retainer_pending"
          : "inactive",
    };
  }
  if (
    authority.retainerActivationPolicy === "retainer_paid" &&
    authority.retainerPaidCents < authority.retainerAmountCents
  ) {
    return { billable: false, reason: "retainer_pending" };
  }
  return { billable: true, reason: "active" };
}

interface BillingStateEntry {
  billable?: boolean | null;
  invoice_id?: string | null;
  billing_state?: TimeBillingState | null;
}

export function timeBillingStateLabel(entry: BillingStateEntry): string {
  if (entry.invoice_id) return "Billed";
  if (entry.billable !== true || entry.billing_state === "nonbillable") {
    return "Non-bill";
  }
  if (entry.billing_state === "pending_authorization") return "Pending auth";
  if (entry.billing_state === "authorized") return "Authorized";
  return "Unbilled";
}

interface RateEntry {
  authority_rate_id?: string | null;
  hourly_rate_cents?: number | null;
}

/** Studio-only display provenance. IDs stay at the matching boundary. */
export function timeRateProvenance(
  entry: RateEntry,
  authority: ProjectBillingAuthority | null | undefined,
): { role: string; hourlyRateCents: number; version: number | null } | null {
  const rate = authority?.rates.find(
    (candidate) => candidate.id === entry.authority_rate_id,
  );
  const hourlyRateCents =
    entry.hourly_rate_cents ?? rate?.hourlyRateCents ?? null;
  if (hourlyRateCents == null || hourlyRateCents <= 0) return null;
  return {
    role:
      rate?.roleName ||
      (entry.authority_rate_id ? "Agreement rate" : "Legacy rate"),
    hourlyRateCents,
    version: rate?.version ?? null,
  };
}
