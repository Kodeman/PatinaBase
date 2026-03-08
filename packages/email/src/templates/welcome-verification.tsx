import * as React from 'react';
import { Text, Heading } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface WelcomeVerificationProps {
  displayName?: string;
  verificationUrl: string;
}

export const WelcomeVerification: React.FC<WelcomeVerificationProps> = ({
  displayName,
  verificationUrl,
}) => {
  const greeting = displayName ? `Welcome, ${displayName}` : 'Welcome to Patina';

  return (
    <BaseEmailLayout preview="Verify your email to get started with Patina">
      <Heading style={styles.heading}>{greeting}</Heading>
      <Text style={styles.text}>
        We're delighted you're here. Patina connects you with exceptional
        furniture — pieces with character, craftsmanship, and stories worth
        telling.
      </Text>
      <Text style={styles.text}>
        Verify your email to unlock your account and start building your
        curated collection.
      </Text>
      <div style={styles.buttonContainer}>
        <Button href={verificationUrl}>Verify My Email</Button>
      </div>
      <Text style={styles.smallText}>
        This link expires in 24 hours. If you didn't create an account,
        you can safely ignore this email.
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

export default WelcomeVerification;
