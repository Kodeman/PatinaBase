// E6 — onboarding-open-requests
// track: spine | category: sequence
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("E6 —
// onboarding-open-requests"). Sends day 14; skipped once the recipient has
// a design_request_claimed event.
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { paragraph, buttonContainer, signature } from '../components/onboarding-styles';

export const OnboardingOpenRequests: React.FC = () => (
  <BaseEmailLayout preview="Homeowners post real requests. You claim the ones that fit your eye.">
    <Text style={paragraph}>{'{{first_name}}'},</Text>

    <Text style={paragraph}>Some of the work on Patina comes looking for you.</Text>

    <Text style={paragraph}>
      Homeowners post requests — real ones. A request holds the rooms, often already scanned with their true
      dimensions, a budget the homeowner has named, and the project in their own words: what they have, what
      they want, what&apos;s not working. You read it the way you&apos;d read a good first phone call.
    </Text>

    <Text style={paragraph}>
      Claiming is simple, and it&apos;s first-come. When a request fits your eye and your calendar, you take it
      — and the moment you do, it&apos;s yours. The homeowner is told a designer has the project. A document
      opens with their brief already inside, nothing to re-enter.
    </Text>

    <Text style={paragraph}>
      Claim what fits. Pass on what doesn&apos;t — no penalty, no explaining. These are people who came to
      Patina looking for a designer, not leads to talk into anything.
    </Text>

    <Text style={paragraph}>Have a look at what&apos;s open on your desk today.</Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/desk">See open requests</Button>
    </div>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default OnboardingOpenRequests;
