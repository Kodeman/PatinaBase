import * as React from 'react';
import { Text, Heading, Link } from '@react-email/components';
import { PadSection } from '../components/PadSection';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface WorkspaceInviteProps {
  /** Recipient's first name (falls back to their email local-part upstream). */
  firstName: string;
  /** Name of the studio owner/admin who sent the invite. */
  inviterName: string;
  /** Name of the studio the recipient is being invited to join. */
  studioName: string;
  /** The accept-invite action link (already carries the invitation token). */
  actionLink: string;
  unsubscribeUrl?: string;
}

/**
 * Studio workspace invitation email. Rendered once to static HTML and seeded
 * into email_templates (slug 'workspace-invite') via migration 00296 — the
 * {{first_name}} / {{inviter_name}} / {{studio_name}} / {{action_link}} tokens
 * in the props are preserved literally in the rendered HTML so the shared
 * render-template interpolator can fill them at send time.
 */
export const WorkspaceInvite: React.FC<WorkspaceInviteProps> = ({
  firstName,
  inviterName,
  studioName,
  actionLink,
  unsubscribeUrl,
}) => {
  return (
    <BaseEmailLayout
      preview={`${inviterName} invited you to join ${studioName} on Patina`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={styles.heading}>You're invited, {firstName}</Heading>

      <Text style={styles.text}>
        <strong>{inviterName}</strong> has invited you to join{' '}
        <strong>{studioName}</strong> on Patina — the workspace where the studio
        keeps its rooms, scans, and project work together.
      </Text>

      <Text style={styles.text}>
        Accept the invitation to set up your account. Everything the studio has
        shared will be waiting for you.
      </Text>

      <div style={styles.buttonContainer}>
        <Button href={actionLink} variant="primary">
          Accept invitation
        </Button>
      </div>

      <PadSection style={styles.fallbackBox}>
        <Text style={styles.fallbackText}>
          This invitation expires in 7 days. If the button doesn't work, copy and
          paste this link into your browser:
        </Text>
        <Text style={styles.fallbackLink}>
          <Link href={actionLink} style={styles.fallbackLinkAnchor}>
            {actionLink}
          </Link>
        </Text>
      </PadSection>

      <Text style={styles.signoff}>— The Patina team</Text>
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
  buttonContainer: {
    margin: '28px 0',
    textAlign: 'center' as const,
  },
  fallbackBox: {
    backgroundColor: '#FAF7F2',
    borderRadius: '12px',
    padding: '16px 20px',
    margin: '16px 0',
  },
  fallbackText: {
    color: '#6B645D',
    fontSize: '13px',
    lineHeight: '20px',
    margin: '0 0 8px 0',
  },
  fallbackLink: {
    margin: '0',
    wordBreak: 'break-all' as const,
  },
  fallbackLinkAnchor: {
    color: '#8B7355',
    fontSize: '13px',
    textDecoration: 'underline',
  },
  signoff: {
    color: '#6B645D',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '24px 0 0 0',
  },
};

export default WorkspaceInvite;
