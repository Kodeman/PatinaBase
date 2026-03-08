import * as React from 'react';
import { Section, Text } from '@react-email/components';

export interface ProvenanceBarProps {
  maker?: string;
  origin?: string;
  material?: string;
}

const BRAND = {
  linen: '#FAF7F2',
  warmGray: '#6B645D',
  deepGold: '#8B7355',
};

export const ProvenanceBar: React.FC<ProvenanceBarProps> = ({
  maker,
  origin,
  material,
}) => {
  const items = [
    maker && `Made by ${maker}`,
    origin && `Origin: ${origin}`,
    material && `Material: ${material}`,
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <Section style={styles.bar}>
      <Text style={styles.text}>
        {items.join('  ·  ')}
      </Text>
    </Section>
  );
};

const styles = {
  bar: {
    backgroundColor: BRAND.linen,
    borderRadius: '8px',
    padding: '12px 16px',
    margin: '16px 0',
  },
  text: {
    color: BRAND.warmGray,
    fontSize: '12px',
    lineHeight: '16px',
    margin: '0',
    textAlign: 'center' as const,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
};

export default ProvenanceBar;
