/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { COMMERCIAL_DOCUMENT_KINDS } from '@patina/types';

import {
  KIND_LABEL,
  REFUSAL_TOKENS,
  SIGNATURE_NOTICE,
  composeConsentLine,
  composeSummaryLine,
  consentLineFor,
  refusalSentence,
  signLabelFor,
  summaryLineFor,
  type ConsentPart,
} from '../consent-copy';

// ── The drift guard ─────────────────────────────────────────────────────────
// The sign ceremony's own page (`app/proposals/[id]/sign/page.tsx`) and the
// awaiting-signature cards retired with the old portal, so the strings below
// no longer have a second author to drift from: the door signs in place and
// this file is where the legal line lives. What survives the retirement is the
// API the door still posts to — `POST /api/proposals/[id]/sign` — so its
// refusal tokens stay guarded against the route's source on disk, and the
// branch structure and the refusal sentences are pinned below.

const SRC = join(__dirname, '..', '..', '..');
const SIGN_ROUTE = readFileSync(join(SRC, 'app/api/proposals/[id]/sign/route.ts'), 'utf8');

describe('the API can still answer every refusal the door reads', () => {
  it.each(REFUSAL_TOKENS)('the API can still answer with the token: %s', (token) => {
    expect(SIGN_ROUTE).toContain(`error: '${token}'`);
  });

  // `W1-02`. The route answers in tokens and nothing else: a raw Postgres
  // message in the body is a sentence the door will print verbatim to the
  // person signing. The sibling accept route is held to the same bar.
  it('never answers with the database’s own sentence', () => {
    expect(SIGN_ROUTE).not.toMatch(/NextResponse\.json\(\{\s*error:[^}]*\.message/);
  });

  /* ── WAVE 3 · THE ROUTE ROUTES THE KIND THIS FILE SPEAKS FOR ─────────────
     The route's allowlist is derived from `COMMERCIAL_DOCUMENT_KINDS`, so a
     kind added to that array is ADMITTED the moment it lands. Until this
     wave the branch below it was `furnishings → trade_scope → else`, and a
     design-build signature fell into the `else` — signed as a plain
     design-services agreement, answered 200, and no copy on this side would
     have shown it.

     So the route names its signing kinds positively, and this pins that: the
     source must carry `design_build` inside a set of signing kinds, and must
     not have gone back to deciding by exclusion. ────────────────────────── */
  it('routes the turnkey prime by name, not by falling through', () => {
    expect(SIGN_ROUTE).toMatch(/SERVICES_SIGNING_KINDS[\s\S]{0,200}'design_build'/);
    expect(SIGN_ROUTE).toContain("SERVICES_SIGNING_KINDS.has(documentKind)");
    // The double negative this replaced. It admitted the new kind by accident.
    expect(SIGN_ROUTE).not.toContain(
      "documentKind !== 'furnishings_authorization' &&\n      documentKind !== 'trade_scope'",
    );
  });

  /* The offer is a SECOND call, made after the signature RPC returned, and its
     failure is a null offer rather than a refused signature (R15, D-W3-2). */
  it('offers the deposit only after the signature, never as a gate on it', () => {
    const signIndex = SIGN_ROUTE.indexOf("'sign_design_services_agreement_with_trusted_ip'");
    const offerIndex = SIGN_ROUTE.indexOf('offerDepositDraw(commercialService');
    expect(signIndex).toBeGreaterThan(-1);
    expect(offerIndex).toBeGreaterThan(signIndex);
    // Nothing about the offer may reach the signature's own arguments.
    expect(SIGN_ROUTE).not.toMatch(/signArgs[\s\S]{0,120}deposit/i);
    // Wave 3 writes no Stripe code: the offer is a link to the shipped payer.
    expect(SIGN_ROUTE).not.toContain('create-checkout-session');
    expect(SIGN_ROUTE).not.toContain('stripe');
  });
});

describe('the copy the door shows', () => {
  it('keeps the signature notice the retired ceremony carried', () => {
    expect(SIGNATURE_NOTICE).toBe(
      'Your typed name acts as your electronic signature.',
    );
  });

  it.each(Object.entries(KIND_LABEL))(
    'names the kind %s in the portal\u2019s own words',
    (_kind, label) => {
      expect(label).not.toContain('_');
    },
  );
});

describe('the branch structure mirrors the route', () => {
  it('gives a furnishings authorization its own consent, label and summary', () => {
    expect(consentLineFor('furnishings_authorization')).toContain(
      'any required deposit is a separate payment step',
    );
    expect(signLabelFor('furnishings_authorization')).toBe('Sign authorization');
    expect(summaryLineFor('furnishings_authorization', 'No. 7')).toBe(
      'By signing, you authorize only the named furnishing lines, quantities, and client prices in “No. 7”.',
    );
  });

  it('gives a trade scope its own consent, label and summary', () => {
    expect(consentLineFor('trade_scope')).toContain('each remaining draw is billed');
    expect(signLabelFor('trade_scope')).toBe('Sign and authorize');
    expect(summaryLineFor('trade_scope', 'TS-2')).toContain(
      'the scope of work, price, and draw schedule',
    );
  });

  it('gives both design-services kinds the countersign consent', () => {
    const services = consentLineFor('design_services');
    expect(consentLineFor('service_addendum')).toBe(services);
    expect(services).toContain('my signature alone does not authorize work');
    expect(signLabelFor('design_services')).toBe('Sign and accept');
    expect(signLabelFor('service_addendum')).toBe('Sign and accept');
  });

  it('falls back the way the route’s else branch does', () => {
    expect(consentLineFor('legacy')).toBe(
      'I agree to the scope and investment in this proposal.',
    );
  });

  /* ── WAVE 3 · THE TURNKEY PRIME ──────────────────────────────────────────
     A design-build agreement is countersigned, so it takes 'Sign and accept'
     rather than the trade scope's 'Sign and authorize', and its own consent
     rather than the design-services one — which would name "design-services
     terms" over a paper that carries none. ─────────────────────────────── */
  it('gives a design-build prime its own consent, label and summary', () => {
    const line = consentLineFor('design_build');

    expect(line).toContain('design-build terms');
    expect(line).toContain('my signature alone does not authorize work');
    expect(line).not.toBe(consentLineFor('design_services'));
    expect(signLabelFor('design_build')).toBe('Sign and accept');
    expect(summaryLineFor('design_build', 'Halvorsen kitchen')).toBe(
      'By signing, you accept the pricing basis, schedule of values, draw schedule, and retainage in “Halvorsen kitchen”. The agreement becomes effective only after the studio countersigns.',
    );
  });

  /**
   * THE ASSERTION THAT CATCHES A SILENTLY-SWALLOWED KIND.
   *
   * The generic sentence exists for `legacy` and for nothing else. A kind
   * appended to `COMMERCIAL_DOCUMENT_KINDS` whose branch nobody wrote lands
   * on it — and on the signing surface that reads as a real consent line, so
   * nothing looks broken. This is the whole failure mode Wave 3's sign route
   * had, said in copy: `design_build` was admitted by the allowlist and had
   * no branch here.
   */
  it('gives every live kind a sentence of its own, never the fallback', () => {
    const fallback = 'I agree to the scope and investment in this proposal.';
    for (const kind of COMMERCIAL_DOCUMENT_KINDS) {
      if (kind === 'legacy') continue;
      expect([kind, consentLineFor(kind)]).not.toEqual([kind, fallback]);
    }
  });

  it('names the turnkey kind in the portal’s own words', () => {
    expect(KIND_LABEL.design_build).toBe('Design-build agreement');
  });

  it('never asserts a countersignature on a furnishings authorization', () => {
    expect(consentLineFor('furnishings_authorization')).not.toContain('countersign');
    expect(consentLineFor('trade_scope')).not.toContain('countersign');
  });
});

describe('refusalSentence', () => {
  it.each([
    ['not_signable', 'not open for signing'],
    ['proposal_expired', 'expired'],
    ['unauthorized', 'Sign in again'],
    ['invalid_name', 'Type your full name'],
    ['not_found', 'could not be found'],
    ['legacy_signing_retired', 'new agreement'],
    ['sign_failed', 'could not be signed just now'],
  ])('turns %s into a sentence', (token, fragment) => {
    expect(refusalSentence(token)).toContain(fragment);
  });

  // `W1-02`. This used to echo whatever it was handed, and the route used to
  // hand it the raw Postgres message — so the door read
  // "trade scope b0000000-… not found or access denied" to a homeowner
  // mid-signature. Nothing unmapped is ever spoken aloud now.
  it('never reads an unrecognized token aloud', () => {
    expect(
      refusalSentence('trade scope b0000000-0000-0000-0000-0000000cd102 not found or access denied'),
    ).toBe('This paper could not be signed just now.');
    expect(refusalSentence('P0001')).toBe('This paper could not be signed just now.');
  });

  it('has something to say when the API says nothing', () => {
    expect(refusalSentence(undefined)).toBe('This paper could not be signed just now.');
    expect(refusalSentence('  ')).toBe('This paper could not be signed just now.');
  });
});

/* ── THE COMPOSED CONSENT (Wave 2, P6) ───────────────────────────────────────
   The drift test for `composeConsentLine`. Every sentence below is reproduced
   verbatim in `supabase/tests/commercial/agreement_fee_schedules_test.sql`
   against `public.compose_agreement_consent(uuid)` — two implementations of
   one function, pinned to the same literals from both sides. A change here
   that is not made there is the drift this block exists to catch.

   Asserted with `toBe`, never `toContain`: the whole point is the exact
   sentence, punctuation included. Note the legacy literal carries no comma
   before "and understand"; the composed form does. That is intended.
   ────────────────────────────────────────────────────────────────────────── */

const LEGACY_SERVICES_LINE =
  'I agree to these design-services terms and understand my signature alone does not authorize work until the studio countersigns.';

function schedule(
  variant: string,
  payload: Record<string, unknown>,
  clientVisible = true,
): ConsentPart {
  return { kind: 'schedule', variant, clientVisible, payload };
}

/** The nine standard parts, as `materialize_standard_parts` seeds them. */
const NINE_STANDARD_PARTS: ConsentPart[] = [
  { kind: 'clause', variant: null, clientVisible: true, payload: { body: 'Interior design services.' } },
  { kind: 'list', variant: null, clientVisible: true, payload: { items: [{ id: 'd1', text: 'Concept presentation' }] } },
  { kind: 'list', variant: null, clientVisible: true, payload: { items: [{ id: 'e1', text: 'Construction labor' }] } },
  schedule('rate_card', { roles: [{ roleName: 'Principal', hourlyRateCents: 27500, sortOrder: 0 }] }),
  schedule('ceiling', { cents: 2400000 }),
  schedule('procurement', { depositPercent: 50 }),
  schedule('retainer', { cents: 500000, creditRule: 'credited', activationPolicy: 'immediate' }),
  schedule('cadence', { cadence: 'monthly' }),
  { kind: 'clause', variant: null, clientVisible: true, payload: { body: '' } },
];

const NINE_STANDARD_LINE =
  'I agree to these design-services terms, the signed role rates, the design authorization ceiling, the retainer credited against fees, and the furnishings deposit, and understand my signature alone does not authorize work until the studio countersigns.';

describe('composeConsentLine — the sentence she ticks', () => {
  it('says the legacy line for an empty part set', () => {
    expect(composeConsentLine('design_services', [])).toBe(consentLineFor('design_services'));
    expect(composeConsentLine('design_services', [])).toBe(LEGACY_SERVICES_LINE);
  });

  it('says the legacy line when the bundle carries no parts at all', () => {
    expect(composeConsentLine('design_services', null)).toBe(consentLineFor('design_services'));
    expect(composeConsentLine('design_services', undefined)).toBe(
      consentLineFor('design_services'),
    );
  });

  it('names every term the nine standard parts carry', () => {
    expect(composeConsentLine('design_services', NINE_STANDARD_PARTS)).toBe(NINE_STANDARD_LINE);
  });

  it('names the two terms a consultation carries', () => {
    expect(
      composeConsentLine('design_services', [
        schedule('rate_card', { roles: [{ roleName: 'Principal', hourlyRateCents: 27500 }] }),
        schedule('ceiling', { cents: 600000 }),
      ]),
    ).toBe(
      'I agree to these design-services terms, the signed role rates, and the design authorization ceiling, and understand my signature alone does not authorize work until the studio countersigns.',
    );
  });

  it('names a flat fee on its own', () => {
    expect(
      composeConsentLine('design_services', [schedule('flat', { cents: 800000 })]),
    ).toBe(
      'I agree to these design-services terms and the flat design fee, and understand my signature alone does not authorize work until the studio countersigns.',
    );
  });

  it('says a non-refundable retainer in the retainer’s own words', () => {
    expect(
      composeConsentLine('design_services', [
        schedule('per_phase', {
          phases: [
            { key: 'concept', label: 'Concept', cents: 350000 },
            { key: 'documentation', label: 'Documentation', cents: 450000 },
            { key: 'selections', label: 'Selections', cents: 300000 },
          ],
        }),
        schedule('retainer', { cents: 500000, creditRule: 'non_refundable' }),
      ]),
    ).toBe(
      'I agree to these design-services terms, the per-phase fee schedule, and the retainer, which is not refundable, and understand my signature alone does not authorize work until the studio countersigns.',
    );
  });

  it('names the furnishings deposit on a furnishings-only set', () => {
    expect(
      composeConsentLine('design_services', [
        { kind: 'clause', variant: null, clientVisible: true, payload: { body: 'Services.' } },
        schedule('procurement', { depositPercent: 50, markupBasis: 'net' }),
      ]),
    ).toBe(
      'I agree to these design-services terms and the furnishings deposit, and understand my signature alone does not authorize work until the studio countersigns.',
    );
  });

  it('consents to nothing a record-only variant carries (R9)', () => {
    const withRecordOnly: ConsentPart[] = [
      schedule('flat', { cents: 800000 }),
      schedule('percent_of_cost', { percent: 12 }),
      schedule('cost_plus', { markupPercent: 20 }),
      schedule('day_rate', { cents: 180000, minimumDays: 2 }),
      schedule('package', { title: 'Room in a week', cents: 900000 }),
      schedule('pricing_basis', { basis: 'net' }),
      schedule('draws', { draws: [{ label: 'First', cents: 100000 }] }),
      schedule('allowances', { allowances: [{ label: 'Lighting', cents: 400000 }] }),
    ];
    expect(composeConsentLine('design_services', withRecordOnly)).toBe(
      composeConsentLine('design_services', [schedule('flat', { cents: 800000 })]),
    );
  });

  it('consents to nothing the homeowner cannot see', () => {
    const hidden = NINE_STANDARD_PARTS.map((part) =>
      part.kind === 'schedule' ? { ...part, clientVisible: false } : part,
    );
    expect(composeConsentLine('design_services', hidden)).toBe(LEGACY_SERVICES_LINE);
  });

  it('says the fragments in canonical order, whatever order the parts arrive in', () => {
    expect(composeConsentLine('design_services', [...NINE_STANDARD_PARTS].reverse())).toBe(
      NINE_STANDARD_LINE,
    );
  });

  it('says nothing about a billing cadence', () => {
    expect(
      composeConsentLine('design_services', [schedule('cadence', { cadence: 'monthly' })]),
    ).toBe(LEGACY_SERVICES_LINE);
  });

  it('leaves every other kind of paper its own consent', () => {
    expect(
      composeConsentLine('furnishings_authorization', [schedule('flat', { cents: 800000 })]),
    ).toBe(consentLineFor('furnishings_authorization'));
  });

  it('composes for an addendum exactly as it composes for an agreement', () => {
    expect(composeConsentLine('service_addendum', NINE_STANDARD_PARTS)).toBe(NINE_STANDARD_LINE);
  });

  /**
   * The twelfth parity scenario. `upsert_agreement_parts` refuses a second
   * retainer (R18), so this set cannot be composed through the RPC — but the
   * two implementations read it differently unless both are told the rule,
   * and only one of them enforces it. SQL takes the lowest-`position` part of
   * each variant (`DISTINCT ON`, 00577); this side takes the first of the
   * position-ordered array. Both say the term once, in the first part's
   * words. Pinned in `agreement_fee_schedules_test.sql` case (18).
   */
  it('says a money term once when a part set carries two of one variant', () => {
    expect(
      composeConsentLine('design_services', [
        schedule('per_phase', { phases: [{ key: 'a', label: 'Concept', cents: 350000 }] }),
        schedule('retainer', { cents: 500000, creditRule: 'non_refundable' }),
        schedule('retainer', { cents: 900000, creditRule: 'replenishing' }),
      ]),
    ).toBe(
      'I agree to these design-services terms, the per-phase fee schedule, and the retainer, which is not refundable, and understand my signature alone does not authorize work until the studio countersigns.',
    );
  });
});

/* ── THE SUMMARY OVER THE CONSENT (Wave 2, P6) ───────────────────────────────
   `summaryLineFor`'s services sentence names role rates, a ceiling and a
   retainer, because every pre-Wave-2 design-services agreement carried them.
   Composed, an agreement carries whatever parts it was given — so on a
   flat-fee or per-phase paper the frozen sentence asserts terms the paper does
   not contain, directly above the line she ticks.

   The list is therefore composed from the SAME parts the consent line reads:
   it names every money term the paper carries and no term it does not. Where
   the old four facets are all present it is byte-identical to the frozen
   sentence, and an agreement with no parts is untouched.
   ────────────────────────────────────────────────────────────────────────── */

const FLAT_SUMMARY =
  'By signing, you accept the services, flat design fee, and terms in “Cedar Lane — Design Services”. The agreement becomes effective only after the studio countersigns.';

describe('composeSummaryLine — what signing does', () => {
  it('is byte-identical to today’s sentence for an agreement with no parts', () => {
    expect(composeSummaryLine('design_services', 'Cedar Lane — Design Services', [])).toBe(
      summaryLineFor('design_services', 'Cedar Lane — Design Services'),
    );
    expect(composeSummaryLine('design_services', 'Cedar Lane — Design Services', null)).toBe(
      summaryLineFor('design_services', 'Cedar Lane — Design Services'),
    );
    expect(
      composeSummaryLine('design_services', 'Cedar Lane — Design Services', undefined),
    ).toBe(summaryLineFor('design_services', 'Cedar Lane — Design Services'));
  });

  /* The reason this composes rather than reduces: an agreement that carries
     the old four facets said all four before Wave 2 and still says all four
     after it, character for character. Nothing is taken off the signing
     surface of the commonest composed agreement. */
  it('is byte-identical to today’s sentence when the paper carries the old facets', () => {
    expect(
      composeSummaryLine('design_services', 'Cedar Lane — Design Services', [
        schedule('rate_card', { roles: [{ roleName: 'Principal', hourlyRateCents: 27500 }] }),
        schedule('ceiling', { cents: 2400000 }),
        schedule('retainer', { cents: 500000, creditRule: 'credited' }),
      ]),
    ).toBe(summaryLineFor('design_services', 'Cedar Lane — Design Services'));
  });

  it('names every term the nine standard parts carry, in the canonical order', () => {
    expect(
      composeSummaryLine('design_services', 'Cedar Lane — Design Services', NINE_STANDARD_PARTS),
    ).toBe(
      'By signing, you accept the services, signed role rates, design authorization ceiling, retainer, furnishings deposit, and terms in “Cedar Lane — Design Services”. The agreement becomes effective only after the studio countersigns.',
    );
    expect(
      composeSummaryLine(
        'design_services',
        'Cedar Lane — Design Services',
        [...NINE_STANDARD_PARTS].reverse(),
      ),
    ).toBe(
      composeSummaryLine('design_services', 'Cedar Lane — Design Services', NINE_STANDARD_PARTS),
    );
  });

  it('stops naming terms a composed agreement does not carry', () => {
    const line = composeSummaryLine('design_services', 'Cedar Lane — Design Services', [
      schedule('flat', { cents: 800000 }),
    ]);

    expect(line).toBe(FLAT_SUMMARY);
    expect(line).not.toContain('signed role rates');
    expect(line).not.toContain('design authorization ceiling');
    expect(line).not.toContain('retainer');
  });

  it('says the term the paper does carry, in the summary’s own words', () => {
    expect(
      composeSummaryLine('design_services', 'Cedar Lane — Design Services', [
        schedule('per_phase', {
          phases: [{ key: 'concept', label: 'Concept', cents: 350000 }],
        }),
        schedule('retainer', { cents: 500000, creditRule: 'non_refundable' }),
      ]),
    ).toBe(
      'By signing, you accept the services, per-phase fee schedule, retainer, and terms in “Cedar Lane — Design Services”. The agreement becomes effective only after the studio countersigns.',
    );
  });

  it('names no money at all on a composed agreement that carries none', () => {
    expect(
      composeSummaryLine('design_services', 'Cedar Lane — Design Services', [
        { kind: 'clause', variant: null, clientVisible: true, payload: { body: 'Services.' } },
      ]),
    ).toBe(
      'By signing, you accept the services and terms in “Cedar Lane — Design Services”. The agreement becomes effective only after the studio countersigns.',
    );
  });

  /* The summary cannot name a term the consent line below it does not: both
     read the same parts through the same presence rule. */
  it('names nothing the consent line beneath it leaves out', () => {
    const unset: ConsentPart[] = [
      schedule('rate_card', { roles: [] }),
      schedule('ceiling', { cents: 0 }),
      schedule('retainer', { cents: 0, creditRule: 'credited' }),
      schedule('procurement', { depositPercent: 0 }),
      schedule('cadence', { cadence: 'monthly' }),
      schedule('cost_plus', { markupPercent: 20 }),
    ];
    expect(composeSummaryLine('design_services', 'Cedar Lane — Design Services', unset)).toBe(
      'By signing, you accept the services and terms in “Cedar Lane — Design Services”. The agreement becomes effective only after the studio countersigns.',
    );
    expect(composeConsentLine('design_services', unset)).toBe(LEGACY_SERVICES_LINE);
  });

  it('names nothing the homeowner cannot see', () => {
    const hidden = NINE_STANDARD_PARTS.map((part) =>
      part.kind === 'schedule' ? { ...part, clientVisible: false } : part,
    );
    expect(composeSummaryLine('design_services', 'Cedar Lane — Design Services', hidden)).toBe(
      'By signing, you accept the services and terms in “Cedar Lane — Design Services”. The agreement becomes effective only after the studio countersigns.',
    );
  });

  it('keeps the countersignature sentence, which is true of every agreement', () => {
    expect(
      composeSummaryLine('design_services', 'Cedar Lane — Design Services', NINE_STANDARD_PARTS),
    ).toContain('The agreement becomes effective only after the studio countersigns.');
  });

  it('composes an addendum exactly as it composes an agreement', () => {
    expect(
      composeSummaryLine('service_addendum', 'Cedar Lane — Design Services', [
        schedule('flat', { cents: 800000 }),
      ]),
    ).toBe(FLAT_SUMMARY);
  });

  it('leaves every other kind of paper its own summary', () => {
    expect(
      composeSummaryLine('furnishings_authorization', 'No. 7', [
        schedule('flat', { cents: 800000 }),
      ]),
    ).toBe(summaryLineFor('furnishings_authorization', 'No. 7'));
    expect(
      composeSummaryLine('trade_scope', 'TS-2', [schedule('flat', { cents: 800000 })]),
    ).toBe(summaryLineFor('trade_scope', 'TS-2'));
  });
});

/* ── THE TURNKEY CONSENT (Wave 3, P9) ────────────────────────────────────────
   The Halvorsen kitchen and mudroom, from `source/fixtures.json`: a cost-plus
   agreement with a guaranteed maximum price, seven cost lines behind a
   schedule of values, four draws at 5% retainage, and three allowances. The
   sentence she ticks names every one of those and no term the paper does not
   carry — the walk's step 12 asserts exactly this, because the generic
   fallback is what a missed branch looks like on the signing surface.

   These sentences are the client half of a pair: the SQL half is
   `public.compose_agreement_consent(uuid)`, which the backend lane widens for
   this class in the same wave. Two implementations of one function; a change
   here that is not made there is drift, and it reaches a homeowner as one
   sentence read and a different sentence filed.
   ────────────────────────────────────────────────────────────────────────── */

const HALVORSEN_PRICING_BASIS = schedule('pricing_basis', {
  basis: 'cost_plus_gmp',
  feeBps: 1800,
  gmpCents: 8413400,
  nteCents: null,
  fixedCents: null,
  subDisclosure: 'closed_book',
  costLines: [
    { id: 'cabinetryAndMillwork', label: 'Cabinetry & millwork', category: 'sub', basisCents: 3800000 },
    { id: 'electrical', label: 'Electrical', category: 'sub', basisCents: 950000 },
    { id: 'plumbing', label: 'Plumbing', category: 'sub', basisCents: 720000 },
    { id: 'generalConditions', label: 'General conditions / site', category: 'general_conditions', basisCents: 630000 },
    { id: 'tile', label: 'Tile allowance', category: 'allowance', basisCents: 400000 },
    { id: 'plumbingFixtures', label: 'Plumbing fixtures allowance', category: 'allowance', basisCents: 350000 },
    { id: 'lighting', label: 'Lighting allowance', category: 'allowance', basisCents: 280000 },
  ],
});

const HALVORSEN_DRAWS = schedule('draws', {
  retainageBps: 500,
  draws: [
    { key: 'deposit', label: 'Deposit at signing', sortOrder: 0, pct: 10, retainageApplies: false },
    { key: 'roughIn', label: 'Rough-in', sortOrder: 1, pct: 30, retainageApplies: true },
    { key: 'cabinetsSet', label: 'Cabinets set', sortOrder: 2, pct: 40, retainageApplies: true },
    { key: 'substantialCompletion', label: 'Substantial completion', sortOrder: 3, pct: 20, retainageApplies: true },
  ],
});

const HALVORSEN_ALLOWANCES = schedule('allowances', {
  allowances: [
    { id: 'tile', label: 'Tile', amountCents: 400000, overageRule: 'change_order', underageRule: 'credit' },
    { id: 'plumbingFixtures', label: 'Plumbing fixtures', amountCents: 350000, overageRule: 'change_order', underageRule: 'credit' },
    { id: 'lighting', label: 'Lighting', amountCents: 280000, overageRule: 'change_order', underageRule: 'credit' },
  ],
});

const HALVORSEN_PARTS: ConsentPart[] = [
  HALVORSEN_PRICING_BASIS,
  HALVORSEN_DRAWS,
  HALVORSEN_ALLOWANCES,
  { kind: 'clause', variant: null, clientVisible: true, payload: { body: 'Closed book.' } },
];

const HALVORSEN_CONSENT =
  'I agree to these design-build terms, the guaranteed maximum price, the schedule of values, the draw schedule, the retainage withheld from each draw, and the allowances, and understand my signature alone does not authorize work until the studio countersigns.';

describe('composeConsentLine — the turnkey prime', () => {
  it('names the price, the schedule of values, the draws, the retainage and the allowances', () => {
    expect(composeConsentLine('design_build', HALVORSEN_PARTS)).toBe(HALVORSEN_CONSENT);
  });

  it('never says the generic sentence over a turnkey paper', () => {
    expect(composeConsentLine('design_build', HALVORSEN_PARTS)).not.toBe(
      'I agree to the scope and investment in this proposal.',
    );
    expect(composeConsentLine('design_build', [])).not.toBe(
      'I agree to the scope and investment in this proposal.',
    );
  });

  it('says the fragments in canonical order, whatever order the parts arrive in', () => {
    expect(composeConsentLine('design_build', [...HALVORSEN_PARTS].reverse())).toBe(
      HALVORSEN_CONSENT,
    );
  });

  it('says the turnkey line for a paper with no money parts at all', () => {
    expect(composeConsentLine('design_build', [])).toBe(consentLineFor('design_build'));
    expect(composeConsentLine('design_build', null)).toBe(consentLineFor('design_build'));
  });

  it('names each pricing basis in its own words', () => {
    const said = (basis: string, extra: Record<string, unknown> = {}) =>
      composeConsentLine('design_build', [
        schedule('pricing_basis', { basis, costLines: [], ...extra }),
      ]);

    expect(said('tm_nte')).toContain('the not-to-exceed price');
    expect(said('fixed')).toContain('the fixed contract price');
    expect(said('cost_plus')).toContain('the cost-plus pricing basis');
    // A basis a later wave adds contributes nothing rather than throwing.
    expect(said('unit_price')).toBe(consentLineFor('design_build'));
  });

  it('says nothing about retainage when none is withheld', () => {
    const line = composeConsentLine('design_build', [
      schedule('draws', { retainageBps: 0, draws: [{ key: 'a', label: 'One', pct: 100 }] }),
    ]);
    expect(line).toContain('the draw schedule');
    expect(line).not.toContain('retainage');
  });

  it('says nothing about a schedule of values a paper has no cost lines for', () => {
    const line = composeConsentLine('design_build', [
      schedule('pricing_basis', { basis: 'fixed', fixedCents: 8413400, costLines: [] }),
    ]);
    expect(line).toContain('the fixed contract price');
    expect(line).not.toContain('schedule of values');
  });

  it('consents to nothing the homeowner cannot see', () => {
    const hidden = HALVORSEN_PARTS.map((part) =>
      part.kind === 'schedule' ? { ...part, clientVisible: false } : part,
    );
    expect(composeConsentLine('design_build', hidden)).toBe(consentLineFor('design_build'));
  });

  it('consents to a retainer the studio added, in the retainer’s own words', () => {
    expect(
      composeConsentLine('design_build', [
        HALVORSEN_DRAWS,
        schedule('retainer', { cents: 500000, creditRule: 'non_refundable' }),
      ]),
    ).toBe(
      'I agree to these design-build terms, the draw schedule, the retainage withheld from each draw, and the retainer, which is not refundable, and understand my signature alone does not authorize work until the studio countersigns.',
    );
  });

  it('leaves the services classes untouched by the turnkey composer', () => {
    expect(composeConsentLine('design_services', HALVORSEN_PARTS)).toBe(LEGACY_SERVICES_LINE);
  });
});

describe('composeSummaryLine — the turnkey prime', () => {
  it('names every term the consent line beneath it names, in the summary’s words', () => {
    expect(composeSummaryLine('design_build', 'Halvorsen kitchen', HALVORSEN_PARTS)).toBe(
      'By signing, you accept the work described, guaranteed maximum price, schedule of values, draw schedule, retainage, allowances, and terms in “Halvorsen kitchen”. The agreement becomes effective only after the studio countersigns.',
    );
  });

  it('is the frozen sentence for a turnkey paper with no parts', () => {
    expect(composeSummaryLine('design_build', 'Halvorsen kitchen', [])).toBe(
      summaryLineFor('design_build', 'Halvorsen kitchen'),
    );
  });

  it('names nothing the consent line beneath it leaves out', () => {
    const unset: ConsentPart[] = [
      schedule('pricing_basis', { basis: 'unit_price', costLines: [] }),
      schedule('draws', { retainageBps: 0, draws: [] }),
      schedule('allowances', { allowances: [] }),
    ];
    expect(composeSummaryLine('design_build', 'Halvorsen kitchen', unset)).toBe(
      'By signing, you accept the work described and terms in “Halvorsen kitchen”. The agreement becomes effective only after the studio countersigns.',
    );
    expect(composeConsentLine('design_build', unset)).toBe(consentLineFor('design_build'));
  });

  it('keeps the countersignature sentence, which is true of every turnkey prime', () => {
    expect(
      composeSummaryLine('design_build', 'Halvorsen kitchen', HALVORSEN_PARTS),
    ).toContain('The agreement becomes effective only after the studio countersigns.');
  });
});
