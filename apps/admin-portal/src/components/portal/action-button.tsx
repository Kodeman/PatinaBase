'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

type ActionVariant = 'accent' | 'success' | 'danger' | 'muted';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionVariant;
}

const variantClasses: Record<ActionVariant, string> = {
  accent: 'text-[var(--accent-primary)] hover:text-[var(--text-primary)]',
  success: 'text-[var(--color-sage)] hover:text-[var(--text-primary)]',
  danger: 'text-[var(--text-muted)] hover:text-[var(--color-terracotta)]',
  muted: 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
};

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { variant = 'accent', className = '', type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`type-btn-text inline-flex items-center gap-1.5 bg-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    />
  );
});
