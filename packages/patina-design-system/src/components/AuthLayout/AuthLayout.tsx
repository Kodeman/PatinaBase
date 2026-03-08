import * as React from 'react'
import { cn } from '../../utils/cn'

export interface AuthLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Title to display above the content
   */
  title?: string
  /**
   * Description to display below the title
   */
  description?: string
  /**
   * Logo or branding element
   */
  logo?: React.ReactNode
  /**
   * Show default logo
   */
  showDefaultLogo?: boolean
  /**
   * Background pattern or color
   */
  backgroundPattern?: 'none' | 'grid' | 'dots' | 'gradient'
  /**
   * Additional footer content
   */
  footer?: React.ReactNode
  /**
   * Max width of the content container
   */
  maxWidth?: 'sm' | 'md' | 'lg'
}

/**
 * AuthLayout - A consistent layout wrapper for authentication pages
 *
 * Provides a centered, card-based layout for auth forms with optional branding and backgrounds
 *
 * @example
 * ```tsx
 * <AuthLayout
 *   title="Welcome Back"
 *   description="Sign in to your account"
 *   backgroundPattern="gradient"
 * >
 *   <SignInForm />
 * </AuthLayout>
 * ```
 */
export const AuthLayout = React.forwardRef<HTMLDivElement, AuthLayoutProps>(
  (
    {
      className,
      title,
      description,
      logo,
      showDefaultLogo = true,
      backgroundPattern = 'gradient',
      footer,
      maxWidth = 'md',
      children,
      ...props
    },
    ref
  ) => {
    const maxWidthClasses = {
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-lg',
    }

    const backgroundPatterns = {
      none: '',
      grid: 'bg-[linear-gradient(to_right,oklch(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,oklch(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem]',
      dots: 'bg-[radial-gradient(oklch(var(--border))_1px,transparent_1px)] bg-[size:1rem_1rem]',
      gradient: 'bg-gradient-to-br from-primary/5 via-background to-secondary/5',
    }

    const DefaultLogo = () => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-12 w-12 text-primary"
      >
        <path
          d="M12 2L2 7L12 12L22 7L12 2Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 17L12 22L22 17"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 12L12 17L22 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )

    return (
      <div
        ref={ref}
        className={cn(
          'relative flex min-h-screen items-center justify-center px-4 py-12',
          backgroundPatterns[backgroundPattern],
          className
        )}
        {...props}
      >
        {/* Decorative Elements */}
        {backgroundPattern === 'gradient' && (
          <>
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -top-1/2 -right-1/2 h-full w-full rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute -bottom-1/2 -left-1/2 h-full w-full rounded-full bg-secondary/10 blur-3xl" />
            </div>
          </>
        )}

        {/* Content Container */}
        <div className={cn('relative z-10 w-full space-y-6', maxWidthClasses[maxWidth])}>
          {/* Logo and Header */}
          {(showDefaultLogo || logo || title || description) && (
            <div className="text-center space-y-2">
              {(showDefaultLogo || logo) && (
                <div className="flex justify-center mb-4">
                  {logo || <DefaultLogo />}
                </div>
              )}
              {title && (
                <h1 className="text-3xl font-bold text-foreground tracking-tight">
                  {title}
                </h1>
              )}
              {description && (
                <p className="text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          )}

          {/* Main Content */}
          <div className="rounded-lg bg-card p-8 shadow-lg border backdrop-blur-sm">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="text-center">
              {footer}
            </div>
          )}
        </div>
      </div>
    )
  }
)

AuthLayout.displayName = 'AuthLayout'
