'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { X, Info, CheckCircle2, AlertTriangle, AlertCircle, type LucideProps } from 'lucide-react'
import { cn } from '../../utils/cn'

// Type helper for Lucide icons to work with React 19
const IconWrapper = ({ Icon, ...props }: { Icon: any } & LucideProps) => <Icon {...props} />

const bannerVariants = cva(
  'relative w-full border-l-4 px-6 py-4 text-sm [&>svg]:absolute [&>svg]:left-6 [&>svg]:top-5',
  {
    variants: {
      variant: {
        info: 'bg-blue-50 text-blue-900 border-blue-500 [&>svg]:text-blue-600',
        success: 'bg-green-50 text-green-900 border-green-500 [&>svg]:text-green-600',
        warning: 'bg-yellow-50 text-yellow-900 border-yellow-500 [&>svg]:text-yellow-600',
        error: 'bg-red-50 text-red-900 border-red-500 [&>svg]:text-red-600',
      },
      position: {
        top: 'fixed top-0 left-0 right-0 z-50',
        bottom: 'fixed bottom-0 left-0 right-0 z-50',
        static: 'relative',
      },
    },
    defaultVariants: {
      variant: 'info',
      position: 'static',
    },
  }
)

const variantIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
}

export interface BannerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof bannerVariants> {
  /**
   * Banner title
   */
  title?: string

  /**
   * Banner description/message
   */
  description?: React.ReactNode

  /**
   * Custom icon to override default variant icon
   */
  icon?: React.ReactNode

  /**
   * Whether banner can be dismissed
   */
  closable?: boolean

  /**
   * Callback when banner is closed
   */
  onClose?: () => void

  /**
   * Action button/element
   */
  action?: React.ReactNode
}

/**
 * Banner component for displaying full-width notifications
 *
 * @example
 * ```tsx
 * <Banner
 *   variant="success"
 *   title="Success!"
 *   description="Your changes have been saved."
 * />
 *
 * <Banner
 *   variant="warning"
 *   position="top"
 *   closable
 *   onClose={handleClose}
 *   action={<button>Learn More</button>}
 * >
 *   <BannerTitle>Important Update</BannerTitle>
 *   <BannerDescription>System maintenance scheduled for tonight.</BannerDescription>
 * </Banner>
 * ```
 */
const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
  (
    {
      className,
      variant = 'info',
      position = 'static',
      title,
      description,
      icon,
      closable = false,
      onClose,
      action,
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
        role="region"
        aria-live="polite"
        className={cn(bannerVariants({ variant, position }), className)}
        {...props}
      >
        {icon || (Icon && <IconWrapper Icon={Icon} className="h-5 w-5" />)}
        <div className={cn('flex-1', Icon && 'pl-7')}>
          {title && <BannerTitle>{title}</BannerTitle>}
          {description && <BannerDescription>{description}</BannerDescription>}
          {children}
        </div>
        {action && <div className="ml-auto pl-4">{action}</div>}
        {closable && (
          <button
            type="button"
            onClick={handleClose}
            className="ml-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close banner"
          >
            <IconWrapper Icon={X} className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }
)
Banner.displayName = 'Banner'

const BannerTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
BannerTitle.displayName = 'BannerTitle'

const BannerDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm [&_p]:leading-relaxed', className)}
    {...props}
  />
))
BannerDescription.displayName = 'BannerDescription'

export { Banner, BannerTitle, BannerDescription, bannerVariants }
