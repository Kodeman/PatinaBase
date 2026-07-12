// E3 — onboarding-capture
// track: spine | category: sequence
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("E3 —
// onboarding-capture"). Sends day 4; skipped once the recipient has a
// first_capture event.
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { paragraph, buttonContainer, signature } from '../components/onboarding-styles';

export const OnboardingCapture: React.FC = () => (
  <BaseEmailLayout preview="Clip a piece from any site. Scan a room from your pocket. It all lands on your shelf.">
    <Text style={paragraph}>{'{{first_name}}'},</Text>

    <Text style={paragraph}>Your taste doesn&apos;t live on one website, so Patina doesn&apos;t ask it to.</Text>

    <Text style={paragraph}>
      The clipper is a browser button. See a piece you like — on a maker&apos;s site, a magazine, anywhere — and
      one click puts it on your shelf. The source comes with it: where it&apos;s from, who makes it, what it
      cost. Provenance travels with the clip, so a find in March still has its story in September.
    </Text>

    <Text style={paragraph}>
      Patina Field is the same shelf in your pocket. Walk a room and it captures the true dimensions — wall to
      wall, floor to ceiling — from the walk-through itself. No tape measure, no graph paper. You leave with
      measurements you can trust and a room ready to design.
    </Text>

    <Text style={paragraph}>Both take about two minutes to set up. Do the clipper first.</Text>

    <Text style={paragraph}>
      Clip one thing today — the ugliest sconce you can find counts. The point is to feel how fast your eye
      becomes your shelf.
    </Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/library">Get the clipper</Button>
    </div>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default OnboardingCapture;
