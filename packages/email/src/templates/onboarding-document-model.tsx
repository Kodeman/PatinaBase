// E2 — onboarding-document-model
// track: spine | category: sequence
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("E2 —
// onboarding-document-model"). Sends day 2; skipped (per the automation
// sequence, see 00294) once the recipient has a project_created event.
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { paragraph, buttonContainer, signature } from '../components/onboarding-styles';

export const OnboardingDocumentModel: React.FC = () => (
  <BaseEmailLayout preview="Everything for a client — brief to care — lives on one set of pages.">
    <Text style={paragraph}>{'{{first_name}}'},</Text>

    <Text style={paragraph}>Here&apos;s the one idea Patina is built on, worth sitting with for a minute.</Text>

    <Text style={paragraph}>
      Everything for a client lives in one document. The first brief, the boards you&apos;ll build, the orders
      that go to the makers, the care notes when the last piece is delivered — one continuous set of pages,
      start to finish. Not a folder here, a spreadsheet there, a thread somewhere else.
    </Text>

    <Text style={paragraph}>
      The document does the organizing. When it needs your hand — a proposal to approve, a delivery to confirm
      — it lands on your desk as a folder with one plain line about why. The rest of the time it waits, holding
      everything in place.
    </Text>

    <Text style={paragraph}>
      There is nothing to configure. You start a document by capturing a client — a name and a note is enough,
      under a minute — and the desk shapes it from there.
    </Text>

    <Text style={paragraph}>So bring one real client to mind, and start their document today.</Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/desk">Capture a lead</Button>
    </div>

    <Text style={paragraph}>Tell me where it snags. I read every reply.</Text>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default OnboardingDocumentModel;
