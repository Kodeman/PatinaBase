// E7 — onboarding-hours
// track: spine | category: sequence
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("E7 —
// onboarding-hours"). Sends day 18; skipped once the recipient has an
// hours_logged event.
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { paragraph, buttonContainer, signature } from '../components/onboarding-styles';

export const OnboardingHours: React.FC = () => (
  <BaseEmailLayout preview="The timer runs while a document is in your hand. The ledger does the remembering.">
    <Text style={paragraph}>{'{{first_name}}'},</Text>

    <Text style={paragraph}>
      Billing the hours you actually worked shouldn&apos;t cost you a Sunday night trying to remember them.
    </Text>

    <Text style={paragraph}>
      There is a quiet timer in the studio drawer. Pick up a document to work on it, and time starts logging
      against that client. Set it down, and it stops. You don&apos;t start it and you don&apos;t stop it — it
      follows the work.
    </Text>

    <Text style={paragraph}>
      The Hours ledger is where it all lands, and it is yours to keep honestly. An entry ran long? Trim it. A
      phone call you forgot to open the document for? Add it. Nudge things up or down until the book reads true.
      It&apos;s your book — the timer just does the remembering so you don&apos;t have to.
    </Text>

    <Text style={paragraph}>The payoff is plain: at invoice time, the hours are already there, already sorted by client, waiting.</Text>

    <Text style={paragraph}>Open Hours and look at what it already caught this week.</Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/desk?sheet=hours">Open Hours</Button>
    </div>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default OnboardingHours;
