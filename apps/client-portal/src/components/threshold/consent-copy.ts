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
  // Wave 3, P9. A turnkey prime is its own class and must not fall through to
  // the sentence above (which says "design-services terms" over a paper that
  // carries none) or to the generic fallback below — the generic sentence is
  // exactly what a missed branch looks like on the signing surface, and the
  // walk's step 12 asserts against it by name.
  if (kind === 'design_build') {
    return 'I agree to these design-build terms and understand my signature alone does not authorize work until the studio countersigns.';
  }
  return 'I agree to the scope and investment in this proposal.';
}

/**
 * The word on the act itself.
 *
 * `design_build` takes 'Sign and accept', deliberately and not by accident: a
 * turnkey prime is COUNTERSIGNED, so the client's signature does not itself
 * authorize anyone to begin — which is the whole difference between this word
 * and the trade scope's 'Sign and authorize'. Pinned in the drift test.
 */
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
  if (kind === 'design_build') {
    return `By signing, you accept the pricing basis, schedule of values, draw schedule, and retainage in “${title}”. The agreement becomes effective only after the studio countersigns.`;
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
  design_build: 'Design-build agreement',
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

/* ── THE TURNKEY CLASS'S OWN MONEY PARTS (Wave 3, P9) ────────────────────────
   A design-build agreement carries none of the six variants above: no rate
   card, no ceiling by default, no furnishings deposit. What it carries is a
   PRICING BASIS (which the schedule of values is derived from), a DRAW
   SCHEDULE with retainage, and ALLOWANCES — R9 makes all three record-only for
   billing purposes, but they are precisely what the homeowner is consenting
   to, and a sentence that named none of them would be the generic fallback in
   disguise.

   Two parts each say two things, so this returns a LIST rather than the single
   fragment `consentFragment` returns: the pricing basis names both the price
   it sets and the schedule of values built from its cost lines; the draw
   schedule names both the draws and the retainage withheld from them.

   The same parity rule the services composer lives under applies here: this is
   `public.compose_agreement_consent(uuid)` written a second time, in a second
   language, and the two may not drift. Canonical order, never the designer's
   part order; zero fragments returns `consentLineFor('design_build')`
   byte-for-byte.
   ────────────────────────────────────────────────────────────────────────── */
/**
 * THE VARIANTS THE TURNKEY SENTENCE IS MADE OF, IN THE ORDER IT SAYS THEM.
 *
 * The SQL half — `public.compose_agreement_consent(uuid)`'s `design_build`
 * arm — reads exactly these three parts, one query each, in exactly this
 * order, and has NO retainer arm and NO ceiling arm: a turnkey prime's money
 * is the basis, the draws and the allowances, and anything else the studio
 * hangs on the paper is consented to by the paper rather than named a second
 * time in the sentence. This list used to carry `retainer` and `ceiling`; the
 * SQL never did, so the door said a term the filed sentence omitted.
 *
 * The door renders THIS sentence; the sign route files the DATABASE's
 * (`sign/route.ts` reads `p_consent.consentSentence` off the bundle) and the
 * record prints that one back to her (R36). Anything the two halves do not
 * share reaches a homeowner as one sentence ticked and a different one kept.
 */
export const DESIGN_BUILD_VARIANT_ORDER: readonly string[] = [
  'pricing_basis',
  'draws',
  'allowances',
];

/**
 * The price a pricing basis sets, in the basis's own words — the SQL arm's
 * `CASE COALESCE(v_basis->>'basis', '')`, byte for byte.
 */
export const DESIGN_BUILD_BASIS_FRAGMENT: Record<string, string> = {
  fixed: 'the fixed contract sum',
  cost_plus: 'the cost-plus pricing basis',
  cost_plus_gmp: 'the cost-plus pricing basis and its guaranteed maximum price',
  tm_nte: 'the time-and-materials basis and its not-to-exceed amount',
};

/**
 * The SQL CASE's `ELSE`. Unreachable in BOTH halves and carried anyway so the
 * two CASEs are one CASE: a basis outside the four names no contract sum, and
 * the fragment is only ever said when that sum is above zero.
 */
const UNNAMED_BASIS_FRAGMENT = 'the pricing basis';

/** `public._agreement_is_int(jsonb)` — a JSON number with nothing after the point. */
function consentInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/**
 * `public._agreement_contract_sum_cents(jsonb)` written a second time.
 *
 * The SQL arm says the basis fragment only when this is above zero — not when
 * the basis string is merely recognized — so an UNPRICED basis says nothing on
 * either side. `costBasisCents` is read off the payload rather than summed
 * from the cost lines because that is what the SQL reads; the two must agree
 * on the same input, not on the same intention.
 *
 * Postgres `round()` on a positive numeric and `Math.round` on a positive
 * number agree, and `feeBps` is validated to 0–5000, so the cost-plus arm
 * cannot part company with the database over a half-cent.
 */
function designBuildContractSumCents(payload: Record<string, unknown>): number | null {
  const basis = typeof payload.basis === 'string' ? payload.basis.trim() : '';
  if (basis === 'fixed') return consentInt(payload.fixedCents);
  if (basis === 'cost_plus_gmp') return consentInt(payload.gmpCents);
  if (basis === 'tm_nte') return consentInt(payload.nteCents);
  if (basis === 'cost_plus') {
    const costBasisCents = consentInt(payload.costBasisCents);
    const feeBps = consentInt(payload.feeBps);
    if (costBasisCents === null || feeBps === null) return null;
    return costBasisCents + Math.round((costBasisCents * feeBps) / 10000);
  }
  return null;
}

function designBuildFragments(part: ConsentPart): string[] {
  switch (part.variant) {
    case 'pricing_basis': {
      const sum = designBuildContractSumCents(part.payload);
      if (sum === null || sum <= 0) return [];
      const basis = typeof part.payload.basis === 'string' ? part.payload.basis : '';
      return [
        DESIGN_BUILD_BASIS_FRAGMENT[basis] ?? UNNAMED_BASIS_FRAGMENT,
        // Nested inside the priced branch exactly as the SQL nests it: a
        // schedule of values is the breakdown OF a contract sum, and a paper
        // that names no sum names no schedule of values either.
        ...(consentRows(part.payload.costLines).length > 0 ? ['the schedule of values'] : []),
      ];
    }
    case 'draws': {
      if (consentRows(part.payload.draws).length === 0) return [];
      const retainageBps = consentCents(part.payload.retainageBps);
      return [
        'the draw schedule',
        ...(retainageBps !== null && retainageBps > 0
          ? ['the retainage withheld from each draw']
          : []),
      ];
    }
    case 'allowances':
      return consentRows(part.payload.allowances).length > 0
        ? ['the allowances and what happens if they run over']
        : [];
    default:
      // The SQL arm has no other arm. A retainer or a ceiling the studio hangs
      // on a turnkey prime is on the paper and consented to by the paper; it is
      // not named in this sentence, on either side.
      return [];
  }
}

/**
 * THE PIN, AND THE ONLY LITERAL EITHER HALF MAY BE COMPARED AGAINST.
 *
 * The Halvorsen kitchen and mudroom (`source/fixtures.json`): a cost-plus
 * basis with a guaranteed maximum, seven cost lines behind a schedule of
 * values, four draws at 5% retainage, three allowances. The SQL half asserts
 * this exact string off the signature row it filed
 * (`supabase/tests/commercial/design_build_test.sql`, T13) and the jest half
 * asserts `composeConsentLine` returns it. Two implementations, one sentence:
 * either one moving turns the other red.
 */
export const HALVORSEN_DESIGN_BUILD_CONSENT =
  'I agree to these design-build terms, the cost-plus pricing basis and its guaranteed maximum price, the schedule of values, the draw schedule, the retainage withheld from each draw, and the allowances and what happens if they run over, and understand my signature alone does not authorize work until the studio countersigns.';

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
  // A furnishings authorization or a trade scope keeps its own consent,
  // whatever parts a later wave hangs on it.
  if (
    kind !== 'design_services' &&
    kind !== 'service_addendum' &&
    kind !== 'design_build'
  ) {
    return consentLineFor(kind);
  }

  const money = (parts ?? []).filter(
    (part) => part.kind === 'schedule' && part.clientVisible === true,
  );

  if (kind === 'design_build') {
    const turnkey = DESIGN_BUILD_VARIANT_ORDER.flatMap((variant) => {
      const part = money.find((candidate) => candidate.variant === variant);
      return part ? designBuildFragments(part) : [];
    });
    if (turnkey.length === 0) return consentLineFor(kind);
    return `I agree to ${oxford([
      'these design-build terms',
      ...turnkey,
    ])}, and understand my signature alone does not authorize work until the studio countersigns.`;
  }

  const fragments: string[] = [];
  for (const variant of CONSENT_VARIANT_ORDER) {
    // One part per money variant (R18). A set that carries two anyway says
    // the fragment once rather than twice — `compose_agreement_consent` takes
    // the same one part per variant (`DISTINCT ON`, 00577), so the two agree
    // on the set no caller can build.
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

/**
 * The noun the SUMMARY uses for each term the consent line names. The consent
 * sentence says a term in full and in its own words ("the retainer, which is
 * not refundable"); the summary lists it the way `summaryLineFor` has always
 * listed one — bare and article-less, inside a single long list. Every
 * retainer, whatever its credit rule, is "retainer" up there; the rule itself
 * belongs to the sentence she ticks.
 *
 * Presence is decided in exactly one place — `consentFragment` — so a term the
 * consent line does not name cannot appear in the summary above it. A consent
 * fragment with no entry here contributes nothing, which is what a later
 * wave's new variant should do until somebody writes its noun.
 */
const SUMMARY_FRAGMENT: Record<string, string> = {
  'the signed role rates': 'signed role rates',
  'the design authorization ceiling': 'design authorization ceiling',
  'the flat design fee': 'flat design fee',
  'the per-phase fee schedule': 'per-phase fee schedule',
  'the retainer credited against fees': 'retainer',
  'the retainer, which is not refundable': 'retainer',
  'the replenishing retainer': 'retainer',
  'the furnishings deposit': 'furnishings deposit',
  // Wave 3 — the turnkey class's own terms, under the same rule: presence is
  // decided once, in the fragment functions, so the summary can never name a
  // term the consent line beneath it leaves out.
  'the cost-plus pricing basis and its guaranteed maximum price': 'guaranteed maximum price',
  'the time-and-materials basis and its not-to-exceed amount': 'not-to-exceed amount',
  'the fixed contract sum': 'fixed contract sum',
  'the cost-plus pricing basis': 'cost-plus pricing basis',
  'the pricing basis': 'pricing basis',
  'the schedule of values': 'schedule of values',
  'the draw schedule': 'draw schedule',
  'the retainage withheld from each draw': 'retainage',
  'the allowances and what happens if they run over': 'allowances',
};

/**
 * WHAT SIGNING DOES, FOR AN AGREEMENT COMPOSED FROM PARTS.
 *
 * `summaryLineFor`'s services sentence names the services, the signed role
 * rates, the design authorization ceiling and the retainer, because before
 * Wave 2 every design-services agreement carried exactly those four facets and
 * the sentence was true of all of them. A COMPOSED agreement carries whatever
 * parts the studio put in it: a flat-fee engagement has no role rates and no
 * ceiling; a per-phase one has no retainer unless a retainer part was added.
 * Printed unchanged over such a paper, that sentence tells the homeowner — on
 * the signing surface, directly above the consent she ticks — that she accepts
 * terms the paper she is signing does not contain.
 *
 * So the list is composed from the SAME parts the consent line reads, in the
 * same canonical order: it names every money term the paper carries and no
 * term it does not. An agreement carrying role rates, a ceiling and a retainer
 * therefore reads byte-for-byte as `summaryLineFor` has always read it — the
 * commonest composed agreement loses nothing — while a per-phase paper says
 * "per-phase fee schedule" where it used to claim role rates.
 *
 * An agreement with no parts at all — flag off, legacy, or pre-Wave-2 —
 * returns `summaryLineFor` verbatim, so the deployed door is byte-identical to
 * what it has always shown.
 */
export function composeSummaryLine(
  kind: CommercialDocumentKind,
  title: string,
  parts: readonly ConsentPart[] | null | undefined,
): string {
  // A furnishings authorization and a trade scope keep their own summary
  // whatever parts a later wave hangs on them.
  if (
    kind !== 'design_services' &&
    kind !== 'service_addendum' &&
    kind !== 'design_build'
  ) {
    return summaryLineFor(kind, title);
  }

  const all = parts ?? [];
  if (all.length === 0) return summaryLineFor(kind, title);

  const money = all.filter(
    (part) => part.kind === 'schedule' && part.clientVisible === true,
  );

  if (kind === 'design_build') {
    const nouns = DESIGN_BUILD_VARIANT_ORDER.flatMap((variant) => {
      const part = money.find((candidate) => candidate.variant === variant);
      if (!part) return [];
      return designBuildFragments(part).flatMap((consented) => {
        const noun = SUMMARY_FRAGMENT[consented];
        return noun ? [noun] : [];
      });
    });
    return `By signing, you accept ${oxford([
      'the work described',
      ...nouns,
      `terms in “${title}”`,
    ])}. The agreement becomes effective only after the studio countersigns.`;
  }

  const fragments: string[] = [];
  for (const variant of CONSENT_VARIANT_ORDER) {
    const part = money.find((candidate) => candidate.variant === variant);
    if (!part) continue;
    const consented = consentFragment(part);
    const noun = consented ? SUMMARY_FRAGMENT[consented] : undefined;
    if (noun) fragments.push(noun);
  }

  return `By signing, you accept ${oxford([
    'the services',
    ...fragments,
    `terms in “${title}”`,
  ])}. The agreement becomes effective only after the studio countersigns.`;
}
