import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
  {
    variants: {
      required: {
        true: "after:content-['*'] after:ml-0.5 after:text-destructive",
        false: '',
      },
      optional: {
        true: "after:content-['(optional)'] after:ml-1 after:text-muted-foreground after:font-normal",
        false: '',
      },
    },
    defaultVariants: {
      required: false,
      optional: false,
    },
  }
)

export interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {}

/**
 * Label component using Radix UI primitives
 *
 * @example
 * ```tsx
 * <Label htmlFor="email" required>Email</Label>
 * <Input id="email" />
 * ```
 */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, required, optional, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants({ required, optional }), className)}
    {...props}
  />
))

Label.displayName = LabelPrimitive.Root.displayName

export { Label, labelVariants }
