// E8 — onboarding-books
// track: spine | category: sequence
// Copy source: docs/marketing/founding-onboarding/copy-deck.md ("E8 —
// onboarding-books"). Sends day 24; skipped once the recipient has an
// invoice_sent event.
import * as React from 'react';
import { Text } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { paragraph, buttonContainer, signature } from '../components/onboarding-styles';

export const OnboardingBooks: React.FC = () => (
  <BaseEmailLayout preview="Invoices out, payments in, purchase orders tracked — one sheet each.">
    <Text style={paragraph}>{'{{first_name}}'},</Text>

    <Text style={paragraph}>Once work is signed, the money has its own quiet order.</Text>

    <Text style={paragraph}>
      Accounts is one sheet. A signed proposal becomes a deposit invoice in about two minutes — the numbers are
      already there. Your receivables sit in one view: what&apos;s out, what&apos;s paid, what&apos;s late.
      Reminders go out on their own, so you are not the one nagging a client about a balance.
    </Text>

    <Text style={paragraph}>
      Orders is the other sheet. Every purchase order carries its maker, its dates, and its status, so
      &ldquo;where&apos;s the credenza&rdquo; has an answer you can read off a screen instead of chasing down a
      workshop.
    </Text>

    <Text style={paragraph}>
      Both sheets slide over the document when you need them and slide back when you&apos;re done. The ledgers
      serve the work — the work never bends to the ledgers.
    </Text>

    <Text style={paragraph}>If anything of yours is signed, send the deposit invoice today. It&apos;s the shortest path from yes to money in.</Text>

    <div style={buttonContainer}>
      <Button href="{{app_url}}/desk?sheet=accounts">Open Accounts</Button>
    </div>

    <Text style={signature}>— Kody</Text>
  </BaseEmailLayout>
);

export default OnboardingBooks;
