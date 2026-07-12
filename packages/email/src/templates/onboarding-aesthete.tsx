// E9 — onboarding-aesthete
// track: spine | category: sequence
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("E9 —
// onboarding-aesthete"). Sends day 30; never skipped (skip if: never).
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { paragraph, buttonContainer, signature } from '../components/onboarding-styles';

export const OnboardingAesthete: React.FC = () => (
  <BaseEmailLayout preview="Patina learns your eye the way an apprentice would — by watching, and by asking.">
    <Text style={paragraph}>{'{{first_name}}'},</Text>

    <Text style={paragraph}>
      By now Patina has watched you work a little — the pieces you clip, the ones you scroll past, the rooms you
      build. Aesthete is where that turns into something useful to you.
    </Text>

    <Text style={paragraph}>
      It&apos;s a short conversation. What you like, and why. The words you&apos;d actually use for a room —
      warm, quiet, a little worn — not a style label off a menu. You talk; it listens; it learns your eye the
      way a good apprentice would, by watching and by asking.
    </Text>

    <Text style={paragraph}>
      What you get back is plain: better pieces surfaced sooner, fewer misses, a catalog that slowly starts to
      feel sorted by you instead of by everyone.
    </Text>

    <Text style={paragraph}>
      And here is the part I&apos;ll always state plainly: a quarter of our commission goes back to the
      designers who teach the system. Teaching Aesthete your taste is real work, and it&apos;s paid work. When
      Patina gets smarter, the designers who taught it share in what it earns.
    </Text>

    <Text style={paragraph}>Give Aesthete ten minutes with your least favorite trend.</Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/library">Sit with Aesthete</Button>
    </div>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default OnboardingAesthete;
