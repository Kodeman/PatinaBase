// M4 — milestone-first-payment
// track: milestone | category: transactional
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("M4 —
// milestone-first-payment"). Trigger: engagement_events insert
// `payment_received` (once ever, immediate).
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { paragraph, buttonContainer, signature } from '../components/onboarding-styles';

export const MilestoneFirstPayment: React.FC = () => (
  <BaseEmailLayout preview="Paid, recorded, reconciled — nothing left for you to file.">
    <Text style={paragraph}>{'{{first_name}}'},</Text>

    <Text style={paragraph}>
      A payment cleared. It&apos;s recorded against the client, reconciled in Accounts, and sitting in your
      receivables as paid — nothing left for you to file.
    </Text>

    <Text style={paragraph}>First money through the books is a quiet milestone, but it&apos;s the one the whole thing is built to reach. Well earned.</Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/desk?sheet=accounts">See it in Accounts</Button>
    </div>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default MilestoneFirstPayment;
