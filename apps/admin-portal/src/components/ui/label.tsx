'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, style, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-[0.72rem] font-medium leading-none text-[var(--text-primary)]',
      'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className
    )}
    style={{ fontFamily: 'var(--font-body)', ...style }}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
