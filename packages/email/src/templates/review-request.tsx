import * as React from 'react';
import { Text, Heading } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface ReviewRequestProps {
  clientName?: string;
  designerName?: string;
  studioName?: string;
  projectName: string;
  reviewUrl: string;
}

export const ReviewRequest: React.FC<ReviewRequestProps> = ({
  clientName,
  designerName,
  studioName,
  projectName,
  reviewUrl,
}) => {
  const senderDisplay = studioName ?? designerName ?? 'Patina';
  const greeting = clientName ? `Hi ${clientName},` : 'Hi there,';

  return (
    <BaseEmailLayout preview={`How was your experience with ${projectName}?`}>
      <Heading style={styles.heading}>How was your experience?</Heading>
      <Text style={styles.text}>{greeting}</Text>
      <Text style={styles.text}>
        Your {projectName} project is complete and we'd love to hear what you
        thought. Sharing a few words helps {senderDisplay} understand what
        worked and helps future clients make informed decisions.
      </Text>
      <Text style={styles.text}>
        It only takes a minute — click below to leave your feedback.
      </Text>
      <div style={styles.buttonContainer}>
        <Button href={reviewUrl}>Share Your Experience</Button>
      </div>
      <Text style={styles.smallText}>
        Can't click the button? Copy this link into your browser:{' '}
        {reviewUrl}
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

export default ReviewRequest;
