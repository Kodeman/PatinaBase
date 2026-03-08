import * as React from 'react';
import { Text, Heading } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface PasswordResetProps {
  displayName?: string;
  resetUrl: string;
}

export const PasswordReset: React.FC<PasswordResetProps> = ({
  displayName,
  resetUrl,
}) => {
  return (
    <BaseEmailLayout preview="Reset your Patina password">
      <Heading style={styles.heading}>Reset your password</Heading>
      <Text style={styles.text}>
        {displayName ? `Hi ${displayName}, we` : 'We'} received a request
        to reset your Patina password. Click below to choose a new one.
      </Text>
      <div style={styles.buttonContainer}>
        <Button href={resetUrl}>Reset Password</Button>
      </div>
      <Text style={styles.smallText}>
        This link expires in 1 hour. If you didn't request this, your
        account is secure — no action needed.
      </Text>
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
    margin: '24px 0',
    textAlign: 'center' as const,
  },
  smallText: {
    color: '#7A736C',
    fontSize: '13px',
    lineHeight: '20px',
    margin: '0',
  },
};

export default PasswordReset;
