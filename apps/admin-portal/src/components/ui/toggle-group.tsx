'use client';

import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { VariantProps, cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const toggleGroupVariants = cva(
  [
    'inline-flex items-center justify-center rounded-sm text-[0.78rem] font-medium',
    'transition-colors',
    'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
    'disabled:pointer-events-none disabled:opacity-50',
    'data-[state=on]:bg-[var(--bg-hover)] data-[state=on]:text-[var(--text-primary)]',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-[var(--border-default)] bg-transparent hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2.5 text-[0.72rem]',
        lg: 'h-10 px-5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleGroupVariants>>({
  size: 'default',
  variant: 'default',
});

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
    VariantProps<typeof toggleGroupVariants>
>(({ className, variant, size, children, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn('inline-flex items-center justify-center gap-1', className)}
    {...props}
  >
    <ToggleGroupContext.Provider value={{ variant, size }}>{children}</ToggleGroupContext.Provider>
  </ToggleGroupPrimitive.Root>
));

ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
    VariantProps<typeof toggleGroupVariants>
>(({ className, children, variant, size, ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        toggleGroupVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className
      )}
      style={{ fontFamily: 'var(--font-body)' }}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
});

ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem, toggleGroupVariants };
