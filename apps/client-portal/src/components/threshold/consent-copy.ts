import type { CommercialDocumentKind } from '@patina/types';

/* ── THE LEGAL LINE ──────────────────────────────────────────────────────────
   The consent the client ticks, the label on the act, and the sentence that
   says what signing does — byte-copied from the sign route
   (app/proposals/[id]/sign/page.tsx) it was written for, and now the only
   place these strings live: that route retired with the old portal, and the
   door signs in place.

   Nothing here may be reworded, shortened or "improved" for the door: the
   mock's own consent line ("I authorize these three pieces. Quist Interiors
   countersigns.") drops the deposit disclosure and asserts a countersignature
   that a furnishings authorization does not require, and it is UI truth for
   the drawing only.

   `__tests__/consent-copy.test.ts` pins every branch and every refusal
   sentence, and still reads the surviving signing API off disk so the tokens
   the door reads cannot drift from the ones it answers with. ────────────── */

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

/** The line under the name field — the retired route's, verbatim. */
export const SIGNATURE_NOTICE = 'Your typed name acts as your electronic signature.';

/**
 * The portal's kind vocabulary, as `commercial-document-shell.tsx` spells it.
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
  sign_failed: 'This paper could not be signed just now. Your designer can help from their side.',
};

/**
 * A refusal the client can read.
 *
 * `W1-02`: an unrecognized token is spoken in the house's own words, never
 * echoed. This used to return whatever it was handed, and the route used to
 * hand it `executeError.message` — so the door printed the database's sentence
 * to a homeowner mid-signature, UUID and "access denied" and all. Both halves
 * are closed: the route answers in tokens, and an unmapped one falls back here
 * rather than being read aloud.
 */
export function refusalSentence(token: string | undefined | null): string {
  const trimmed = token?.trim();
  if (!trimmed) return 'This paper could not be signed just now.';
  return REFUSALS[trimmed] ?? 'This paper could not be signed just now.';
}

/** Every refusal token the sign route can return, for the drift guard. */
export const REFUSAL_TOKENS: readonly string[] = Object.keys(REFUSALS);

/* ── THE COMPOSED CONSENT (Wave 2, P6) ───────────────────────────────────────
   An agreement composed from parts is not the seven fixed facets any more, so
   the line she ticks names what is actually on the paper. The composer below
   and `public.compose_agreement_consent(uuid)` are the SAME function written
   twice, in two languages, and they must not drift: `__tests__/consent-copy
   .test.ts` pins these outputs and `supabase/tests/commercial/agreement_fee_
   schedules_test.sql` pins the SQL side against the same literals.

   Two rules hold that parity:
   · Fragments are emitted in a CANONICAL VARIANT ORDER, never in the
     designer's part order. Two implementations iterating a caller-supplied
     order cannot be compared.
   · Zero fragments returns `consentLineFor(kind)` byte-for-byte, so the
     flag-off path, the legacy path and a parts-less agreement all read the
     sentence the door has always shown.

   R9 — only the six authority variants and `procurement`'s deposit consent to
   anything in Wave 2. Every other schedule variant is record-only and
   contributes nothing. R5 — no figure is ever interpolated into the sentence;
   it names the term, the paper carries the number. ────────────────────────── */

/**
 * One part, as the consent composer reads it. `kind` and `variant` stay plain
 * strings for the same reason the bundle's DTO keeps them plain: the
 * vocabulary is code-resident and un-CHECKed, so a variant a later wave adds
 * must arrive intact and contribute nothing rather than throw.
 */
export interface ConsentPart {
  kind: string;
  variant: string | null;
  clientVisible: boolean;
  payload: Record<string, unknown>;
}

/**
 * The order the fragments are said in, whatever order the parts arrive in.
 * `cadence` is deliberately absent: it is a billing mechanic, not an
 * authorization, and today's `summaryLineFor` already omits it.
 */
const CONSENT_VARIANT_ORDER: readonly string[] = [
  'rate_card',
  'ceiling',
  'flat',
  'per_phase',
  'retainer',
  'procurement',
];

function consentCents(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function consentRows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * The fragment one money part consents to, or null when the part carries
 * nothing to consent to. An unset ceiling, a zero retainer and a zero deposit
 * are all figures nobody wrote (R21) — the sentence does not name them.
 */
function consentFragment(part: ConsentPart): string | null {
  switch (part.variant) {
    case 'rate_card':
      return consentRows(part.payload.roles).length > 0 ? 'the signed role rates' : null;
    case 'ceiling': {
      const cents = consentCents(part.payload.cents);
      return cents !== null && cents > 0 ? 'the design authorization ceiling' : null;
    }
    case 'flat':
      return 'the flat design fee';
    case 'per_phase':
      return consentRows(part.payload.phases).length > 0
        ? 'the per-phase fee schedule'
        : null;
    case 'retainer': {
      const cents = consentCents(part.payload.cents);
      if (cents === null || cents <= 0) return null;
      // `retainer_credit_rule` defaults to 'credited' in the database, so an
      // absent or unknown rule reads as the default rather than as silence.
      if (part.payload.creditRule === 'non_refundable') {
        return 'the retainer, which is not refundable';
      }
      if (part.payload.creditRule === 'replenishing') return 'the replenishing retainer';
      return 'the retainer credited against fees';
    }
    case 'procurement': {
      const percent = consentCents(part.payload.depositPercent);
      return percent !== null && percent > 0 ? 'the furnishings deposit' : null;
    }
    default:
      // The eight record-only variants (R9), and any variant a later wave
      // adds to an agreement this build has already shipped.
      return null;
  }
}

/** A, "A and B", "A, B, and C" — the door's own list grammar. */
function oxford(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * The composed consent. Zero money parts — or no parts at all — returns
 * `consentLineFor(kind)` verbatim, so the flag-off and legacy paths are
 * byte-identical to what the door has always shown.
 */
export function composeConsentLine(
  kind: CommercialDocumentKind,
  parts: readonly ConsentPart[] | null | undefined,
): string {
  // Wave 2 composes for the two services kinds only. A furnishings
  // authorization or a trade scope keeps its own consent, whatever parts a
  // later wave hangs on it.
  if (kind !== 'design_services' && kind !== 'service_addendum') {
    return consentLineFor(kind);
  }

  const money = (parts ?? []).filter(
    (part) => part.kind === 'schedule' && part.clientVisible === true,
  );

  const fragments: string[] = [];
  for (const variant of CONSENT_VARIANT_ORDER) {
    // One part per money variant (R18). A set that carries two anyway says
    // the fragment once rather than twice.
    const part = money.find((candidate) => candidate.variant === variant);
    if (!part) continue;
    const fragment = consentFragment(part);
    if (fragment) fragments.push(fragment);
  }

  if (fragments.length === 0) return consentLineFor(kind);

  return `I agree to ${oxford([
    'these design-services terms',
    ...fragments,
  ])}, and understand my signature alone does not authorize work until the studio countersigns.`;
}
