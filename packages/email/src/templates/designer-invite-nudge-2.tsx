// N2 — designer-invite-nudge-2
// track: invite | category: transactional
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("N2 —
// designer-invite-nudge-2"). Renders as a letter AND plain-text style per
// the deck: "N2 renders plain-text style (no gold header block, no
// button) — a real note." showHeader=false drops BaseEmailLayout's gold
// header block; there is deliberately no <Button> here — the only CTA is a
// plain-text reply ask.
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { letterParagraph, signature } from '../components/onboarding-styles';

export const DesignerInviteNudge2: React.FC = () => (
  <BaseEmailLayout preview="No pitch. Just a question — and an offer to hold your invitation." showHeader={false}>
    <Text style={letterParagraph}>{'{{first_name}}'},</Text>

    <Text style={letterParagraph}>
      I&apos;ve written twice now, so I&apos;ll take the hint that the timing might just be wrong — a busy
      season, a full plate, or Patina isn&apos;t a this-month thing.
    </Text>

    <Text style={letterParagraph}>
      No trouble at all. If there&apos;s a better month, reply with it and I&apos;ll hold your invitation open
      until then. If I don&apos;t hear back, that&apos;s fine too — this is the last of these you&apos;ll get
      from me. No drip, no chasing.
    </Text>

    <Text style={letterParagraph}>The door stays open either way.</Text>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default DesignerInviteNudge2;
