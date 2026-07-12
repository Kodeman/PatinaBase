// T0 — designer-invite
// track: invite | category: transactional
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("T0 —
// designer-invite"). Renders as a letter (generous spacing, no feature
// grids) per the deck's conventions header. Tokens are written literally —
// {{var}} — so they survive @react-email/render and are interpolated at
// send time by supabase/functions/_shared/render-template.ts.
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { letterParagraph, bullet, buttonContainer, signature, tagline } from '../components/onboarding-styles';

export const DesignerInvite: React.FC = () => (
  <BaseEmailLayout preview="Your desk is set. One click signs you in — no password.">
    <Text style={letterParagraph}>{'{{first_name}}'},</Text>

    <Text style={letterParagraph}>
      I&apos;ve been following your work — {'{{personal_observation}}'}. That&apos;s exactly the eye we built
      Patina for.
    </Text>

    <Text style={letterParagraph}>
      Patina connects designers with Midwest workshops that build furniture to last — kiln-dried hardwood,
      honest joinery, pieces that earn their patina. You design. The makers build. Your clients get heirlooms
      with a story worth telling.
    </Text>

    <Text style={letterParagraph}>
      You&apos;re one of the first designers we&apos;re inviting, which means two things: your desk is already
      set up, and your opinion will shape what we build next.
    </Text>

    <Text style={letterParagraph}>
      One promise up front, stated plainly: a quarter of our commission goes back to the designers who teach the
      system. When Patina earns, you earn.
    </Text>

    <Text style={letterParagraph}>The practical part:</Text>

    <Text style={bullet}>
      — The button below signs you in. No password, no forms — the link is yours alone. If it lapses, reply and
      I&apos;ll send a fresh one.
    </Text>
    <Text style={bullet}>
      — You&apos;ll land at your desk. A one-minute walkthrough shows you around — six stops, skippable.
    </Text>
    <Text style={bullet}>— Bring one client to mind. Your first ten minutes will make sense of the rest.</Text>

    <div style={buttonContainer}>
      <Button href="{{action_link}}">Open your desk</Button>
    </div>

    <Text style={letterParagraph}>
      Questions, doubts, or a better week to start — reply to this email. It comes straight to me.
    </Text>

    <Text style={signature}>
      — Kody
      <br />
      Founder, Patina
    </Text>
    <Text style={tagline}>Where Time Adds Value</Text>
  </BaseEmailLayout>
);

export default DesignerInvite;
