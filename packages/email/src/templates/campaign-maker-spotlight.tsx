import * as React from 'react';
import { Text, Heading, Section, Img, Hr } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { ProvenanceBar } from '../components/ProvenanceBar';

export interface SpotlightProduct {
  name: string;
  imageUrl?: string;
  priceFormatted: string;
  origin?: string;
  material?: string;
  productUrl?: string;
}

export interface CampaignMakerSpotlightProps {
  makerName: string;
  makerPortraitUrl?: string;
  makerLocation?: string;
  narrativeText: string;
  philosophyQuote?: string;
  products: SpotlightProduct[];
  ctaUrl: string;
  unsubscribeUrl?: string;
}

export const CampaignMakerSpotlight: React.FC<CampaignMakerSpotlightProps> = ({
  makerName,
  makerPortraitUrl,
  makerLocation,
  narrativeText,
  philosophyQuote,
  products,
  ctaUrl,
  unsubscribeUrl,
}) => {
  return (
    <BaseEmailLayout
      preview={`Meet the maker: ${makerName}`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Text style={styles.sectionLabel}>Maker Spotlight</Text>

      {/* Maker portrait */}
      <div style={styles.portraitContainer}>
        {makerPortraitUrl && (
          <Img
            src={makerPortraitUrl}
            alt={makerName}
            width={100}
            height={100}
            style={styles.portrait}
          />
        )}
        <Heading style={styles.makerName}>{makerName}</Heading>
        {makerLocation && (
          <Text style={styles.makerLocation}>{makerLocation}</Text>
        )}
      </div>

      <Text style={styles.narrative}>{narrativeText}</Text>

      {/* Philosophy quote */}
      {philosophyQuote && (
        <Section style={styles.quoteSection}>
          <Text style={styles.quoteText}>&ldquo;{philosophyQuote}&rdquo;</Text>
          <Text style={styles.quoteAttribution}>&mdash; {makerName}</Text>
        </Section>
      )}

      {/* Product list */}
      {products.length > 0 && (
        <>
          <Hr style={styles.divider} />
          <Text style={styles.sectionLabel}>The Collection</Text>
          {products.map((product, index) => (
            <Section key={index} style={styles.productCard}>
              {product.imageUrl && (
                <Img
                  src={product.imageUrl}
                  alt={product.name}
                  width={520}
                  style={styles.productImage}
                />
              )}
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productPrice}>{product.priceFormatted}</Text>
              <ProvenanceBar
                maker={makerName}
                origin={product.origin}
                material={product.material}
              />
              {product.productUrl && (
                <div style={styles.productButtonContainer}>
                  <Button href={product.productUrl} variant="secondary">View Details</Button>
                </div>
              )}
              {index < products.length - 1 && <Hr style={styles.productDivider} />}
            </Section>
          ))}
        </>
      )}

      <div style={styles.ctaContainer}>
        <Button href={ctaUrl}>Explore {makerName}&apos;s Work</Button>
      </div>
    </BaseEmailLayout>
  );
};

const styles = {
  sectionLabel: {
    color: '#C4A57B',
    fontSize: '11px',
    fontWeight: '700' as const,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    margin: '0 0 16px 0',
    textAlign: 'center' as const,
  },
  portraitContainer: {
    textAlign: 'center' as const,
    margin: '0 0 24px 0',
  },
  portrait: {
    borderRadius: '50%',
    margin: '0 auto 12px auto',
    objectFit: 'cover' as const,
  },
  makerName: {
    color: '#2C2926',
    fontSize: '24px',
    fontWeight: '600' as const,
    lineHeight: '32px',
    margin: '0 0 4px 0',
    textAlign: 'center' as const,
  },
  makerLocation: {
    color: '#7A736C',
    fontSize: '14px',
    fontStyle: 'italic' as const,
    margin: '0',
    textAlign: 'center' as const,
  },
  narrative: {
    color: '#4A453F',
    fontSize: '15px',
    lineHeight: '24px',
    margin: '0 0 24px 0',
  },
  quoteSection: {
    backgroundColor: '#FAF7F2',
    borderRadius: '12px',
    padding: '20px 24px',
    margin: '0 0 24px 0',
    textAlign: 'center' as const,
  },
  quoteText: {
    color: '#2C2926',
    fontSize: '16px',
    fontStyle: 'italic' as const,
    lineHeight: '26px',
    margin: '0 0 8px 0',
  },
  quoteAttribution: {
    color: '#7A736C',
    fontSize: '13px',
    margin: '0',
  },
  divider: {
    borderColor: '#E8E2DB',
    margin: '24px 0',
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
    margin: '0 0 8px 0',
  },
  productButtonContainer: {
    margin: '12px 0 0 0',
  },
  productDivider: {
    borderColor: '#E8E2DB',
    margin: '16px 0',
  },
  ctaContainer: {
    margin: '28px 0',
    textAlign: 'center' as const,
  },
};

export default CampaignMakerSpotlight;
