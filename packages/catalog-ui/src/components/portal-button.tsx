import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';

interface PortalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
  asChild?: boolean;
}

const variantStyles = {
  primary: 'bg-[var(--text-primary)] text-[var(--bg-primary)] hover:bg-patina-mocha',
  secondary:
    'bg-transparent border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
  ghost: 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]',
};

export function PortalButton({
  variant,
  children,
  className = '',
  asChild = false,
  ...props
}: PortalButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={`type-btn-text cursor-pointer rounded-[3px] px-[1.6rem] py-[0.7rem] transition-all disabled:cursor-not-allowed disabled:opacity-50 ${variantStyles[variant]} ${className}`}
      style={{
        transitionDuration: 'var(--duration-fast)',
        transitionTimingFunction: 'var(--ease-default)',
      }}
      {...props}
    >
      {children}
    </Comp>
  );
}
