import * as React from 'react';
import { Text } from '@react-email/components';
import { PadSection } from './PadSection';
import { COLORS, FONTS } from './brand';

export interface ProvenanceBarProps {
  maker?: string;
  origin?: string;
  material?: string;
}

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
    <PadSection style={styles.bar}>
      <Text style={styles.text}>
        {items.join('  ·  ')}
      </Text>
    </PadSection>
  );
};

const styles = {
  bar: {
    backgroundColor: COLORS.cardAlt,
    border: `1px solid ${COLORS.line}`,
    borderRadius: '10px',
    padding: '12px 16px',
    margin: '16px 0',
  },
  text: {
    fontFamily: FONTS.mono,
    color: COLORS.ink3,
    fontSize: '11px',
    lineHeight: '16px',
    margin: '0',
    textAlign: 'center' as const,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
  },
};

export default ProvenanceBar;
