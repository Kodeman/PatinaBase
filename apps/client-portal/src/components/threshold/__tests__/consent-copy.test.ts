/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  KIND_LABEL,
  REFUSAL_TOKENS,
  SIGNATURE_NOTICE,
  consentLineFor,
  refusalSentence,
  signLabelFor,
  summaryLineFor,
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
  ])('turns %s into a sentence', (token, fragment) => {
    expect(refusalSentence(token)).toContain(fragment);
  });

  it('keeps an unrecognized message as written', () => {
    expect(refusalSentence('The studio withdrew this paper.')).toBe(
      'The studio withdrew this paper.',
    );
  });

  it('has something to say when the API says nothing', () => {
    expect(refusalSentence(undefined)).toBe('This paper could not be signed just now.');
    expect(refusalSentence('  ')).toBe('This paper could not be signed just now.');
  });
});
