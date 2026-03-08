import * as React from 'react';
import { Text, Heading, Section, Img, Hr } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';

export interface PersonalizedProduct {
  name: string;
  imageUrl?: string;
  priceFormatted: string;
  matchReason?: string;
  productUrl?: string;
}

export interface CampaignReengagementProps {
  displayName?: string;
  daysSinceLastVisit?: number;
  personalizedProducts: PersonalizedProduct[];
  offerText?: string;
  ctaText?: string;
  ctaUrl: string;
  unsubscribeUrl?: string;
}

export const CampaignReengagement: React.FC<CampaignReengagementProps> = ({
  displayName,
  daysSinceLastVisit,
  personalizedProducts,
  offerText,
  ctaText = 'Rediscover Patina',
  ctaUrl,
  unsubscribeUrl,
}) => {
  const greeting = displayName
    ? `We miss you, ${displayName}`
    : 'We miss you';

  return (
    <BaseEmailLayout
      preview={greeting}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={styles.heading}>{greeting}</Heading>

      {daysSinceLastVisit && (
        <Section style={styles.daysCallout}>
          <Text style={styles.daysNumber}>{daysSinceLastVisit}</Text>
          <Text style={styles.daysLabel}>days since your last visit</Text>
        </Section>
      )}

      <Text style={styles.bodyText}>
        A lot has happened since you were last here. We&apos;ve curated some new
        pieces we think you&apos;ll love.
      </Text>

      {/* Offer banner */}
      {offerText && (
        <Section style={styles.offerBanner}>
          <Text style={styles.offerText}>{offerText}</Text>
        </Section>
      )}

      {/* Personalized product picks */}
      {personalizedProducts.slice(0, 3).map((product, index) => (
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
            <Text style={styles.productPrice}>{product.priceFormatted}</Text>
            {product.matchReason && (
              <Text style={styles.matchReason}>{product.matchReason}</Text>
            )}
            {product.productUrl && (
              <div style={styles.productButtonContainer}>
                <Button href={product.productUrl} variant="secondary">View</Button>
              </div>
            )}
          </div>
          {index < personalizedProducts.length - 1 && <Hr style={styles.divider} />}
        </Section>
      ))}

      <div style={styles.ctaContainer}>
        <Button href={ctaUrl}>{ctaText}</Button>
      </div>
    </BaseEmailLayout>
  );
};

const styles = {
  heading: {
    color: '#2C2926',
    fontSize: '26px',
    fontWeight: '600' as const,
    lineHeight: '34px',
    margin: '0 0 16px 0',
  },
  daysCallout: {
    backgroundColor: '#FAF7F2',
    borderRadius: '12px',
    padding: '20px',
    margin: '0 0 20px 0',
    textAlign: 'center' as const,
  },
  daysNumber: {
    color: '#C4A57B',
    fontSize: '36px',
    fontWeight: '700' as const,
    lineHeight: '42px',
    margin: '0',
  },
  daysLabel: {
    color: '#7A736C',
    fontSize: '13px',
    margin: '4px 0 0 0',
  },
  bodyText: {
    color: '#4A453F',
    fontSize: '15px',
    lineHeight: '24px',
    margin: '0 0 24px 0',
  },
  offerBanner: {
    backgroundColor: '#2C2926',
    borderRadius: '12px',
    padding: '16px 24px',
    margin: '0 0 28px 0',
    textAlign: 'center' as const,
  },
  offerText: {
    color: '#C4A57B',
    fontSize: '15px',
    fontWeight: '600' as const,
    margin: '0',
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
  ctaContainer: {
    margin: '28px 0',
    textAlign: 'center' as const,
  },
};

export default CampaignReengagement;
