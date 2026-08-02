import * as React from 'react';
import { Text, Heading, Section, Hr } from '@react-email/components';
import { PadSection } from '../components/PadSection';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface ProjectActivatedProps {
  clientName: string;
  designerName: string;
  projectName: string;
  kickoffDate: string;
  expectedCompletion?: string;
  visibilityTier: 'full' | 'milestone' | 'curated';
  portalUrl?: string;
  unsubscribeUrl?: string;
}

const TIER_DESCRIPTION: Record<ProjectActivatedProps['visibilityTier'], string> = {
  full: 'You\'ll see daily progress, room photos, and updates as they happen.',
  milestone: 'You\'ll get a curated update at the end of each phase, plus any decisions that need your input.',
  curated: `${'designer'} will publish specific updates and the final reveal at completion.`,
};

export const ProjectActivated: React.FC<ProjectActivatedProps> = ({
  clientName,
  designerName,
  projectName,
  kickoffDate,
  expectedCompletion,
  visibilityTier,
  portalUrl = 'https://app.patina.cloud',
  unsubscribeUrl,
}) => {
  const tierDescription = TIER_DESCRIPTION[visibilityTier].replace('designer', designerName);

  return (
    <BaseEmailLayout
      preview={`${projectName} is now live. ${designerName} has kicked things off.`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={styles.heading}>Welcome to {projectName}, {clientName}.</Heading>
      <Text style={styles.text}>
        {designerName} has activated your project. Rooms, schedule, payment milestones, and
        the FF&amp;E pipeline are all in place.
      </Text>

      <PadSection style={styles.metaBox}>
        <MetaRow label="Kickoff" value={new Date(kickoffDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
        {expectedCompletion && (
          <MetaRow
            label="Expected completion"
            value={new Date(expectedCompletion).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          />
        )}
        <MetaRow label="Designer" value={designerName} />
      </PadSection>

      <Heading as="h2" style={styles.subheading}>How updates will reach you</Heading>
      <Text style={styles.text}>{tierDescription}</Text>

      <Hr style={styles.hr} />

      <Section style={styles.cta}>
        <Button href={portalUrl}>Open project</Button>
      </Section>

      <Text style={styles.muted}>
        Questions? Reply to this email and {designerName} will get it directly.
      </Text>
    </BaseEmailLayout>
  );
};

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.metaRow}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={styles.metaValue}>{value}</span>
    </div>
  );
}

const styles = {
  heading: {
    fontFamily: 'Garamond, serif',
    fontSize: '28px',
    fontWeight: 400,
    color: '#2C2926',
    marginBottom: '16px',
  },
  subheading: {
    fontFamily: 'Garamond, serif',
    fontSize: '18px',
    fontWeight: 500,
    color: '#2C2926',
    marginTop: '24px',
    marginBottom: '8px',
  },
  text: {
    fontSize: '15px',
    lineHeight: 1.55,
    color: '#5C4A3C',
    marginBottom: '12px',
  },
  metaBox: {
    backgroundColor: '#FAF7F2',
    border: '1px solid #E5E2DD',
    borderRadius: '4px',
    padding: '16px',
    marginTop: '16px',
    marginBottom: '8px',
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    borderBottom: '1px solid #E5E2DD',
  },
  metaLabel: {
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: '#8B7355',
  },
  metaValue: {
    fontSize: '14px',
    color: '#2C2926',
  },
  hr: {
    borderColor: '#E5E2DD',
    marginTop: '20px',
    marginBottom: '20px',
  },
  cta: {
    width: '100%',
    textAlign: 'center' as const,
    marginTop: '8px',
    marginBottom: '20px',
  },
  muted: {
    fontSize: '13px',
    color: '#8B7355',
    fontStyle: 'italic' as const,
  },
};

export default ProjectActivated;
