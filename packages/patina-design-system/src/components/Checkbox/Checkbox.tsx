import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'
import { Check, Minus, type LucideProps } from 'lucide-react'

// Type helper for Lucide icons to work with React 19
const IconWrapper = ({ Icon, ...props }: { Icon: any } & LucideProps) => <Icon {...props} />

const checkboxVariants = cva(
  'peer shrink-0 rounded border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground transition-colors',
  {
    variants: {
      size: {
        sm: 'h-4 w-4',
        md: 'h-5 w-5',
        lg: 'h-6 w-6',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

export interface CheckboxProps
  extends Omit<
      React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
      'checked' | 'onCheckedChange'
    >,
    VariantProps<typeof checkboxVariants> {
  /**
   * The controlled checked state of the checkbox
   */
  checked?: boolean | 'indeterminate'
  /**
   * Event handler called when the checked state changes
   */
  onCheckedChange?: (checked: boolean | 'indeterminate') => void
}

/**
 * Checkbox component built with Radix UI primitives
 *
 * @example
 * ```tsx
 * <Checkbox
 *   checked={isChecked}
 *   onCheckedChange={setIsChecked}
 * />
 * ```
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, size, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(checkboxVariants({ size, className }))}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {props.checked === 'indeterminate' ? (
        <IconWrapper Icon={Minus} className="h-3 w-3" />
      ) : (
        <IconWrapper Icon={Check} className="h-3 w-3" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))

Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox, checkboxVariants }
