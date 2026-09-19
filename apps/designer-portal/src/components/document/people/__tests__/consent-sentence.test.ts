/**
 * ONE CONSENT SENTENCE, EVERYWHERE — and a phrase for the kickoff box
 * (SQ-108 INFO-8).
 *
 * `studio_channel_consent.source` has carried 'kickoff_checkbox' since 00650:
 * the Add Person sheet's unchecked box, ticked by a studio member with the
 * homeowner there, after showing her the disclosure it records the version of.
 * consent-sentence.ts had no phrase for it, so the one consent whose provenance
 * matters most — the one a studio recorded on her behalf — printed the `other`
 * fallback and read as "Recorded consent".
 */

import { consentSentence, consentSentenceForRecord } from '../consent-sentence';

const AT = '2026-09-08T14:00:00.000Z';

describe('consentSentence — the kickoff box has words of its own', () => {
  it('names the kickoff box, on the job it came from', () => {
    expect(
      consentSentence({
        status: 'granted',
        source: 'kickoff_checkbox',
        consentedAt: AT,
        projectName: 'Van Hise kitchen',
      }),
    ).toBe('Consent at kickoff, 8 Sep 2026, on the Van Hise kitchen.');
  });

  it('no longer falls back to the vague word it used to print', () => {
    const sentence = consentSentence({
      status: 'granted',
      source: 'kickoff_checkbox',
      consentedAt: AT,
    });
    expect(sentence).toBe('Consent at kickoff, 8 Sep 2026.');
    expect(sentence).not.toContain('Recorded consent');
  });

  it('speaks the studio’s plain words and none of the blacklist’s', () => {
    // P24's homeowner vocabulary blacklist, applied to a studio-facing line for
    // the same reason: these are Patina's words for Patina's machinery, not the
    // words for a thing that happened in someone's kitchen.
    const sentence = consentSentence({
      status: 'granted',
      source: 'kickoff_checkbox',
      consentedAt: AT,
      projectName: 'Van Hise kitchen',
    }) as string;
    for (const word of [
      'gate', 'task', 'dashboard', 'welcome', 'accept', 'collaborate',
      'workspace', 'platform', 'magic-link', 'Join Patina', 'AI',
    ]) {
      expect(sentence.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it('a pending kickoff record still reads as the grant it is', () => {
    // record_channel_invite writes status 'pending' (SQ-108's consent-gate
    // finding), and channelConsentDecision answers 'unknown' for it. The
    // sentence reads the SOURCE half whenever the verdict is not a refusal, so a
    // ticked box says what it is instead of going quiet.
    expect(
      consentSentenceForRecord(
        {
          verdict: 'unknown',
          record: {
            source: 'kickoff_checkbox',
            opt_out_source: null,
            consented_at: AT,
            opt_out_at: null,
          },
        } as never,
        'Van Hise kitchen',
      ),
    ).toBe('Consent at kickoff, 8 Sep 2026, on the Van Hise kitchen.');
  });

  it('is never a refusal — a kickoff box cannot say no', () => {
    // 00650 keeps 'kickoff_checkbox' out of opt_out_source on purpose, so the
    // refusal table has no entry for it and an opted-out record falls back to
    // the bare word rather than inventing "Opted out at kickoff".
    expect(
      consentSentence({
        status: 'opted_out',
        optOutSource: 'kickoff_checkbox',
        optOutAt: AT,
      }),
    ).toBe('Opted out, 8 Sep 2026.');
  });

  it('leaves the five sources it already had exactly as they read', () => {
    const cases: Array<[string, string]> = [
      ['verbal', 'Verbal consent'],
      ['written', 'Written consent'],
      ['web_form', 'Consent on a form'],
      ['inbound_sms', 'Consent by text'],
      ['other', 'Recorded consent'],
    ];
    for (const [source, phrase] of cases) {
      expect(consentSentence({ status: 'granted', source, consentedAt: AT })).toBe(
        `${phrase}, 8 Sep 2026.`,
      );
    }
    expect(consentSentence({ status: 'opted_out', optOutSource: 'inbound_sms', optOutAt: AT }))
      .toBe('Opted out by text, 8 Sep 2026.');
  });

  it('still prints nothing at all without a date', () => {
    expect(
      consentSentence({ status: 'granted', source: 'kickoff_checkbox', consentedAt: null }),
    ).toBeNull();
  });
});
