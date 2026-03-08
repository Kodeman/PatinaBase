import * as React from 'react';
import { Text, Heading, Section, Img, Hr, Column, Row } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface InspirationProduct {
  name: string;
  imageUrl: string;
  priceFormatted: string;
  maker?: string;
  productUrl: string;
  matchReason?: string;
}

export interface WeeklyInspirationProps {
  displayName?: string;
  products: InspirationProduct[];
  designerTip?: string;
  makerSpotlight?: {
    name: string;
    description: string;
    imageUrl?: string;
  };
  browseUrl?: string;
  unsubscribeUrl?: string;
}

export const WeeklyInspiration: React.FC<WeeklyInspirationProps> = ({
  displayName,
  products,
  designerTip,
  makerSpotlight,
  browseUrl = 'https://admin.patina.cloud/catalog',
  unsubscribeUrl,
}) => {
  const greeting = displayName
    ? `Your weekly picks, ${displayName}`
    : 'Your weekly picks';

  return (
    <BaseEmailLayout
      preview={`This week's inspiration: ${products.slice(0, 2).map((p) => p.name).join(', ')}`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={styles.heading}>{greeting}</Heading>

      <Text style={styles.text}>
        Curated pieces matched to your style, handpicked this week.
      </Text>

      {/* Product cards */}
      {products.slice(0, 4).map((product, index) => (
        <Section key={index} style={styles.productCard}>
          {product.imageUrl && (
            <Img
              src={product.imageUrl}
              alt={product.name}
              width={520}
              style={styles.productImage}
            />
          )}
          <div style={styles.productInfo}>
            <Text style={styles.productName}>{product.name}</Text>
            <Row>
              <Column>
                <Text style={styles.productPrice}>{product.priceFormatted}</Text>
              </Column>
              {product.maker && (
                <Column>
                  <Text style={styles.productMaker}>by {product.maker}</Text>
                </Column>
              )}
            </Row>
            {product.matchReason && (
              <Text style={styles.matchReason}>{product.matchReason}</Text>
            )}
            <div style={styles.productButtonContainer}>
              <Button href={product.productUrl} variant="secondary">View</Button>
            </div>
          </div>
          {index < products.length - 1 && <Hr style={styles.divider} />}
        </Section>
      ))}

      {/* Designer tip */}
      {designerTip && (
        <Section style={styles.tipSection}>
          <Text style={styles.tipLabel}>Designer Tip</Text>
          <Text style={styles.tipText}>{designerTip}</Text>
        </Section>
      )}

      {/* Maker spotlight */}
      {makerSpotlight && (
        <Section style={styles.spotlightSection}>
          <Text style={styles.spotlightLabel}>Maker Spotlight</Text>
          {makerSpotlight.imageUrl && (
            <Img
              src={makerSpotlight.imageUrl}
              alt={makerSpotlight.name}
              width={80}
              height={80}
              style={styles.spotlightImage}
            />
          )}
          <Text style={styles.spotlightName}>{makerSpotlight.name}</Text>
          <Text style={styles.spotlightDescription}>
            {makerSpotlight.description}
          </Text>
        </Section>
      )}

      <div style={styles.buttonContainer}>
        <Button href={browseUrl}>Browse Full Catalog</Button>
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
    margin: '0 0 24px 0',
  },
  productCard: {
    margin: '0 0 8px 0',
  },
  productImage: {
    width: '100%',
    borderRadius: '12px',
    objectFit: 'cover' as const,
    marginBottom: '12px',
  },
  productInfo: {
    padding: '0 4px',
  },
  productName: {
    color: '#2C2926',
    fontSize: '16px',
    fontWeight: '600' as const,
    lineHeight: '22px',
    margin: '0 0 4px 0',
  },
  productPrice: {
    color: '#2C2926',
    fontSize: '15px',
    fontWeight: '500' as const,
    margin: '0',
  },
  productMaker: {
    color: '#7A736C',
    fontSize: '13px',
    fontStyle: 'italic' as const,
    margin: '0',
    textAlign: 'right' as const,
  },
  matchReason: {
    color: '#C4A57B',
    fontSize: '12px',
    fontWeight: '500' as const,
    margin: '4px 0 0 0',
  },
  productButtonContainer: {
    margin: '12px 0 0 0',
  },
  divider: {
    borderColor: '#E8E2DB',
    margin: '20px 0',
  },
  tipSection: {
    backgroundColor: '#FAF7F2',
    borderRadius: '12px',
    padding: '16px 20px',
    margin: '24px 0',
  },
  tipLabel: {
    color: '#C4A57B',
    fontSize: '11px',
    fontWeight: '700' as const,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    margin: '0 0 8px 0',
  },
  tipText: {
    color: '#4A453F',
    fontSize: '14px',
    lineHeight: '22px',
    fontStyle: 'italic' as const,
    margin: '0',
  },
  spotlightSection: {
    backgroundColor: '#FAF7F2',
    borderRadius: '12px',
    padding: '20px',
    margin: '16px 0',
    textAlign: 'center' as const,
  },
  spotlightLabel: {
    color: '#C4A57B',
    fontSize: '11px',
    fontWeight: '700' as const,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    margin: '0 0 12px 0',
  },
  spotlightImage: {
    borderRadius: '50%',
    margin: '0 auto 12px auto',
  },
  spotlightName: {
    color: '#2C2926',
    fontSize: '16px',
    fontWeight: '600' as const,
    margin: '0 0 4px 0',
  },
  spotlightDescription: {
    color: '#6B645D',
    fontSize: '13px',
    lineHeight: '20px',
    margin: '0',
  },
  buttonContainer: {
    margin: '24px 0',
    textAlign: 'center' as const,
  },
};

export default WeeklyInspiration;
