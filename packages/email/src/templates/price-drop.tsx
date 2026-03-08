import * as React from 'react';
import { Text, Heading, Section, Img } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { ProvenanceBar } from '../components/ProvenanceBar';
import { Button } from '../components/Button';

export interface PriceDropProps {
  displayName?: string;
  productName: string;
  productImageUrl?: string;
  oldPriceFormatted: string;
  newPriceFormatted: string;
  savingsFormatted: string;
  savingsPercent?: number;
  maker?: string;
  origin?: string;
  material?: string;
  productUrl: string;
  unsubscribeUrl?: string;
}

export const PriceDrop: React.FC<PriceDropProps> = ({
  displayName,
  productName,
  productImageUrl,
  oldPriceFormatted,
  newPriceFormatted,
  savingsFormatted,
  savingsPercent,
  maker,
  origin,
  material,
  productUrl,
  unsubscribeUrl,
}) => {
  const greeting = displayName
    ? `${displayName}, good news`
    : 'Good news';

  const savingsLabel = savingsPercent
    ? `Save ${savingsFormatted} (${savingsPercent}% off)`
    : `Save ${savingsFormatted}`;

  return (
    <BaseEmailLayout
      preview={`Price drop: ${productName} is now ${newPriceFormatted}`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={styles.heading}>{greeting}</Heading>

      <Text style={styles.text}>
        An item on your wishlist just dropped in price.
      </Text>

      {/* Product hero image */}
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

      {/* Product name */}
      <Text style={styles.productName}>{productName}</Text>

      {/* Price comparison */}
      <Section style={styles.priceSection}>
        <Text style={styles.oldPrice}>{oldPriceFormatted}</Text>
        <Text style={styles.newPrice}>{newPriceFormatted}</Text>
        <Text style={styles.savings}>{savingsLabel}</Text>
      </Section>

      {/* Maker attribution */}
      <ProvenanceBar maker={maker} origin={origin} material={material} />

      <div style={styles.buttonContainer}>
        <Button href={productUrl}>View Deal</Button>
      </div>

      <Text style={styles.footnote}>
        Prices may change. This notification was sent because this item is on your wishlist.
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
    margin: '0 0 8px 0',
    textAlign: 'center' as const,
  },
  priceSection: {
    textAlign: 'center' as const,
    margin: '12px 0 20px 0',
  },
  oldPrice: {
    color: '#7A736C',
    fontSize: '16px',
    textDecoration: 'line-through',
    margin: '0 0 4px 0',
  },
  newPrice: {
    color: '#2C2926',
    fontSize: '28px',
    fontWeight: '700' as const,
    margin: '0 0 4px 0',
  },
  savings: {
    color: '#16a34a',
    fontSize: '14px',
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

export default PriceDrop;
