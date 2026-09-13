import type { ProjectBillingAuthority } from "./commercial-documents";

// The billing-state primitives live beside the write hooks in @patina/supabase
// (one definition); this module re-exports them so its document-side callers
// keep their import.
export {
  isInvoiceEligibleTimeEntry,
  type TimeBillingState,
  type InvoiceEligibleTimeEntry,
} from "@patina/supabase";
import type {
  TimeBillingState,
  TimeRateRole,
  TimeRateSource,
} from "@patina/supabase";

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

export type BillableIntentReason = ReturnType<
  typeof automaticTimeBillingIntent
>["reason"];

const BILLABLE_INTENT_SENTENCE: Record<BillableIntentReason, string> = {
  active: "billable · agreement active",
  no_authority: "non-billable · no agreement",
  retainer_pending: "non-billable · retainer unpaid",
  inactive: "non-billable · agreement not active",
};

/**
 * HT-12 — the resolved billable answer as a SENTENCE, so the pill at every
 * capture surface says why and not only which way it points. "Non-bill" with no
 * reason was the whole complaint: a legitimately non-billable hour and an hour
 * on a project with no signed authority looked identical.
 */
export function billableIntentSentence(
  reason: BillableIntentReason,
): string {
  return BILLABLE_INTENT_SENTENCE[reason];
}

interface BillingStateEntry {
  billable?: boolean | null;
  invoice_id?: string | null;
  billing_state?: TimeBillingState | null;
}

interface RateEntry {
  authority_rate_id?: string | null;
  hourly_rate_cents?: number | null;
  /** 00600 — which leg of the resolver priced the hour. */
  rate_source?: TimeRateSource | null;
  /** 00600 (HT-41) — the roster role the member picked. */
  rate_role?: TimeRateRole | null;
  billable?: boolean | null;
  billing_state?: TimeBillingState | null;
}

/**
 * What an hour is worth, and where that answer came from. Discriminated because
 * a blank used to answer three different questions at once (HT-26): a
 * legitimately non-billable hour, an hour the resolver could not price, and a
 * legacy row whose provenance nobody recorded. Every arm carries a label, so
 * the ledger never prints an empty cell.
 */
export type TimeRateProvenance =
  | {
      kind: "rated";
      label: string;
      hourlyRateCents: number;
      version: number | null;
      rateSource: TimeRateSource | null;
      rateRole: TimeRateRole | null;
    }
  | { kind: "nonbillable"; label: string; rateRole: TimeRateRole | null }
  /** rate_source = 'none': the resolver found no card. HT-26's "rate pending". */
  | { kind: "pending"; label: string; rateRole: TimeRateRole | null }
  /** Written before 00600 — unknown provenance, which is not the same as none. */
  | { kind: "unrecorded"; label: string; rateRole: TimeRateRole | null };

const RATE_SOURCE_LABEL: Record<TimeRateSource, string> = {
  authority: "Agreement rate",
  studio_member: "Studio rate",
  profile_default: "Profile rate",
  none: "rate pending",
};

const RATE_ROLE_LABEL: Record<TimeRateRole, string> = {
  lead_designer: "lead designer",
  support_designer: "support designer",
  bookkeeper: "bookkeeper",
  vendor: "vendor",
};

/** HT-41 — the role the member picked, as a person would say it. */
export function timeRateRoleLabel(
  role: TimeRateRole | null | undefined,
): string | null {
  return role ? RATE_ROLE_LABEL[role] : null;
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

/** Studio-only display provenance. IDs stay at the matching boundary. */
export function timeRateProvenance(
  entry: RateEntry,
  authority: ProjectBillingAuthority | null | undefined,
): TimeRateProvenance {
  const rateRole = entry.rate_role ?? null;
  const rate = authority?.rates.find(
    (candidate) => candidate.id === entry.authority_rate_id,
  );
  const hourlyRateCents =
    entry.hourly_rate_cents ?? rate?.hourlyRateCents ?? null;

  if (entry.billable === false || entry.billing_state === "nonbillable") {
    return { kind: "nonbillable", label: "not billable", rateRole };
  }
  if (hourlyRateCents != null && hourlyRateCents > 0) {
    return {
      kind: "rated",
      label:
        rate?.roleName ||
        (entry.rate_source
          ? RATE_SOURCE_LABEL[entry.rate_source]
          : entry.authority_rate_id
            ? "Agreement rate"
            : "Legacy rate"),
      hourlyRateCents,
      version: rate?.version ?? null,
      rateSource: entry.rate_source ?? null,
      rateRole,
    };
  }
  if (entry.rate_source === "none") {
    return { kind: "pending", label: "rate pending", rateRole };
  }
  return { kind: "unrecorded", label: "rate not recorded", rateRole };
}
