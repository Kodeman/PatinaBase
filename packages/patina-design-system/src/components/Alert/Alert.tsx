'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { X, Info, CheckCircle2, AlertTriangle, AlertCircle, type LucideProps } from 'lucide-react'
import { cn } from '../../utils/cn'

// Type helper for Lucide icons to work with React 19
const IconWrapper = ({ Icon, ...props }: { Icon: any } & LucideProps) => <Icon {...props} />

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        info: 'bg-blue-50 text-blue-900 border-blue-200 [&>svg]:text-blue-600',
        success: 'bg-green-50 text-green-900 border-green-200 [&>svg]:text-green-600',
        warning: 'bg-yellow-50 text-yellow-900 border-yellow-200 [&>svg]:text-yellow-600',
        error: 'bg-red-50 text-red-900 border-red-200 [&>svg]:text-red-600',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  }
)

const variantIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
}

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /**
   * Alert title
   */
  title?: string

  /**
   * Alert description/message
   */
  description?: React.ReactNode

  /**
   * Custom icon to override default variant icon
   */
  icon?: React.ReactNode

  /**
   * Whether alert can be dismissed
   */
  closable?: boolean

  /**
   * Callback when alert is closed
   */
  onClose?: () => void
}

/**
 * Alert component for displaying important messages to users
 *
 * @example
 * ```tsx
 * <Alert variant="success" title="Success!" description="Your changes have been saved." />
 * <Alert variant="error" closable onClose={handleClose}>
 *   <AlertTitle>Error</AlertTitle>
 *   <AlertDescription>There was a problem with your request.</AlertDescription>
 * </Alert>
 * ```
 */
const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      className,
      variant = 'info',
      title,
      description,
      icon,
      closable = false,
      onClose,
      children,
      ...props
    },
    ref
  ) => {
    const [isVisible, setIsVisible] = React.useState(true)

    const handleClose = () => {
      setIsVisible(false)
      onClose?.()
    }

    if (!isVisible) return null

    const Icon = icon ? null : variantIcons[variant || 'info']

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        {icon || (Icon && <IconWrapper Icon={Icon} className="h-4 w-4" />)}
        <div className="flex-1">
          {title && <AlertTitle>{title}</AlertTitle>}
          {description && <AlertDescription>{description}</AlertDescription>}
          {children}
        </div>
        {closable && (
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close alert"
          >
            <IconWrapper Icon={X} className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }
)
Alert.displayName = 'Alert'

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
))
AlertTitle.displayName = 'AlertTitle'

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm [&_p]:leading-relaxed', className)}
    {...props}
  />
))
AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertTitle, AlertDescription, alertVariants }
