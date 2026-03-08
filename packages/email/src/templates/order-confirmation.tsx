import * as React from 'react';
import { Text, Heading, Section, Hr } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface OrderItem {
  name: string;
  quantity: number;
  priceFormatted: string;
  maker?: string;
  imageUrl?: string;
}

export interface OrderConfirmationProps {
  displayName?: string;
  orderId: string;
  items: OrderItem[];
  subtotalFormatted: string;
  taxFormatted?: string;
  shippingFormatted?: string;
  totalFormatted: string;
  estimatedDelivery?: string;
  shippingAddress?: string;
  orderUrl?: string;
  portalUrl?: string;
}

export const OrderConfirmation: React.FC<OrderConfirmationProps> = ({
  displayName,
  orderId,
  items,
  subtotalFormatted,
  taxFormatted,
  shippingFormatted,
  totalFormatted,
  estimatedDelivery,
  shippingAddress,
  orderUrl,
  portalUrl = 'https://admin.patina.cloud',
}) => {
  const greeting = displayName ? `Thank you, ${displayName}` : 'Thank you for your order';

  return (
    <BaseEmailLayout preview={`Order confirmed — #${orderId}`}>
      <Heading style={styles.heading}>{greeting}</Heading>

      <Text style={styles.text}>
        Your order <strong>#{orderId}</strong> has been confirmed.
        We'll send you updates as it progresses.
      </Text>

      {/* Order items */}
      <Section style={styles.itemsCard}>
        <Text style={styles.cardTitle}>Order Summary</Text>

        {items.map((item, i) => (
          <div key={i}>
            <div style={styles.itemRow}>
              <div style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.maker && (
                  <Text style={styles.itemMaker}>by {item.maker}</Text>
                )}
                {item.quantity > 1 && (
                  <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
                )}
              </div>
              <Text style={styles.itemPrice}>{item.priceFormatted}</Text>
            </div>
            {i < items.length - 1 && <Hr style={styles.itemDivider} />}
          </div>
        ))}

        <Hr style={styles.totalDivider} />

        <div style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{subtotalFormatted}</Text>
        </div>
        {taxFormatted && (
          <div style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <Text style={styles.totalValue}>{taxFormatted}</Text>
          </div>
        )}
        {shippingFormatted && (
          <div style={styles.totalRow}>
            <Text style={styles.totalLabel}>Shipping</Text>
            <Text style={styles.totalValue}>{shippingFormatted}</Text>
          </div>
        )}
        <Hr style={styles.itemDivider} />
        <div style={styles.totalRow}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotalValue}>{totalFormatted}</Text>
        </div>
      </Section>

      {/* Delivery info */}
      {(estimatedDelivery || shippingAddress) && (
        <Section style={styles.deliveryCard}>
          {estimatedDelivery && (
            <div>
              <Text style={styles.deliveryLabel}>Estimated Delivery</Text>
              <Text style={styles.deliveryValue}>{estimatedDelivery}</Text>
            </div>
          )}
          {shippingAddress && (
            <div>
              <Text style={styles.deliveryLabel}>Shipping To</Text>
              <Text style={styles.deliveryValue}>{shippingAddress}</Text>
            </div>
          )}
        </Section>
      )}

      <div style={styles.buttonContainer}>
        <Button href={orderUrl || `${portalUrl}/orders/${orderId}`}>
          View Order
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
  itemsCard: {
    backgroundColor: '#FAF7F2',
    borderRadius: '12px',
    padding: '20px',
    margin: '16px 0',
  },
  cardTitle: {
    color: '#2C2926',
    fontSize: '14px',
    fontWeight: '600' as const,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    margin: '0 0 16px 0',
  },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '8px 0',
  },
  itemName: {
    color: '#2C2926',
    fontSize: '14px',
    fontWeight: '500' as const,
    margin: '0',
  },
  itemMaker: {
    color: '#7A736C',
    fontSize: '12px',
    margin: '2px 0 0 0',
  },
  itemQty: {
    color: '#7A736C',
    fontSize: '12px',
    margin: '2px 0 0 0',
  },
  itemPrice: {
    color: '#2C2926',
    fontSize: '14px',
    fontWeight: '500' as const,
    margin: '0',
    textAlign: 'right' as const,
  },
  itemDivider: {
    borderColor: '#E8E2DB',
    margin: '4px 0',
  },
  totalDivider: {
    borderColor: '#D4CEC7',
    margin: '12px 0 8px',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '2px 0',
  },
  totalLabel: {
    color: '#6B645D',
    fontSize: '13px',
    margin: '0',
  },
  totalValue: {
    color: '#4A453F',
    fontSize: '13px',
    margin: '0',
    textAlign: 'right' as const,
  },
  grandTotalLabel: {
    color: '#2C2926',
    fontSize: '15px',
    fontWeight: '600' as const,
    margin: '0',
  },
  grandTotalValue: {
    color: '#2C2926',
    fontSize: '15px',
    fontWeight: '600' as const,
    margin: '0',
    textAlign: 'right' as const,
  },
  deliveryCard: {
    border: '1px solid #E8E2DB',
    borderRadius: '8px',
    padding: '16px',
    margin: '16px 0',
  },
  deliveryLabel: {
    color: '#7A736C',
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    margin: '0 0 4px 0',
  },
  deliveryValue: {
    color: '#2C2926',
    fontSize: '14px',
    margin: '0 0 12px 0',
  },
  buttonContainer: {
    margin: '24px 0',
    textAlign: 'center' as const,
  },
};

export default OrderConfirmation;
