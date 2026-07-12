// M3 — milestone-request-claimed
// track: milestone | category: transactional
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("M3 —
// milestone-request-claimed"). Trigger: engagement_events insert
// `design_request_claimed` (once ever, immediate).
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { paragraph, buttonContainer, signature } from '../components/onboarding-styles';

export const MilestoneRequestClaimed: React.FC = () => (
  <BaseEmailLayout preview="You claimed it. The document is already open.">
    <Text style={paragraph}>{'{{first_name}}'},</Text>

    <Text style={paragraph}>
      You claimed the request — so it&apos;s yours now, and no one else can take it. Here&apos;s what that set
      in motion.
    </Text>

    <Text style={paragraph}>
      The homeowner has been told their project has a designer. The clock on the work starts from here. And a
      document is already open on your desk with their brief inside — the rooms, the scan and its real
      dimensions, their own words about what they want. Nothing to re-enter.
    </Text>

    <Text style={paragraph}>
      Your first move is the easy one: open the document and read it end to end, the way you&apos;d listen
      through a first call before saying a word.
    </Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/desk">Open the brief</Button>
    </div>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default MilestoneRequestClaimed;
