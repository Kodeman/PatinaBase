import * as React from 'react';
import { Text, Heading, Section, Img } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { ProvenanceBar } from '../components/ProvenanceBar';
import { Button } from '../components/Button';

export interface BackInStockProps {
  displayName?: string;
  productName: string;
  productImageUrl?: string;
  priceFormatted?: string;
  maker?: string;
  origin?: string;
  material?: string;
  quantityAvailable?: number;
  productUrl: string;
  unsubscribeUrl?: string;
}

export const BackInStock: React.FC<BackInStockProps> = ({
  displayName,
  productName,
  productImageUrl,
  priceFormatted,
  maker,
  origin,
  material,
  quantityAvailable,
  productUrl,
  unsubscribeUrl,
}) => {
  const greeting = displayName
    ? `${displayName}, it's back`
    : "It's back";

  const scarcityLabel =
    quantityAvailable && quantityAvailable <= 5
      ? `Only ${quantityAvailable} left in stock`
      : quantityAvailable
        ? `${quantityAvailable} available`
        : null;

  return (
    <BaseEmailLayout
      preview={`Back in stock: ${productName}`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={styles.heading}>{greeting}</Heading>

      <Text style={styles.text}>
        A wishlist item you&apos;ve been waiting for is available again.
      </Text>

      {/* Product image */}
      {productImageUrl && (
        <Section style={styles.imageContainer}>
          <Img
            src={productImageUrl}
            alt={productName}
            width={520}
            style={styles.productImage}
          />
        </Section>
      )}

      {/* Product info */}
      <Text style={styles.productName}>{productName}</Text>

      {priceFormatted && (
        <Text style={styles.price}>{priceFormatted}</Text>
      )}

      {/* Scarcity indicator */}
      {scarcityLabel && (
        <Section style={styles.scarcityBadge}>
          <Text style={styles.scarcityText}>{scarcityLabel}</Text>
        </Section>
      )}

      {/* Maker attribution */}
      <ProvenanceBar maker={maker} origin={origin} material={material} />

      <div style={styles.buttonContainer}>
        <Button href={productUrl}>Shop Now</Button>
      </div>

      <Text style={styles.footnote}>
        This notification was sent because this item is on your wishlist.
        Stock is limited and subject to availability.
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
  imageContainer: {
    margin: '16px 0',
    borderRadius: '12px',
    overflow: 'hidden' as const,
  },
  productImage: {
    width: '100%',
    borderRadius: '12px',
    objectFit: 'cover' as const,
  },
  productName: {
    color: '#2C2926',
    fontSize: '18px',
    fontWeight: '600' as const,
    lineHeight: '24px',
    margin: '0 0 4px 0',
    textAlign: 'center' as const,
  },
  price: {
    color: '#2C2926',
    fontSize: '22px',
    fontWeight: '700' as const,
    margin: '0 0 12px 0',
    textAlign: 'center' as const,
  },
  scarcityBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: '8px',
    padding: '8px 16px',
    margin: '12px 0',
    textAlign: 'center' as const,
  },
  scarcityText: {
    color: '#92400E',
    fontSize: '13px',
    fontWeight: '600' as const,
    margin: '0',
  },
  buttonContainer: {
    margin: '24px 0',
    textAlign: 'center' as const,
  },
  footnote: {
    color: '#7A736C',
    fontSize: '12px',
    lineHeight: '18px',
    textAlign: 'center' as const,
    margin: '0',
  },
};

export default BackInStock;
