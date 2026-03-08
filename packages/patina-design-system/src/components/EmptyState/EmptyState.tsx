import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const emptyStateVariants = cva('flex flex-col items-center justify-center text-center', {
  variants: {
    size: {
      sm: 'py-8 px-4',
      md: 'py-12 px-6',
      lg: 'py-16 px-8',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

export interface EmptyStateProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof emptyStateVariants> {
  /**
   * Icon or illustration to display
   */
  icon?: React.ReactNode

  /**
   * Title of the empty state
   */
  title?: string

  /**
   * Description text
   */
  description?: React.ReactNode

  /**
   * Primary action button/element
   */
  action?: React.ReactNode

  /**
   * Secondary action button/element
   */
  secondaryAction?: React.ReactNode
}

/**
 * EmptyState component for displaying when there is no data
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={<FileIcon className="h-12 w-12" />}
 *   title="No files found"
 *   description="Upload your first file to get started"
 *   action={<Button>Upload File</Button>}
 * />
 *
 * <EmptyState size="lg">
 *   <EmptyStateIcon>
 *     <InboxIcon className="h-16 w-16" />
 *   </EmptyStateIcon>
 *   <EmptyStateTitle>Your inbox is empty</EmptyStateTitle>
 *   <EmptyStateDescription>
 *     When you receive messages, they'll appear here.
 *   </EmptyStateDescription>
 *   <EmptyStateActions>
 *     <Button>Compose Message</Button>
 *   </EmptyStateActions>
 * </EmptyState>
 * ```
 */
const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      className,
      size,
      icon,
      title,
      description,
      action,
      secondaryAction,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(emptyStateVariants({ size }), className)}
        {...props}
      >
        {icon && <EmptyStateIcon>{icon}</EmptyStateIcon>}
        {title && <EmptyStateTitle>{title}</EmptyStateTitle>}
        {description && <EmptyStateDescription>{description}</EmptyStateDescription>}
        {children}
        {(action || secondaryAction) && (
          <EmptyStateActions>
            {action}
            {secondaryAction}
          </EmptyStateActions>
        )}
      </div>
    )
  }
)
EmptyState.displayName = 'EmptyState'

const EmptyStateIcon = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('mb-4 text-muted-foreground', className)}
    {...props}
  />
))
EmptyStateIcon.displayName = 'EmptyStateIcon'

const EmptyStateTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-lg font-semibold tracking-tight text-foreground', className)}
    {...props}
  />
))
EmptyStateTitle.displayName = 'EmptyStateTitle'

const EmptyStateDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('mt-2 text-sm text-muted-foreground max-w-md', className)}
    {...props}
  />
))
EmptyStateDescription.displayName = 'EmptyStateDescription'

const EmptyStateActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('mt-6 flex flex-wrap items-center justify-center gap-2', className)}
    {...props}
  />
))
EmptyStateActions.displayName = 'EmptyStateActions'

export {
  EmptyState,
  EmptyStateIcon,
  EmptyStateTitle,
  EmptyStateDescription,
  EmptyStateActions,
  emptyStateVariants,
}
