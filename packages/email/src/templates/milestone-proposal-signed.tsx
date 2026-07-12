// M2 — milestone-proposal-signed
// track: milestone | category: transactional
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("M2 —
// milestone-proposal-signed"). Trigger: engagement_events insert
// `proposal_signed` (once ever, immediate).
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { paragraph, buttonContainer, signature } from '../components/onboarding-styles';

export const MilestoneProposalSigned: React.FC = () => (
  <BaseEmailLayout preview="{{client_first_name}} said yes. Here's the handoff from paper to workshop.">
    <Text style={paragraph}>{'{{first_name}}'},</Text>

    <Text style={paragraph}>
      {'{{client_first_name}}'} signed. That&apos;s a real yes, and it&apos;s worth a moment before the next
      thing.
    </Text>

    <Text style={paragraph}>Here&apos;s the handoff from paper to workshop, already in reach:</Text>

    <Text style={paragraph}>
      The deposit invoice is ready to send — a signed proposal fills it in for you. Purchase orders can go to
      the makers whenever you&apos;re set. And the hours you&apos;ve been logging are already sitting against
      this client, waiting for that first invoice.
    </Text>

    <Text style={paragraph}>None of it is urgent tonight. But when you&apos;re ready, it&apos;s all a short step from where the signature left off.</Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/desk">Open the document</Button>
    </div>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default MilestoneProposalSigned;
