// E5 — onboarding-drafting-room
// track: spine | category: sequence
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("E5 —
// onboarding-drafting-room"). Sends day 10; skipped once the recipient has a
// proposal_sent event.
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { paragraph, buttonContainer, signature } from '../components/onboarding-styles';

export const OnboardingDraftingRoom: React.FC = () => (
  <BaseEmailLayout preview="Boards, palettes, phases — then a signature.">
    <Text style={paragraph}>{'{{first_name}}'},</Text>

    <Text style={paragraph}>This is where the Library becomes a plan.</Text>

    <Text style={paragraph}>
      In the Drafting Room, you pull Pieces from any shelf — yours, the studio&apos;s, the makers&apos; —
      straight onto boards. Palettes hold the thread that ties a room together, the through-line a client can
      feel but rarely name. Phases set the pace and the money: what happens first, what it costs, what comes
      after.
    </Text>

    <Text style={paragraph}>
      When it&apos;s ready, the proposal goes to your client for a signature — inside Patina. No PDF to export,
      no attachment to chase, no &ldquo;did you get my email.&rdquo; They open it, they see the work, they sign.
    </Text>

    <Text style={paragraph}>
      Honest about the effort: your first board is an evening&apos;s work, not a template to wrestle into shape.
      You&apos;re arranging pieces you already like into an order that makes sense.
    </Text>

    <Text style={paragraph}>Start with the client you captured in week one. Their document is open and waiting.</Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/desk">Open the Drafting Room</Button>
    </div>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default OnboardingDraftingRoom;
