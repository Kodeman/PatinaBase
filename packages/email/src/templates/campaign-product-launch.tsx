import * as React from 'react';
import { Text, Heading, Section, Img, Hr, Column, Row } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { ProvenanceBar } from '../components/ProvenanceBar';

export interface LaunchProduct {
  name: string;
  imageUrl?: string;
  priceFormatted: string;
  maker?: string;
  productUrl?: string;
}

export interface CampaignProductLaunchProps {
  headlineText: string;
  bodyText: string;
  heroImageUrl?: string;
  products: LaunchProduct[];
  ctaUrl: string;
  ctaText?: string;
  unsubscribeUrl?: string;
}

export const CampaignProductLaunch: React.FC<CampaignProductLaunchProps> = ({
  headlineText,
  bodyText,
  heroImageUrl,
  products,
  ctaUrl,
  ctaText = 'Explore the Collection',
  unsubscribeUrl,
}) => {
  return (
    <BaseEmailLayout
      preview={headlineText}
      unsubscribeUrl={unsubscribeUrl}
    >
      {heroImageUrl && (
        <Img
          src={heroImageUrl}
          alt="Product launch"
          width={520}
          style={styles.heroImage}
        />
      )}

      <Heading style={styles.heading}>{headlineText}</Heading>

      <Text style={styles.bodyText}>{bodyText}</Text>

      {products.slice(0, 3).map((product, index) => (
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
            <ProvenanceBar maker={product.maker} />
            {product.productUrl && (
              <div style={styles.productButtonContainer}>
                <Button href={product.productUrl} variant="secondary">View Details</Button>
              </div>
            )}
          </div>
          {index < products.length - 1 && <Hr style={styles.divider} />}
        </Section>
      ))}

      <div style={styles.ctaContainer}>
        <Button href={ctaUrl}>{ctaText}</Button>
      </div>
    </BaseEmailLayout>
  );
};

const styles = {
  heroImage: {
    width: '100%',
    borderRadius: '12px',
    objectFit: 'cover' as const,
    marginBottom: '24px',
  },
  heading: {
    color: '#2C2926',
    fontSize: '26px',
    fontWeight: '600' as const,
    lineHeight: '34px',
    margin: '0 0 16px 0',
  },
  bodyText: {
    color: '#4A453F',
    fontSize: '15px',
    lineHeight: '24px',
    margin: '0 0 28px 0',
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
  productButtonContainer: {
    margin: '12px 0 0 0',
  },
  divider: {
    borderColor: '#E8E2DB',
    margin: '20px 0',
  },
  ctaContainer: {
    margin: '28px 0',
    textAlign: 'center' as const,
  },
};

export default CampaignProductLaunch;
