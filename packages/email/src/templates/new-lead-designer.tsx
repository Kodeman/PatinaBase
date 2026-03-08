import * as React from 'react';
import { Text, Heading, Section, Img, Column, Row } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface NewLeadDesignerProps {
  displayName?: string;
  clientName: string;
  projectType: string;
  budgetRange?: string;
  timeline?: string;
  locationCity?: string;
  locationState?: string;
  matchScore?: number;
  matchReasons?: string[];
  roomScanThumbnail?: string;
  styleSummary?: string;
  leadId: string;
  portalUrl?: string;
  responseDeadline?: string;
  unsubscribeUrl?: string;
}

const BUDGET_LABELS: Record<string, string> = {
  under_5k: 'Under $5,000',
  '5k_15k': '$5,000 - $15,000',
  '15k_50k': '$15,000 - $50,000',
  '50k_100k': '$50,000 - $100,000',
  over_100k: '$100,000+',
};

const PROJECT_LABELS: Record<string, string> = {
  full_room: 'Full Room Design',
  consultation: 'Design Consultation',
  single_piece: 'Single Piece Selection',
  staging: 'Home Staging',
};

export const NewLeadDesigner: React.FC<NewLeadDesignerProps> = ({
  displayName,
  clientName,
  projectType,
  budgetRange,
  timeline,
  locationCity,
  locationState,
  matchScore,
  matchReasons,
  roomScanThumbnail,
  styleSummary,
  leadId,
  portalUrl = 'https://admin.patina.cloud',
  responseDeadline,
  unsubscribeUrl,
}) => {
  const greeting = displayName ? `${displayName}, you have a new lead` : 'You have a new lead';
  const location = [locationCity, locationState].filter(Boolean).join(', ');
  const scorePercent = matchScore ? Math.round(matchScore * 100) : null;
  const viewUrl = `${portalUrl}/leads/${leadId}`;

  return (
    <BaseEmailLayout
      preview={`New lead from ${clientName} — ${PROJECT_LABELS[projectType] || projectType}`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={styles.heading}>{greeting}</Heading>

      <Text style={styles.text}>
        <strong>{clientName}</strong> is looking for a designer
        {location ? ` in ${location}` : ''}.
      </Text>

      {/* Room scan thumbnail if available */}
      {roomScanThumbnail && (
        <Section style={styles.imageContainer}>
          <Img
            src={roomScanThumbnail}
            alt="Room scan preview"
            width={520}
            style={styles.roomImage}
          />
        </Section>
      )}

      {/* Project details card */}
      <Section style={styles.detailCard}>
        <Text style={styles.detailTitle}>Project Details</Text>

        <Row>
          <Column style={styles.detailColumn}>
            <Text style={styles.detailLabel}>Project Type</Text>
            <Text style={styles.detailValue}>
              {PROJECT_LABELS[projectType] || projectType}
            </Text>
          </Column>
          {budgetRange && (
            <Column style={styles.detailColumn}>
              <Text style={styles.detailLabel}>Budget</Text>
              <Text style={styles.detailValue}>
                {BUDGET_LABELS[budgetRange] || budgetRange}
              </Text>
            </Column>
          )}
        </Row>

        {(timeline || location) && (
          <Row>
            {timeline && (
              <Column style={styles.detailColumn}>
                <Text style={styles.detailLabel}>Timeline</Text>
                <Text style={styles.detailValue}>
                  {timeline.replace(/_/g, ' ')}
                </Text>
              </Column>
            )}
            {location && (
              <Column style={styles.detailColumn}>
                <Text style={styles.detailLabel}>Location</Text>
                <Text style={styles.detailValue}>{location}</Text>
              </Column>
            )}
          </Row>
        )}
      </Section>

      {/* Compatibility score badge */}
      {scorePercent && (
        <Section style={styles.scoreBadge}>
          <Text style={styles.scoreText}>
            {scorePercent}% compatibility match
          </Text>
          {matchReasons && matchReasons.length > 0 && (
            <Text style={styles.scoreReasons}>
              {matchReasons.slice(0, 3).join(' · ')}
            </Text>
          )}
        </Section>
      )}

      {/* Style summary */}
      {styleSummary && (
        <Text style={styles.styleSummary}>{styleSummary}</Text>
      )}

      <div style={styles.buttonContainer}>
        <Button href={viewUrl}>View Lead</Button>
      </div>

      {responseDeadline && (
        <Text style={styles.deadline}>
          Respond by {responseDeadline} to connect with this client.
        </Text>
      )}
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
  imageContainer: {
    margin: '16px 0',
    borderRadius: '12px',
    overflow: 'hidden' as const,
  },
  roomImage: {
    width: '100%',
    borderRadius: '12px',
    objectFit: 'cover' as const,
  },
  detailCard: {
    backgroundColor: '#FAF7F2',
    borderRadius: '12px',
    padding: '20px',
    margin: '16px 0',
  },
  detailTitle: {
    color: '#2C2926',
    fontSize: '14px',
    fontWeight: '600' as const,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    margin: '0 0 12px 0',
  },
  detailColumn: {
    padding: '0 8px 8px 0',
  },
  detailLabel: {
    color: '#7A736C',
    fontSize: '12px',
    lineHeight: '16px',
    margin: '0 0 2px 0',
  },
  detailValue: {
    color: '#2C2926',
    fontSize: '14px',
    fontWeight: '500' as const,
    lineHeight: '20px',
    margin: '0',
    textTransform: 'capitalize' as const,
  },
  scoreBadge: {
    backgroundColor: '#C4A57B',
    borderRadius: '8px',
    padding: '12px 16px',
    margin: '16px 0',
    textAlign: 'center' as const,
  },
  scoreText: {
    color: '#FFFFFF',
    fontSize: '15px',
    fontWeight: '600' as const,
    margin: '0',
  },
  scoreReasons: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: '12px',
    margin: '4px 0 0 0',
  },
  styleSummary: {
    color: '#6B645D',
    fontSize: '14px',
    lineHeight: '22px',
    fontStyle: 'italic' as const,
    margin: '0 0 16px 0',
  },
  buttonContainer: {
    margin: '24px 0',
    textAlign: 'center' as const,
  },
  deadline: {
    color: '#7A736C',
    fontSize: '13px',
    lineHeight: '20px',
    textAlign: 'center' as const,
    margin: '0',
  },
};

export default NewLeadDesigner;
