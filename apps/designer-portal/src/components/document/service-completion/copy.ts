import type { ScopePartyKind } from '@patina/types';
import {
  isServiceAcceptanceInactive,
  serviceCompletionRefusal,
  STALE_SERVICE_COMPLETION_REFUSALS,
  type StudioServiceObligationItem,
} from '@patina/supabase';

/** C6 §2.7: a denied act while completion is off reads as a calm note (the
 *  same register as service acceptance's). */
export const INACTIVE_NOTE = "Studio service completion isn't switched on for this studio yet.";

/** The ticket's stale path: the server's reading moved under the studio. */
export const STALE_NOTE = 'Something changed — review the updated list.';

/** A recorded citation that could not be checked just now: recoverable, and
 *  never a sign that the resolution reopened. */
export const CITATION_UNCHECKED = "this reference couldn't be checked just now. The resolution stands.";

/** The financial hold, on its own line: it never holds the studio's service. */
export const HOLD_NOTE = 'Balance still open — this holds project closure, not service completion.';

/** Every C6 §2.3 blocker code, in the words the studio would use. */
const BLOCKER: Record<string, string> = {
  scope_edition_not_active: 'No agreed scope is in force for this job',
  agreed_phase_unbound: 'An agreed phase has no project phase to track it',
  agreed_phase_open: 'An agreed phase is not completed yet',
  studio_line_open: 'Pieces the studio buys are not installed yet',
  studio_installation_open: 'Installation the studio owes is not complete',
  studio_design_unbound: 'Design the studio owes has no agreed phase',
  studio_installation_unbound: 'Installation the studio owes has nothing recorded to install',
  ffe_unassigned_to_package: 'Pieces the studio buys are not in an agreed package',
  package_key_not_in_edition: 'Pieces or outside work sit in a package the agreed scope does not name',
  // K3 option B only; option A (ruled) lists open conditions instead.
  acceptance_condition_open: "A client's acceptance condition is still open",
  acceptance_not_accepted: "The client hasn't accepted the studio's services yet",
  client_decision_unresolved: 'Client decisions are still open',
  scope_change_unresolved: 'Scope changes are still open',
};

/** Informational items: visible, and never a reason the service is held. */
const INFORMATIONAL: Record<string, string> = {
  package_excluded: "Outside the studio's service",
  external_fulfilment_open: 'Outside work still in progress',
  trade_scope_open: 'Trade work not accepted yet',
  punch_item_open: 'Open install punch items',
};

/** The server raises this one blocker while scope editions are off; the
 *  reading prints INACTIVE_NOTE in its place. */
export const INACTIVE_BLOCKER = 'scope_editions_inactive';

export function obligationLabel(item: StudioServiceObligationItem): string {
  const words = BLOCKER[item.code] ?? INFORMATIONAL[item.code] ?? item.label;
  return item.count > 1 ? `${words} (${item.count})` : words;
}

export const PARTY: Record<ScopePartyKind, string> = {
  studio: 'the studio', client: 'the client', gc: 'the general contractor', other: 'another party', none: 'no one',
};

const REFUSAL: Record<string, string> = {
  insufficient_privilege:
    "Your seat on this job can't do this. The designer of record or a studio owner or admin can.",
  idempotency_key_reused: 'This was already recorded with different details. Read the list again.',
  service_acceptance_evidence_unbound: "That reference isn't available to cite.",
  service_acceptance_resolution_invalid: 'Say how the condition was resolved and choose one reference.',
  service_completion_revoke_invalid: 'Give a reason for revoking, up to 2,000 characters.',
};

/** Null when completion is not switched on (the caller shows INACTIVE_NOTE).
 *  A stale refusal reads STALE_NOTE; the act's hook has already refetched. */
export function refusalCopy(error: unknown): string | null {
  if (isServiceAcceptanceInactive(error)) return null;
  const token = serviceCompletionRefusal(error);
  if (token && STALE_SERVICE_COMPLETION_REFUSALS.has(token)) return STALE_NOTE;
  if (token && REFUSAL[token]) return REFUSAL[token];
  return 'That did not go through. Nothing was lost. Try again.';
}

export function shortDate(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
