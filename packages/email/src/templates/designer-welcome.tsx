// W0 — designer-welcome
// track: spine | category: sequence
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("W0 —
// designer-welcome"). Sends first sign-in + 2h (enrollment sets
// next_step_at, not a step delay — see 00292_designer_onboarding_enrollment
// and 00294's idx 0 comment). Letter style per the deck's conventions.
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { letterParagraph, buttonContainer, signature } from '../components/onboarding-styles';

export const DesignerWelcome: React.FC = () => (
  <BaseEmailLayout preview="One client, one document. Here's your first ten minutes.">
    <Text style={letterParagraph}>{'{{first_name}}'},</Text>

    <Text style={letterParagraph}>Good — you&apos;re in. Here&apos;s the whole idea, small enough to keep:</Text>

    <Text style={letterParagraph}>
      <strong>Everything for a client lives in one document.</strong> The brief, the boards, the orders, the
      care notes when the last piece lands — one set of pages, start to finish. No project folders scattered
      across six tools.
    </Text>

    <Text style={letterParagraph}>
      <strong>The desk only shows what needs your hand.</strong> When a document needs you, it lands there as a
      folder with one plain line about why. A quiet desk isn&apos;t an empty desk — it means the work is in
      motion.
    </Text>

    <Text style={letterParagraph}>That&apos;s it. Two ideas.</Text>

    <Text style={letterParagraph}>
      Your first move: capture a lead. A name and a note — under a minute — and the desk takes it from there. If
      you&apos;d rather look around first, press <strong>⌘K</strong> and type anything: a person, a piece, the
      word &ldquo;invoice.&rdquo;
    </Text>

    <Text style={letterParagraph}>
      If you skipped the walkthrough (fair), you can replay it anytime from the Help shelf — six stops, about a
      minute.
    </Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/desk">Go to your desk</Button>
    </div>

    <Text style={letterParagraph}>I read every reply on this address. Tell me where it creaks.</Text>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default DesignerWelcome;
