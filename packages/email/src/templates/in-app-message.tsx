import * as React from 'react';
import { Heading, Text, Section, Img } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface InAppMessageProps {
  /** Logged-in user's name, used in the greeting if present. */
  recipientName?: string;
  /** Sender's display name. */
  senderName: string;
  /** Optional sender avatar URL. */
  senderAvatarUrl?: string | null;
  /** What to show in the body — already truncated to ≤ 200 chars by the dispatch fn. */
  previewBody: string;
  /** Thread kind controls the framing copy: project / vendor brief / direct. */
  threadKind: 'direct' | 'project' | 'vendor_brief' | 'support';
  /** When the thread is project-scoped, render the project name as context. */
  projectTitle?: string | null;
  /** Optional explicit thread title; falls back to "your conversation" copy. */
  threadTitle?: string | null;
  /** Whether this is a mention email (changes copy + accent). */
  isMention?: boolean;
  /** Absolute URL the CTA opens — already role-resolved by the dispatch fn. */
  deepLink: string;
  /** Footer link to mute this specific thread. */
  muteThreadUrl?: string;
  /** Standard preferences page URL. */
  unsubscribeUrl?: string;
}

export const InAppMessage: React.FC<InAppMessageProps> = ({
  recipientName,
  senderName,
  senderAvatarUrl,
  previewBody,
  threadKind,
  projectTitle,
  threadTitle,
  isMention,
  deepLink,
  muteThreadUrl,
  unsubscribeUrl,
}) => {
  const greeting = recipientName ? `${recipientName},` : 'Hello —';
  const headlineLead = isMention
    ? `${senderName} mentioned you`
    : `${senderName} sent you a message`;

  const contextSubtitle = (() => {
    if (threadKind === 'project' && projectTitle) {
      return `In your project: ${projectTitle}`;
    }
    if (threadKind === 'vendor_brief') {
      return projectTitle
        ? `Vendor brief — ${projectTitle}`
        : 'Vendor brief';
    }
    if (threadTitle) return threadTitle;
    return 'Direct message';
  })();

  const previewText = isMention
    ? `${senderName} mentioned you: "${previewBody.slice(0, 90)}"`
    : `${senderName}: ${previewBody.slice(0, 110)}`;

  return (
    <BaseEmailLayout preview={previewText} unsubscribeUrl={unsubscribeUrl}>
      <Text style={styles.greeting}>{greeting}</Text>
      <Heading style={isMention ? styles.headingMention : styles.heading}>
        {headlineLead}
      </Heading>
      <Text style={styles.contextSubtitle}>{contextSubtitle}</Text>

      <Section style={isMention ? styles.bubbleMention : styles.bubble}>
        <table
          role="presentation"
          cellPadding="0"
          cellSpacing="0"
          style={styles.bubbleTable}
        >
          <tbody>
            <tr>
              {senderAvatarUrl ? (
                <td style={styles.avatarCell}>
                  <Img
                    src={senderAvatarUrl}
                    alt={senderName}
                    width={36}
                    height={36}
                    style={styles.avatarImg}
                  />
                </td>
              ) : (
                <td style={styles.avatarCell}>
                  <div style={styles.avatarFallback}>
                    {(senderName[0] ?? '?').toUpperCase()}
                  </div>
                </td>
              )}
              <td style={styles.bodyCell}>
                <Text style={styles.senderLabel}>{senderName}</Text>
                <Text style={styles.bodyText}>{previewBody}</Text>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <div style={styles.buttonContainer}>
        <Button href={deepLink}>
          {isMention ? 'See the mention' : 'Open conversation'}
        </Button>
      </div>

      {muteThreadUrl && (
        <Text style={styles.muteHint}>
          Too much?{' '}
          <a href={muteThreadUrl} style={styles.muteLink}>
            Mute this conversation
          </a>{' '}
          and we'll stop emailing about it.
        </Text>
      )}
    </BaseEmailLayout>
  );
};

const styles = {
  greeting: {
    color: '#7A736C',
    fontSize: '13px',
    margin: '0 0 4px 0',
    letterSpacing: '0.02em',
  },
  heading: {
    color: '#2C2926',
    fontSize: '22px',
    fontWeight: '600' as const,
    lineHeight: '28px',
    margin: '0 0 4px 0',
  },
  headingMention: {
    color: '#A56A3F',
    fontSize: '22px',
    fontWeight: '600' as const,
    lineHeight: '28px',
    margin: '0 0 4px 0',
  },
  contextSubtitle: {
    color: '#7A736C',
    fontSize: '13px',
    margin: '0 0 20px 0',
    fontStyle: 'italic' as const,
  },
  bubble: {
    backgroundColor: '#FAF7F2',
    borderRadius: '12px',
    border: '1px solid #EEE6DB',
    padding: '16px',
    margin: '0 0 24px 0',
  },
  bubbleMention: {
    backgroundColor: '#FBF3EA',
    borderRadius: '12px',
    border: '1px solid #E5D2BB',
    padding: '16px',
    margin: '0 0 24px 0',
  },
  bubbleTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  avatarCell: {
    width: '48px',
    verticalAlign: 'top' as const,
    paddingRight: '12px',
  },
  avatarImg: {
    borderRadius: '50%',
    display: 'block',
  },
  avatarFallback: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: '#C4A57B',
    color: '#FFFFFF',
    fontSize: '15px',
    fontWeight: '600' as const,
    lineHeight: '36px',
    textAlign: 'center' as const,
  },
  bodyCell: {
    verticalAlign: 'top' as const,
  },
  senderLabel: {
    color: '#2C2926',
    fontSize: '13px',
    fontWeight: '600' as const,
    margin: '0 0 4px 0',
  },
  bodyText: {
    color: '#3A3530',
    fontSize: '15px',
    lineHeight: '22px',
    margin: '0',
    whiteSpace: 'pre-wrap' as const,
  },
  buttonContainer: {
    margin: '0 0 24px 0',
    textAlign: 'center' as const,
  },
  muteHint: {
    color: '#7A736C',
    fontSize: '12px',
    lineHeight: '18px',
    margin: '0',
    textAlign: 'center' as const,
  },
  muteLink: {
    color: '#A3927C',
    textDecoration: 'underline',
  },
};

export default InAppMessage;
