import * as React from 'react';
import { Button as EmailButton } from '@react-email/components';

export interface ButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'urgent';
}

const BRAND = {
  warmGold: '#C4A57B',
  deepGold: '#8B7355',
  charcoal: '#2C2926',
  white: '#FFFFFF',
  urgentRed: '#C45B4A',
};

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    backgroundColor: BRAND.warmGold,
    color: BRAND.white,
  },
  secondary: {
    backgroundColor: 'transparent',
    color: BRAND.warmGold,
    border: `2px solid ${BRAND.warmGold}`,
  },
  urgent: {
    backgroundColor: BRAND.urgentRed,
    color: BRAND.white,
  },
};

export const Button: React.FC<ButtonProps> = ({
  href,
  children,
  variant = 'primary',
}) => {
  return (
    <EmailButton
      href={href}
      style={{
        ...styles.base,
        ...variantStyles[variant],
      }}
    >
      {children}
    </EmailButton>
  );
};

const styles = {
  base: {
    display: 'inline-block',
    borderRadius: '24px',
    fontSize: '15px',
    fontWeight: '600' as const,
    textDecoration: 'none',
    textAlign: 'center' as const,
    padding: '14px 32px',
    minHeight: '48px',
    lineHeight: '20px',
  },
};

export default Button;
