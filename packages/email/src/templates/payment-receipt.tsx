import * as React from 'react';
import { Text, Heading, Section, Hr } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface PaymentReceiptProps {
  displayName?: string;
  receiptId: string;
  amountFormatted: string;
  paymentMethod?: string;
  paymentDate: string;
  description?: string;
  items?: Array<{
    name: string;
    amountFormatted: string;
  }>;
  receiptUrl?: string;
  portalUrl?: string;
}

export const PaymentReceipt: React.FC<PaymentReceiptProps> = ({
  displayName,
  receiptId,
  amountFormatted,
  paymentMethod,
  paymentDate,
  description,
  items,
  receiptUrl,
  portalUrl = 'https://admin.patina.cloud',
}) => {
  return (
    <BaseEmailLayout preview={`Payment receipt — ${amountFormatted}`}>
      <Heading style={styles.heading}>Payment received</Heading>

      <Text style={styles.text}>
        {displayName ? `Hi ${displayName}, your` : 'Your'} payment of{' '}
        <strong>{amountFormatted}</strong> has been processed.
      </Text>

      <Section style={styles.receiptCard}>
        <Text style={styles.receiptTitle}>Receipt</Text>

        <div style={styles.receiptRow}>
          <Text style={styles.receiptLabel}>Receipt ID</Text>
          <Text style={styles.receiptValue}>{receiptId}</Text>
        </div>

        <div style={styles.receiptRow}>
          <Text style={styles.receiptLabel}>Date</Text>
          <Text style={styles.receiptValue}>{paymentDate}</Text>
        </div>

        {paymentMethod && (
          <div style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Payment Method</Text>
            <Text style={styles.receiptValue}>{paymentMethod}</Text>
          </div>
        )}

        {description && (
          <div style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Description</Text>
            <Text style={styles.receiptValue}>{description}</Text>
          </div>
        )}

        {items && items.length > 0 && (
          <>
            <Hr style={styles.divider} />
            {items.map((item, i) => (
              <div key={i} style={styles.itemRow}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemAmount}>{item.amountFormatted}</Text>
              </div>
            ))}
          </>
        )}

        <Hr style={styles.totalDivider} />

        <div style={styles.itemRow}>
          <Text style={styles.totalLabel}>Total Paid</Text>
          <Text style={styles.totalAmount}>{amountFormatted}</Text>
        </div>
      </Section>

      <div style={styles.buttonContainer}>
        <Button href={receiptUrl || `${portalUrl}/billing`}>
          View Receipt
        </Button>
      </div>

      <Text style={styles.smallText}>
        Keep this email for your records. If you have questions about
        this payment, contact us at support@patina.com.
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
  receiptCard: {
    backgroundColor: '#FAF7F2',
    borderRadius: '12px',
    padding: '20px',
    margin: '16px 0',
  },
  receiptTitle: {
    color: '#2C2926',
    fontSize: '14px',
    fontWeight: '600' as const,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    margin: '0 0 16px 0',
  },
  receiptRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
  },
  receiptLabel: {
    color: '#7A736C',
    fontSize: '13px',
    margin: '0',
  },
  receiptValue: {
    color: '#2C2926',
    fontSize: '13px',
    fontWeight: '500' as const,
    margin: '0',
    textAlign: 'right' as const,
  },
  divider: {
    borderColor: '#E8E2DB',
    margin: '12px 0',
  },
  totalDivider: {
    borderColor: '#D4CEC7',
    margin: '12px 0 8px',
  },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
  },
  itemName: {
    color: '#4A453F',
    fontSize: '13px',
    margin: '0',
  },
  itemAmount: {
    color: '#4A453F',
    fontSize: '13px',
    margin: '0',
    textAlign: 'right' as const,
  },
  totalLabel: {
    color: '#2C2926',
    fontSize: '15px',
    fontWeight: '600' as const,
    margin: '0',
  },
  totalAmount: {
    color: '#2C2926',
    fontSize: '15px',
    fontWeight: '600' as const,
    margin: '0',
    textAlign: 'right' as const,
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
    textAlign: 'center' as const,
  },
};

export default PaymentReceipt;
