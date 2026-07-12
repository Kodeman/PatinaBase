// E4 — onboarding-library
// track: spine | category: sequence
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("E4 —
// onboarding-library"). Sends day 7; never skipped (skip if: never).
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { paragraph, buttonContainer, signature } from '../components/onboarding-styles';

export const OnboardingLibrary: React.FC = () => (
  <BaseEmailLayout preview="Yours, your studio's, and the makers' — every piece with its provenance.">
    <Text style={paragraph}>{'{{first_name}}'},</Text>

    <Text style={paragraph}>Your Library has three shelves, and the difference between them matters.</Text>

    <Text style={paragraph}>
      Your shelf holds what you&apos;ve clipped — your finds, your eye, private until you decide otherwise. The
      studio shelf is shared: what your team gathers, in one place, so nobody re-hunts a source someone already
      found. And the Patina catalog is the makers&apos; shelf — real pieces from real Midwest workshops, listed
      workshop by workshop.
    </Text>

    <Text style={paragraph}>
      Open any piece and you get the Piece: who built it, from what, and where. Walnut from a family mill in
      Indiana reads differently than &ldquo;brown, wood-look&rdquo; — and here it&apos;s named, so you can stand
      behind it when a client asks.
    </Text>

    <Text style={paragraph}>
      Everything is reachable by name. Press <strong>⌘K</strong>, type &ldquo;walnut sideboard&rdquo; or a maker
      you remember, and you&apos;re there.
    </Text>

    <Text style={paragraph}>Spend five minutes walking the catalog. Find one piece you&apos;d put in a real room this year.</Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/library">Walk the Library</Button>
    </div>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default OnboardingLibrary;
