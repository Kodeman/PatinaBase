import * as React from 'react';
import { Text, Heading, Section } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface SecurityAlertProps {
  displayName?: string;
  alertType: 'new_device' | 'password_changed' | 'email_changed' | 'suspicious_activity';
  deviceInfo?: string;
  ipAddress?: string;
  location?: string;
  timestamp: string;
  secureAccountUrl: string;
}

const ALERT_MESSAGES: Record<string, { title: string; description: string }> = {
  new_device: {
    title: 'New device sign-in',
    description: 'Your account was accessed from a new device.',
  },
  password_changed: {
    title: 'Password changed',
    description: 'Your Patina password was recently changed.',
  },
  email_changed: {
    title: 'Email address updated',
    description: 'The email address on your account was changed.',
  },
  suspicious_activity: {
    title: 'Unusual activity detected',
    description: 'We noticed unusual activity on your account.',
  },
};

export const SecurityAlert: React.FC<SecurityAlertProps> = ({
  displayName,
  alertType,
  deviceInfo,
  ipAddress,
  location,
  timestamp,
  secureAccountUrl,
}) => {
  const alert = ALERT_MESSAGES[alertType] ?? ALERT_MESSAGES.suspicious_activity;

  return (
    <BaseEmailLayout preview={`Security alert: ${alert.title}`}>
      <Heading style={styles.heading}>{alert.title}</Heading>
      <Text style={styles.text}>
        {displayName ? `Hi ${displayName}, ` : ''}
        {alert.description}
      </Text>

      <Section style={styles.detailBox}>
        {deviceInfo && (
          <Text style={styles.detailRow}>
            <strong>Device:</strong> {deviceInfo}
          </Text>
        )}
        {location && (
          <Text style={styles.detailRow}>
            <strong>Location:</strong> {location}
          </Text>
        )}
        {ipAddress && (
          <Text style={styles.detailRow}>
            <strong>IP Address:</strong> {ipAddress}
          </Text>
        )}
        <Text style={styles.detailRow}>
          <strong>Time:</strong> {timestamp}
        </Text>
      </Section>

      <Text style={styles.text}>
        If this was you, no action is needed. If you don't recognize this
        activity, please secure your account immediately.
      </Text>

      <div style={styles.buttonContainer}>
        <Button href={secureAccountUrl} variant="urgent">
          Secure My Account
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
  detailBox: {
    backgroundColor: '#FAF7F2',
    borderRadius: '8px',
    padding: '16px 20px',
    margin: '16px 0',
  },
  detailRow: {
    color: '#4A453F',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '0 0 4px 0',
  },
  buttonContainer: {
    margin: '24px 0',
    textAlign: 'center' as const,
  },
};

export default SecurityAlert;
