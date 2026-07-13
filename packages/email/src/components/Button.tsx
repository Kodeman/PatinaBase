import * as React from 'react';
import { Button as EmailButton } from '@react-email/components';
import { COLORS, FONTS } from './brand';

export interface ButtonProps {
  href: string;
  children: React.ReactNode;
  /** primary = ink (default), accent = brass (celebratory), secondary = outline, urgent = rust. */
  variant?: 'primary' | 'accent' | 'secondary' | 'urgent';
}

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    backgroundColor: COLORS.ink,
    color: COLORS.buttonInkText,
    border: `1px solid ${COLORS.ink}`,
  },
  accent: {
    backgroundColor: COLORS.brass,
    color: '#FFFFFF',
    border: `1px solid ${COLORS.brassBorder}`,
  },
  secondary: {
    backgroundColor: COLORS.cardAlt,
    color: COLORS.ink,
    border: `1px solid ${COLORS.line}`,
  },
  urgent: {
    backgroundColor: COLORS.rust,
    color: '#FFFFFF',
    border: `1px solid ${COLORS.rust}`,
  },
};

export const Button: React.FC<ButtonProps> = ({ href, children, variant = 'primary' }) => {
  return (
    <EmailButton href={href} style={{ ...styles.base, ...variantStyles[variant] }}>
      {children}
    </EmailButton>
  );
};

const styles = {
  base: {
    display: 'inline-block',
    borderRadius: '7px',
    fontFamily: FONTS.sans,
    fontSize: '15px',
    fontWeight: '600' as const,
    letterSpacing: '0.01em',
    textDecoration: 'none',
    textAlign: 'center' as const,
    padding: '15px 32px',
    lineHeight: '1',
  },
};

export default Button;
