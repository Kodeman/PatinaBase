// M1 — milestone-proposal-sent
// track: milestone | category: transactional
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("M1 —
// milestone-proposal-sent"). Trigger: engagement_events insert
// `proposal_sent` (once ever, immediate) — dispatched by
// ae_dispatch_milestone_notification (00292).
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { paragraph, buttonContainer, signature } from '../components/onboarding-styles';

export const MilestoneProposalSent: React.FC = () => (
  <BaseEmailLayout preview="What your client sees, and when you'll hear back.">
    <Text style={paragraph}>{'{{first_name}}'},</Text>

    <Text style={paragraph}>
      Your proposal is with {'{{client_first_name}}'} now. Here&apos;s what happens on their side.
    </Text>

    <Text style={paragraph}>
      They get a clean page — your boards, the phases, the numbers — and one button to sign. No PDF to download,
      no login to fumble. When they sign, you&apos;ll know within the minute.
    </Text>

    <Text style={paragraph}>
      You don&apos;t have to hover. Patina nudges them for you, gently, on a sensible schedule — so following up
      never falls to you, and you&apos;re never the one pestering a client.
    </Text>

    <Text style={paragraph}>You can watch its status any time from your desk: sent, opened, signed. That&apos;s the whole loop.</Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/desk">Watch it on your desk</Button>
    </div>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default MilestoneProposalSent;
