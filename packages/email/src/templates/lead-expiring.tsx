import * as React from 'react';
import { Text, Heading, Section } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface LeadExpiringProps {
  displayName?: string;
  clientName: string;
  projectType: string;
  budgetRange?: string;
  timeRemaining: string;
  leadId: string;
  portalUrl?: string;
  unsubscribeUrl?: string;
}

const PROJECT_LABELS: Record<string, string> = {
  full_room: 'Full Room Design',
  consultation: 'Design Consultation',
  single_piece: 'Single Piece Selection',
  staging: 'Home Staging',
};

const BUDGET_LABELS: Record<string, string> = {
  under_5k: 'Under $5,000',
  '5k_15k': '$5,000 - $15,000',
  '15k_50k': '$15,000 - $50,000',
  '50k_100k': '$50,000 - $100,000',
  over_100k: '$100,000+',
};

export const LeadExpiring: React.FC<LeadExpiringProps> = ({
  displayName,
  clientName,
  projectType,
  budgetRange,
  timeRemaining,
  leadId,
  portalUrl = 'https://admin.patina.cloud',
  unsubscribeUrl,
}) => {
  const viewUrl = `${portalUrl}/leads/${leadId}`;

  return (
    <BaseEmailLayout
      preview={`Lead expiring: ${timeRemaining} left to respond to ${clientName}`}
      unsubscribeUrl={unsubscribeUrl}
    >
      {/* Urgency banner */}
      <Section style={styles.urgencyBanner}>
        <Text style={styles.urgencyText}>{timeRemaining} remaining</Text>
      </Section>

      <Heading style={styles.heading}>
        {displayName ? `${displayName}, don't` : "Don't"} miss this lead
      </Heading>

      <Text style={styles.text}>
        <strong>{clientName}</strong> is waiting for a response about their{' '}
        <strong>{PROJECT_LABELS[projectType] || projectType}</strong> project
        {budgetRange ? ` (${BUDGET_LABELS[budgetRange] || budgetRange})` : ''}.
      </Text>

      <Section style={styles.summaryBox}>
        <Text style={styles.summaryText}>
          Leads that go unanswered are reassigned to other designers.
          Respond now to keep this opportunity.
        </Text>
      </Section>

      <div style={styles.buttonContainer}>
        <Button href={viewUrl} variant="urgent">Respond Now</Button>
      </div>

      <Text style={styles.smallText}>
        You can manage your lead notification preferences in your{' '}
        <a href={`${portalUrl}/settings`} style={styles.link}>settings</a>.
      </Text>
    </BaseEmailLayout>
  );
};

const styles = {
  urgencyBanner: {
    backgroundColor: '#C45B4A',
    borderRadius: '8px',
    padding: '10px 16px',
    margin: '0 0 20px 0',
    textAlign: 'center' as const,
  },
  urgencyText: {
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: '700' as const,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    margin: '0',
  },
  heading: {
    color: '#2C2926',
    fontSize: '24px',
    fontWeight: '600' as const,
    lineHeight: '32px',
    margin: '0 0 16px 0',
  },
  text: {
    color: '#4A453F',
    fontSize: '15px',
    lineHeight: '24px',
    margin: '0 0 16px 0',
  },
  summaryBox: {
    backgroundColor: '#FFF5F3',
    border: '1px solid #E8C4BE',
    borderRadius: '8px',
    padding: '16px',
    margin: '16px 0',
  },
  summaryText: {
    color: '#6B4A42',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '0',
  },
  buttonContainer: {
    margin: '24px 0',
    textAlign: 'center' as const,
  },
  smallText: {
    color: '#7A736C',
    fontSize: '13px',
    lineHeight: '20px',
    textAlign: 'center' as const,
    margin: '0',
  },
  link: {
    color: '#C4A57B',
    textDecoration: 'underline',
  },
};

export default LeadExpiring;
