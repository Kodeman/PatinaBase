import * as React from 'react';
import { Text, Heading, Section, Img, Column, Row } from '@react-email/components';
import { BaseEmailLayout } from '../components/BaseEmailLayout';
import { Button } from '../components/Button';
import { ProvenanceBar } from '../components/ProvenanceBar';

export interface SeasonalProduct {
  name: string;
  imageUrl?: string;
  priceFormatted: string;
  maker?: string;
  productUrl?: string;
}

export interface CampaignSeasonalProps {
  season: string;
  headlineText: string;
  bodyText: string;
  moodImageUrl?: string;
  products: SeasonalProduct[];
  ctaUrl: string;
  unsubscribeUrl?: string;
}

export const CampaignSeasonal: React.FC<CampaignSeasonalProps> = ({
  season,
  headlineText,
  bodyText,
  moodImageUrl,
  products,
  ctaUrl,
  unsubscribeUrl,
}) => {
  return (
    <BaseEmailLayout
      preview={`${season}: ${headlineText}`}
      unsubscribeUrl={unsubscribeUrl}
    >
      {/* Season badge */}
      <div style={styles.badgeContainer}>
        <span style={styles.badge}>{season}</span>
      </div>

      {moodImageUrl && (
        <Img
          src={moodImageUrl}
          alt={`${season} mood board`}
          width={520}
          style={styles.moodImage}
        />
      )}

      <Heading style={styles.heading}>{headlineText}</Heading>

      <Text style={styles.bodyText}>{bodyText}</Text>

      {/* 2-column product grid */}
      {products.length > 0 && (
        <Section style={styles.gridSection}>
          {Array.from({ length: Math.ceil(Math.min(products.length, 4) / 2) }).map((_, rowIdx) => (
            <Row key={rowIdx} style={styles.gridRow}>
              {products.slice(rowIdx * 2, rowIdx * 2 + 2).map((product, colIdx) => (
                <Column key={colIdx} style={styles.gridCol}>
                  {product.imageUrl && (
                    <Img
                      src={product.imageUrl}
                      alt={product.name}
                      width={240}
                      style={styles.gridImage}
                    />
                  )}
                  <Text style={styles.gridProductName}>{product.name}</Text>
                  <Text style={styles.gridProductPrice}>{product.priceFormatted}</Text>
                  {product.maker && (
                    <Text style={styles.gridProductMaker}>by {product.maker}</Text>
                  )}
                  <ProvenanceBar maker={product.maker} />
                </Column>
              ))}
            </Row>
          ))}
        </Section>
      )}

      <div style={styles.ctaContainer}>
        <Button href={ctaUrl}>Shop the {season} Collection</Button>
      </div>
    </BaseEmailLayout>
  );
};

const styles = {
  badgeContainer: {
    textAlign: 'center' as const,
    margin: '0 0 20px 0',
  },
  badge: {
    display: 'inline-block' as const,
    backgroundColor: '#2C2926',
    color: '#C4A57B',
    fontSize: '11px',
    fontWeight: '700' as const,
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    padding: '6px 16px',
    borderRadius: '20px',
  },
  moodImage: {
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
  gridSection: {
    margin: '0 0 24px 0',
  },
  gridRow: {
    marginBottom: '16px',
  },
  gridCol: {
    width: '48%',
    verticalAlign: 'top' as const,
    padding: '0 4px',
  },
  gridImage: {
    width: '100%',
    borderRadius: '8px',
    objectFit: 'cover' as const,
    marginBottom: '8px',
  },
  gridProductName: {
    color: '#2C2926',
    fontSize: '14px',
    fontWeight: '600' as const,
    lineHeight: '18px',
    margin: '0 0 2px 0',
  },
  gridProductPrice: {
    color: '#2C2926',
    fontSize: '13px',
    fontWeight: '500' as const,
    margin: '0',
  },
  gridProductMaker: {
    color: '#7A736C',
    fontSize: '12px',
    fontStyle: 'italic' as const,
    margin: '2px 0 0 0',
  },
  ctaContainer: {
    margin: '28px 0',
    textAlign: 'center' as const,
  },
};

export default CampaignSeasonal;
