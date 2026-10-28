import {
  isServiceAcceptanceInactive,
  serviceAcceptanceRefusal,
  type ServiceAcceptanceAnswer,
  type ServiceAcceptanceLifecycle,
  type ServiceAcceptanceMethod,
  type ServiceAcceptanceOutcome,
} from '@patina/supabase';

/** C4 §2.8: a denied act while acceptance is off reads as a calm note. */
export const INACTIVE_NOTE = "Service acceptance isn't switched on for this studio yet.";

// K5: a click-through is an authenticated acceptance, never a signature.
const ANSWER: Record<ServiceAcceptanceAnswer, string> = {
  accept: 'Accepted',
  accept_with_conditions: 'Accepted with conditions',
  return: 'Returned',
};
const METHOD: Record<ServiceAcceptanceMethod, string> = {
  portal_authenticated: 'online',
  ios_authenticated: 'on iOS',
  paper_intake: 'on paper, reviewed',
};

/** "Accepted online", "Accepted on iOS", "Accepted on paper, reviewed". */
export function responseLabel(answer: ServiceAcceptanceAnswer, method: ServiceAcceptanceMethod): string {
  return `${ANSWER[answer]} ${METHOD[method]}`;
}

export function answerLabel(answer: ServiceAcceptanceAnswer): string {
  return ANSWER[answer];
}

export const LIFECYCLE: Record<ServiceAcceptanceLifecycle, string> = {
  draft: 'Drafted, not sent',
  sent: 'Sent to the client',
  withdrawn: 'Withdrawn',
  superseded: 'Replaced',
  closed: 'Closed',
};

export const OUTCOME: Record<ServiceAcceptanceOutcome, string> = {
  pending: 'Waiting on responses',
  accepted: 'Accepted',
  accepted_with_conditions: 'Accepted with conditions',
  returned: 'Returned',
};

export const SUPERSEDED: Record<string, string> = {
  scope_edition_superseded: 'the agreed scope changed',
  scope_edition_stale: 'the agreed scope went out of date',
  successor_request: 'a newer request took its place',
};

const REFUSAL: Record<string, string> = {
  signer_policy_missing:
    'The agreed scope names no one to accept the services. Name the signers on the agreement, then try again.',
  signer_policy_no_required_signer:
    'The agreed scope names no required signer. At least one person must be required to accept.',
  signer_policy_duplicate: 'The same person is named twice. Each signer must be a different person.',
  signer_policy_unbound:
    "A named person is no longer the client or in the client's household. Update the signers, then try again.",
  evidence_manifest_invalid: "That evidence set isn't this job's service acceptance evidence. Choose another.",
  scope_edition_not_active: 'The agreed scope changed. Prepare the request against the current edition.',
  service_acceptance_recipient_missing: 'This job has no client account to send the request to.',
  stale_scope: 'The agreed scope changed since this opened. Read the request again.',
  stale_signer_policy: 'The signers changed since this opened. Read the request again.',
  request_not_open: 'This request is no longer open, so it cannot change.',
  signer_not_active: 'That signer has been replaced on this request.',
  already_responded: 'That signer has already responded.',
  paper_document_unstamped: 'The paper is not stamped yet, so it cannot be confirmed.',
  paper_document_changed: 'The stored paper changed after it was recorded. Reject it and record it again.',
  service_acceptance_paper_invalid: 'The paper could not be matched to this request. Upload it again.',
  service_acceptance_response_invalid:
    'Check the answer: conditions go with "accepted with conditions", and a return needs a reason.',
  service_acceptance_replacement_invalid: 'Choose the new person and give a reason for the change.',
  service_acceptance_withdraw_invalid: 'Give a reason for withdrawing.',
  service_acceptance_review_invalid: 'This paper cannot be reviewed by you. Another owner or admin must review it.',
  insufficient_privilege: 'Your seat on this job cannot do this. Reviewing paper needs a studio owner or admin.',
  idempotency_key_reused: 'This was already recorded with different details. Read the request again.',
};

/** Null when acceptance is not switched on (the caller shows INACTIVE_NOTE). */
export function refusalCopy(error: unknown): string | null {
  if (isServiceAcceptanceInactive(error)) return null;
  const token = serviceAcceptanceRefusal(error);
  if (token && REFUSAL[token]) return REFUSAL[token];
  if (error instanceof Error && error.message.startsWith('Choose a PDF')) return error.message;
  return 'That did not go through. Nothing was lost. Try again.';
}

export function slotLabel(slot: string): string {
  const words = slot.replace(/[_-]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Signer';
}

export function shortDate(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
