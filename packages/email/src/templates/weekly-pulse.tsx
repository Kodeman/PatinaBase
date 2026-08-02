import * as React from 'react';
import { Text, Heading, Section, Hr } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

/**
 * The Weekly Pulse email (The Document, R13). The Pulse's product truth is
 * reassurance arriving where the client lives — the inbox. The body is the
 * prose the designer composed/edited in the margin (compose-pulse-draft);
 * this template wraps it in the journey-set chrome.
 *
 * NOTE (faithful template): built to the @patina/email conventions because
 * the design session's referenced Pulse template was not in the repo. If a
 * designed Pulse template lands, swap the body chrome here — the props
 * contract (clientName / designerName / projectName / body / portalUrl) is
 * what the send route fills.
 */
export interface WeeklyPulseProps {
  clientName: string;
  designerName: string;
  projectName: string;
  /** The composed Pulse prose (already the designer's edited copy). */
  body: string;
  /** The Friday the Pulse covers (ISO date). */
  weekOf?: string;
  portalUrl?: string;
  unsubscribeUrl?: string;
}

export const WeeklyPulse: React.FC<WeeklyPulseProps> = ({
  clientName,
  designerName,
  projectName,
  body,
  weekOf,
  portalUrl = 'https://app.patina.cloud',
  unsubscribeUrl,
}) => {
  const firstName = clientName.trim().split(/\s+/)[0] || clientName;
  const weekLabel = weekOf
    ? new Date(weekOf).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : null;
  // The body is plain prose; render its paragraphs (blank-line separated).
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <BaseEmailLayout
      preview={`This week on ${projectName} — a note from ${designerName}.`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Text style={styles.eyebrow}>
        The Weekly Pulse{weekLabel ? ` · week of ${weekLabel}` : ''}
      </Text>
      <Heading style={styles.heading}>
        {projectName}
      </Heading>
      <Text style={styles.text}>Hi {firstName},</Text>

      {paragraphs.length > 0 ? (
        paragraphs.map((p, i) => (
          <Text key={i} style={styles.text}>
            {p}
          </Text>
        ))
      ) : (
        <Text style={styles.text}>A quiet week on the project — everything is moving as planned.</Text>
      )}

      <Hr style={styles.hr} />

      <Section style={styles.cta}>
        <Button href={portalUrl}>See the project</Button>
      </Section>

      <Text style={styles.muted}>
        — {designerName}. Reply to this email and it reaches {designerName} directly.
      </Text>
    </BaseEmailLayout>
  );
};

const styles = {
  eyebrow: {
    fontFamily: 'Georgia, serif',
    fontSize: '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: '#A8895E',
    marginBottom: '6px',
  },
  heading: {
    fontFamily: 'Garamond, serif',
    fontSize: '28px',
    fontWeight: 400,
    color: '#2C2926',
    marginTop: 0,
    marginBottom: '18px',
  },
  text: {
    fontSize: '15px',
    lineHeight: 1.6,
    color: '#5C4A3C',
    marginBottom: '14px',
  },
  hr: {
    borderColor: '#E5E2DD',
    marginTop: '8px',
    marginBottom: '20px',
  },
  cta: {
    width: '100%',
    textAlign: 'center' as const,
    marginBottom: '20px',
  },
  muted: {
    fontSize: '13px',
    lineHeight: 1.5,
    color: '#8A7B6B',
    fontStyle: 'italic' as const,
  },
};
