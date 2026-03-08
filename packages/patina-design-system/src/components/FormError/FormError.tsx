import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'
import { AlertCircle, CheckCircle, Info, type LucideProps } from 'lucide-react'

// Type helper for Lucide icons to work with React 19
const IconWrapper = ({ Icon, ...props }: { Icon: any } & LucideProps) => <Icon {...props} />

const formErrorVariants = cva(
  'flex items-start gap-2 text-sm transition-all duration-200 animate-in fade-in-0 slide-in-from-top-1',
  {
    variants: {
      variant: {
        error: 'text-destructive',
        success: 'text-green-600',
        info: 'text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'error',
    },
  }
)

export interface FormErrorProps
  extends React.HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof formErrorVariants> {
  /**
   * Show icon based on variant
   */
  showIcon?: boolean
}

const iconMap = {
  error: AlertCircle,
  success: CheckCircle,
  info: Info,
}

/**
 * FormError component for displaying validation messages
 *
 * @example
 * ```tsx
 * <FormError variant="error" showIcon>
 *   Please enter a valid email address
 * </FormError>
 * ```
 */
const FormError = React.forwardRef<HTMLParagraphElement, FormErrorProps>(
  ({ className, variant = 'error', showIcon = true, children, ...props }, ref) => {
    if (!children) return null

    const Icon = variant ? iconMap[variant] : null

    return (
      <p
        ref={ref}
        className={cn(formErrorVariants({ variant, className }))}
        {...props}
      >
        {showIcon && Icon && (
          <IconWrapper Icon={Icon} className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
        )}
        <span>{children}</span>
      </p>
    )
  }
)

FormError.displayName = 'FormError'

export { FormError, formErrorVariants }
