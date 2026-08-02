import * as React from 'react';
import { Text, Heading, Section, Hr } from '@react-email/components';
import { PadSection } from '../components/PadSection';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface ManufacturerOutreachProps {
  /** Manufacturer contact name pulled from vendor_nominations.manufacturer_contact. */
  recipientName?: string;
  /** Vendor / maker name. */
  vendorName: string;
  /** Designer/studio that nominated this maker. */
  nominatingStudioName: string;
  /** The designer's nomination narrative (verbatim — PRD §6.7 "in their own voice"). */
  recommendationNote: string;
  /** Optional fit-signal labels Patina selected from the nomination payload. */
  fitSignals?: string[];
  /** Magic-link or onboarding URL the manufacturer follows from the email. */
  onboardingUrl?: string;
  /** Patina-side contact for follow-up questions. */
  patinaContactName?: string;
  patinaContactEmail?: string;
  unsubscribeUrl?: string;
}

/**
 * Manufacturer outreach email — sent when a vendor nomination
 * transitions to `contacted` (PRD §6.6). Patina opens the conversation
 * on behalf of the nominating studio; the designer's
 * recommendation_note is preserved verbatim so the maker hears the
 * pitch in the designer's own voice rather than a Patina rewrite.
 *
 * Sending is wired by the notifications service (deferred from
 * Sprint 3) — this template is the renderable surface that delivery
 * pulls in.
 */
export const ManufacturerOutreach: React.FC<ManufacturerOutreachProps> = ({
  recipientName,
  vendorName,
  nominatingStudioName,
  recommendationNote,
  fitSignals,
  onboardingUrl,
  patinaContactName,
  patinaContactEmail,
  unsubscribeUrl,
}) => {
  const greeting = recipientName ? `Hello ${recipientName}` : `Hello ${vendorName} team`;

  return (
    <BaseEmailLayout
      preview={`A Patina designer just nominated ${vendorName} for the catalog`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <PadSection style={{ paddingTop: 12 }}>
        <Heading
          as="h1"
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: '24px',
            color: '#2C2926',
            margin: '0 0 12px',
          }}
        >
          A Patina designer has put your name forward
        </Heading>
        <Text style={{ color: '#5C4A3C', fontSize: '15px', lineHeight: '1.6' }}>
          {greeting},
        </Text>
        <Text style={{ color: '#5C4A3C', fontSize: '15px', lineHeight: '1.6' }}>
          {nominatingStudioName} just nominated {vendorName} for the Patina
          Catalog — the shared catalog of makers our designer community
          orders from. Patina handles invoicing, deposit/balance, and the
          designer-facing experience; you keep the manufacturing relationship
          and the wholesale margin.
        </Text>
      </PadSection>

      <Hr style={{ borderTop: '1px solid #E5E2DD', margin: '18px 0' }} />

      <Section style={{ width: '100%' }}>
        <Text
          style={{
            fontFamily: '"DM Mono", ui-monospace, monospace',
            fontSize: '11px',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#C4A57B',
            margin: '0 0 6px',
          }}
        >
          What {nominatingStudioName} said
        </Text>
        <Text
          style={{
            color: '#2C2926',
            fontSize: '15px',
            fontStyle: 'italic',
            lineHeight: '1.6',
            background: 'rgba(196, 165, 123, 0.06)',
            padding: '14px 16px',
            borderRadius: 6,
            margin: 0,
          }}
        >
          &ldquo;{recommendationNote}&rdquo;
        </Text>
        {fitSignals && fitSignals.length > 0 && (
          <Text
            style={{
              color: '#8B7355',
              fontSize: '13px',
              marginTop: 10,
            }}
          >
            Fit signals from {nominatingStudioName}:{' '}
            {fitSignals.map((s) => s.replaceAll('_', ' ')).join(' · ')}
          </Text>
        )}
      </Section>

      <Hr style={{ borderTop: '1px solid #E5E2DD', margin: '18px 0' }} />

      <Section style={{ width: '100%' }}>
        <Heading
          as="h2"
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: '18px',
            color: '#2C2926',
            margin: '0 0 8px',
          }}
        >
          If this sounds like a fit
        </Heading>
        <Text style={{ color: '#5C4A3C', fontSize: '15px', lineHeight: '1.6' }}>
          We&rsquo;ll send a short onboarding flow — your trade terms, your
          lead times, the photos you&rsquo;d like represented. No volume
          commitment. You stay in control of which pieces are on the
          catalog and at what price.
        </Text>
        {onboardingUrl && (
          <Button href={onboardingUrl}>Open the onboarding flow</Button>
        )}
      </Section>

      <Hr style={{ borderTop: '1px solid #E5E2DD', margin: '18px 0' }} />

      <Section style={{ width: '100%' }}>
        <Text style={{ color: '#8B7355', fontSize: '13px', lineHeight: '1.6' }}>
          Questions?{' '}
          {patinaContactName && (
            <>Reach out to {patinaContactName}</>
          )}
          {patinaContactEmail && (
            <> at <a href={`mailto:${patinaContactEmail}`}>{patinaContactEmail}</a></>
          )}
          {!patinaContactName && !patinaContactEmail && (
            <>Reply to this email and we&rsquo;ll get back to you within two business days.</>
          )}
        </Text>
      </Section>
    </BaseEmailLayout>
  );
};

export default ManufacturerOutreach;
