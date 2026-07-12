// E10 — onboarding-six-weeks
// track: spine | category: sequence
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("E10 —
// onboarding-six-weeks"). Sends day 40; never skipped — always sends.
// Letter style per the deck's conventions. {{firsts_summary}} is a rendered
// sentence built from the recipient's engagement events (deck line 19-21).
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { letterParagraph, buttonContainer, signature } from '../components/onboarding-styles';

export const OnboardingSixWeeks: React.FC = () => (
  <BaseEmailLayout preview="What you've set up, what's ahead, and one ask.">
    <Text style={letterParagraph}>{'{{first_name}}'},</Text>

    <Text style={letterParagraph}>
      Six weeks. Here&apos;s what you&apos;ve actually done — pulled from your own record, not a brochure:
    </Text>

    <Text style={letterParagraph}>{'{{firsts_summary}}'}</Text>

    <Text style={letterParagraph}>
      That&apos;s a practice starting to run on one set of pages instead of six browser tabs and your memory.
    </Text>

    <Text style={letterParagraph}>
      You were one of the first designers we asked in, and that wasn&apos;t a courtesy. What snagged for you,
      what felt obvious, what didn&apos;t — it&apos;s shaping what we build next. The founding cohort is small
      on purpose, so each voice actually moves things.
    </Text>

    <Text style={letterParagraph}>
      So, one ask: reply and tell me the roughest edge you hit in these six weeks. Not the tidy version — the
      real one. I read every reply on this address, and the rough ones are the useful ones.
    </Text>

    <Text style={letterParagraph}>
      This is the last of the onboarding notes. From here it&apos;s the Founding Circle letter once a month and
      the weekly digest — both easy to leave whenever you like. The desk is yours to keep.
    </Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/desk">Back to the desk</Button>
    </div>

    <Text style={signature}>
      — Kody
      <br />
      Founder, Patina
    </Text>
  </BaseEmailLayout>
);

export default OnboardingSixWeeks;
