/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';

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
