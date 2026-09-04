import type { CommercialDocumentKind } from '@patina/types';

/* ── THE LEGAL LINE ──────────────────────────────────────────────────────────
   The consent the client ticks, the label on the act, and the sentence that
   says what signing does — byte-copied from the shipped sign route
   (app/proposals/[id]/sign/page.tsx), which is the only place these strings
   are allowed to be authored.

   THIS FILE IS A COPY, NOT AN AUTHORSHIP. The Threshold hosts the signature
   inline because the project page IS the surface the sign route would have
   navigated to, so the route's copy has to travel with it. Nothing here may be
   reworded, shortened or "improved" for the door: the mock's own consent line
   ("I authorize these three pieces. Quist Interiors countersigns.") drops the
   deposit disclosure and asserts a countersignature that a furnishings
   authorization does not require, and it is UI truth for the drawing only.

   `__tests__/consent-copy.test.ts` reads the route's source off disk and
   asserts every string below still appears in it verbatim, so the two cannot
   drift apart silently. When the route's copy changes, that test fails and
   this file is updated from it — never the other way round. ─────────────── */

/**
 * The route branches on four shapes: furnishings, trade scope, the two
 * design-services kinds together, and an `else` that catches everything left
 * (`legacy`, and any kind added to the enum before the route learns it). The
 * branch order and the fallback are reproduced exactly.
 */
export function consentLineFor(kind: CommercialDocumentKind): string {
  if (kind === 'furnishings_authorization') {
    return 'I authorize the studio to procure only the named lines at the quantities and client prices shown. I understand any required deposit is a separate payment step.';
  }
  if (kind === 'trade_scope') {
    return 'I authorize this trade to begin the work described, at the price shown. I understand the deposit draw is due on signature and each remaining draw is billed as the work reaches that stage.';
  }
  if (kind === 'design_services' || kind === 'service_addendum') {
    return 'I agree to these design-services terms and understand my signature alone does not authorize work until the studio countersigns.';
  }
  return 'I agree to the scope and investment in this proposal.';
}

/** The word on the act itself. */
export function signLabelFor(kind: CommercialDocumentKind): string {
  if (kind === 'furnishings_authorization') return 'Sign authorization';
  if (kind === 'trade_scope') return 'Sign and authorize';
  return 'Sign and accept';
}

/**
 * What signing does, in one sentence. The route interpolates the instrument's
 * title into a curly-quoted span, so the copy is kept as the two literal
 * fragments the route itself carries and reassembled here — that keeps the
 * drift guard able to match on disk.
 */
export function summaryLineFor(kind: CommercialDocumentKind, title: string): string {
  if (kind === 'furnishings_authorization') {
    return `By signing, you authorize only the named furnishing lines, quantities, and client prices in “${title}”.`;
  }
  if (kind === 'trade_scope') {
    return `By signing, you authorize the scope of work, price, and draw schedule in “${title}”.`;
  }
  return `By signing, you accept the services, signed role rates, design authorization ceiling, retainer, and terms in “${title}”. The agreement becomes effective only after the studio countersigns.`;
}

/** The fragments the drift guard matches against the route's source. */
export const SUMMARY_FRAGMENTS: readonly string[] = [
  'By signing, you authorize only the named furnishing lines, quantities, and client prices in',
  'By signing, you authorize the scope of work, price, and draw schedule in',
  'By signing, you accept the services, signed role rates, design authorization ceiling, retainer, and terms in',
  '. The agreement becomes effective only after the studio countersigns.',
];

/** Every consent string, for the drift guard. */
export const CONSENT_LINES: readonly string[] = [
  consentLineFor('furnishings_authorization'),
  consentLineFor('trade_scope'),
  consentLineFor('design_services'),
  consentLineFor('legacy'),
];

/** Every act label, for the drift guard. */
export const SIGN_LABELS: readonly string[] = [
  signLabelFor('furnishings_authorization'),
  signLabelFor('trade_scope'),
  signLabelFor('design_services'),
];

/** The line under the name field — also the route's, verbatim. */
export const SIGNATURE_NOTICE = 'Your typed name acts as your electronic signature.';

/**
 * The portal's existing kind vocabulary, as `awaiting-signature-cards.tsx`,
 * `commercial-document-shell.tsx`, `proposals/page.tsx` and `the-making.tsx`
 * all spell it. The Making's copy is module-private, so this is a fifth — the
 * value is pinned by `consent-copy.test.ts` against the exported one.
 */
export const KIND_LABEL: Partial<Record<CommercialDocumentKind, string>> = {
  design_services: 'Design services agreement',
  furnishings_authorization: 'Furnishings authorization',
  service_addendum: 'Design services addendum',
  trade_scope: 'Trade scope',
};

/**
 * The signing API answers refusals with machine tokens
 * (app/api/proposals/[id]/sign/route.ts). The shipped route prints them raw,
 * but there they are unreachable — its preflight blocks the form for exactly
 * these states. On the door the act is always offered, so the tokens are the
 * primary path and have to be sentences.
 */
const REFUSALS: Record<string, string> = {
  not_signable: 'This paper is not open for signing any more. Your designer can send a fresh one.',
  proposal_expired: 'This paper has expired and can no longer be signed. Ask your designer to renew it.',
  legacy_signing_retired: 'Your designer will send a new agreement to move this forward.',
  not_found: 'This paper could not be found. It may have been withdrawn.',
  unauthorized: 'Your session has ended. Sign in again to sign this paper.',
  invalid_name: 'Type your full name to sign.',
};

/** A refusal the client can read. Anything unrecognized keeps its own words. */
export function refusalSentence(token: string | undefined | null): string {
  const trimmed = token?.trim();
  if (!trimmed) return 'This paper could not be signed just now.';
  return REFUSALS[trimmed] ?? trimmed;
}

/** Every refusal token the sign route can return, for the drift guard. */
export const REFUSAL_TOKENS: readonly string[] = Object.keys(REFUSALS);
