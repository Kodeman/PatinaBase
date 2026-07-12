// N1 — designer-invite-nudge-1
// track: invite | category: transactional
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("N1 —
// designer-invite-nudge-1"). Standard (non-letter) spacing — the deck's
// "letters" list (T0, N2, W0, E10) does not include N1.
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { paragraph, buttonContainer, signature } from '../components/onboarding-styles';

export const DesignerInviteNudge1: React.FC = () => (
  <BaseEmailLayout preview="The desk is still set. One click, no password, ten minutes.">
    <Text style={paragraph}>{'{{first_name}}'},</Text>

    <Text style={paragraph}>
      A few days back I sent you a way into Patina. That first link may have quietly expired by now — they
      don&apos;t last forever — so here&apos;s a fresh one, good through the week.
    </Text>

    <Text style={paragraph}>
      Nothing has changed on my end. Your desk is still set up and waiting, exactly as I left it. You&apos;re
      one of the first designers we&apos;ve asked in, and that seat isn&apos;t going anywhere this week.
    </Text>

    <Text style={paragraph}>
      When you have ten quiet minutes, the button below signs you in. No password, no forms. You land at your
      desk, and the rest makes sense from there.
    </Text>

    <div style={buttonContainer}>
      <Button href="{{action_link}}">Open your desk</Button>
    </div>

    <Text style={paragraph}>
      If the timing is just wrong, that&apos;s alright too — reply and tell me. This address comes straight to
      me.
    </Text>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default DesignerInviteNudge1;
