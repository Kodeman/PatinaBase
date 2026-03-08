import * as React from 'react';
import { Text, Heading, Section, Hr } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface FoundingCircleUpdateProps {
  displayName?: string;
  subject: string;
  progressNarrative: string;
  whatsNew?: string[];
  communityVoice?: {
    quote: string;
    author: string;
    role?: string;
  };
  upcomingPreview?: string;
  portalUrl?: string;
  unsubscribeUrl?: string;
}

export const FoundingCircleUpdate: React.FC<FoundingCircleUpdateProps> = ({
  displayName,
  subject,
  progressNarrative,
  whatsNew,
  communityVoice,
  upcomingPreview,
  portalUrl = 'https://admin.patina.cloud',
  unsubscribeUrl,
}) => {
  const greeting = displayName
    ? `Dear ${displayName}`
    : 'Dear Founding Member';

  return (
    <BaseEmailLayout
      preview={`Founding Circle: ${subject}`}
      unsubscribeUrl={unsubscribeUrl}
    >
      {/* Founding Circle badge */}
      <Section style={styles.badge}>
        <Text style={styles.badgeText}>Founding Circle</Text>
      </Section>

      <Heading style={styles.heading}>{subject}</Heading>

      <Text style={styles.greeting}>{greeting},</Text>

      <Text style={styles.narrative}>{progressNarrative}</Text>

      {/* What's new */}
      {whatsNew && whatsNew.length > 0 && (
        <>
          <Hr style={styles.divider} />
          <Text style={styles.sectionLabel}>What&apos;s New</Text>
          {whatsNew.map((item, index) => (
            <Text key={index} style={styles.listItem}>
              {item}
            </Text>
          ))}
        </>
      )}

      {/* Community voice */}
      {communityVoice && (
        <>
          <Hr style={styles.divider} />
          <Section style={styles.quoteSection}>
            <Text style={styles.quote}>
              &ldquo;{communityVoice.quote}&rdquo;
            </Text>
            <Text style={styles.quoteAuthor}>
              — {communityVoice.author}
              {communityVoice.role ? `, ${communityVoice.role}` : ''}
            </Text>
          </Section>
        </>
      )}

      {/* Upcoming preview */}
      {upcomingPreview && (
        <>
          <Hr style={styles.divider} />
          <Text style={styles.sectionLabel}>Coming Soon</Text>
          <Text style={styles.text}>{upcomingPreview}</Text>
        </>
      )}

      <div style={styles.buttonContainer}>
        <Button href={portalUrl}>Visit Your Portal</Button>
      </div>

      <Text style={styles.closing}>
        Thank you for being part of the journey. Your early support is shaping
        the future of thoughtful interior design.
      </Text>

      <Text style={styles.signature}>
        Warmly,
        <br />
        The Patina Team
      </Text>
    </BaseEmailLayout>
  );
};

const styles = {
  badge: {
    backgroundColor: '#2C2926',
    borderRadius: '6px',
    padding: '6px 14px',
    margin: '0 0 20px 0',
    textAlign: 'center' as const,
    display: 'inline-block' as const,
  },
  badgeText: {
    color: '#C4A57B',
    fontSize: '11px',
    fontWeight: '700' as const,
    letterSpacing: '1.5px',
    textTransform: 'uppercase' as const,
    margin: '0',
  },
  heading: {
    color: '#2C2926',
    fontSize: '24px',
    fontWeight: '600' as const,
    lineHeight: '32px',
    margin: '0 0 20px 0',
  },
  greeting: {
    color: '#2C2926',
    fontSize: '15px',
    lineHeight: '24px',
    margin: '0 0 8px 0',
  },
  narrative: {
    color: '#4A453F',
    fontSize: '15px',
    lineHeight: '26px',
    margin: '0 0 16px 0',
  },
  text: {
    color: '#4A453F',
    fontSize: '15px',
    lineHeight: '24px',
    margin: '0 0 16px 0',
  },
  sectionLabel: {
    color: '#C4A57B',
    fontSize: '11px',
    fontWeight: '700' as const,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    margin: '0 0 12px 0',
  },
  listItem: {
    color: '#4A453F',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '0 0 8px 0',
    paddingLeft: '16px',
    borderLeft: '2px solid #C4A57B',
  },
  divider: {
    borderColor: '#E8E2DB',
    margin: '24px 0',
  },
  quoteSection: {
    backgroundColor: '#FAF7F2',
    borderRadius: '12px',
    padding: '20px 24px',
    margin: '0 0 16px 0',
  },
  quote: {
    color: '#2C2926',
    fontSize: '16px',
    lineHeight: '26px',
    fontStyle: 'italic' as const,
    margin: '0 0 8px 0',
  },
  quoteAuthor: {
    color: '#7A736C',
    fontSize: '13px',
    margin: '0',
  },
  buttonContainer: {
    margin: '24px 0',
    textAlign: 'center' as const,
  },
  closing: {
    color: '#6B645D',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '0 0 16px 0',
  },
  signature: {
    color: '#2C2926',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '0',
  },
};

export default FoundingCircleUpdate;
