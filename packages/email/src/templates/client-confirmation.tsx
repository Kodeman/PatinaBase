import * as React from 'react';
import { Text, Heading, Section } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface ClientConfirmationProps {
  clientName: string;
  designerName: string;
  projectType: string;
  expectedTimeline?: string;
  nextSteps?: string[];
  portalUrl?: string;
  unsubscribeUrl?: string;
}

const PROJECT_LABELS: Record<string, string> = {
  full_room: 'full room design',
  consultation: 'design consultation',
  single_piece: 'single piece selection',
  staging: 'home staging',
};

export const ClientConfirmation: React.FC<ClientConfirmationProps> = ({
  clientName,
  designerName,
  projectType,
  expectedTimeline,
  nextSteps,
  portalUrl = 'https://admin.patina.cloud',
  unsubscribeUrl,
}) => {
  const defaultNextSteps = [
    `${designerName} will review your project details`,
    'You\'ll receive a personalized response within 24 hours',
    'Once connected, you can share room scans and inspiration directly',
  ];

  const steps = nextSteps ?? defaultNextSteps;

  return (
    <BaseEmailLayout
      preview={`Your consultation request with ${designerName} is confirmed`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={styles.heading}>
        You're connected, {clientName}
      </Heading>

      <Text style={styles.text}>
        Your {PROJECT_LABELS[projectType] || projectType} request has been
        sent to <strong>{designerName}</strong>. They'll be in touch soon.
      </Text>

      {/* Next steps */}
      <Section style={styles.stepsCard}>
        <Text style={styles.stepsTitle}>What happens next</Text>
        {steps.map((step, i) => (
          <Text key={i} style={styles.stepItem}>
            <span style={styles.stepNumber}>{i + 1}</span>
            {step}
          </Text>
        ))}
      </Section>

      {expectedTimeline && (
        <Section style={styles.timelineBox}>
          <Text style={styles.timelineText}>
            Expected response time: <strong>{expectedTimeline}</strong>
          </Text>
        </Section>
      )}

      <Text style={styles.text}>
        In the meantime, explore the Patina catalog to share inspiration
        pieces with your designer.
      </Text>

      <div style={styles.buttonContainer}>
        <Button href={portalUrl} variant="secondary">
          Browse Catalog
        </Button>
      </div>
    </BaseEmailLayout>
  );
};

const styles = {
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
  stepsCard: {
    backgroundColor: '#FAF7F2',
    borderRadius: '12px',
    padding: '20px',
    margin: '16px 0',
  },
  stepsTitle: {
    color: '#2C2926',
    fontSize: '14px',
    fontWeight: '600' as const,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    margin: '0 0 12px 0',
  },
  stepItem: {
    color: '#4A453F',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '0 0 8px 0',
    paddingLeft: '28px',
    position: 'relative' as const,
  },
  stepNumber: {
    position: 'absolute' as const,
    left: '0',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: '#C4A57B',
    color: '#FFFFFF',
    fontSize: '12px',
    fontWeight: '600' as const,
    display: 'inline-flex',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    lineHeight: '20px',
    textAlign: 'center' as const,
  },
  timelineBox: {
    borderLeft: '3px solid #C4A57B',
    paddingLeft: '16px',
    margin: '16px 0',
  },
  timelineText: {
    color: '#6B645D',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '0',
  },
  buttonContainer: {
    margin: '24px 0',
    textAlign: 'center' as const,
  },
};

export default ClientConfirmation;
