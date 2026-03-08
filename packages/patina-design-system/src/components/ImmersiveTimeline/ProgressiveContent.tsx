'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { useIntersectionReveal } from '../../hooks/useIntersectionReveal'

export interface ProgressiveContentProps extends React.ComponentPropsWithoutRef<'div'> {
  loadingStrategy?: 'eager' | 'lazy' | 'viewport'
  placeholder?: React.ReactNode
  minHeight?: number
  children: React.ReactNode
}

/**
 * ProgressiveContent - Loads content progressively based on visibility
 * Useful for heavy content like media galleries or complex components
 *
 * @example
 * ```tsx
 * <ProgressiveContent loadingStrategy="viewport" minHeight={400}>
 *   <ExpensiveComponent />
 * </ProgressiveContent>
 * ```
 */
export const ProgressiveContent = React.forwardRef<HTMLDivElement, ProgressiveContentProps>(
  (
    {
      className,
      loadingStrategy = 'viewport',
      placeholder,
      minHeight,
      children,
      style,
      ...props
    },
    forwardedRef
  ) => {
    const [ref, isVisible, _entry] = useIntersectionReveal<HTMLDivElement>({
      triggerPoint: 'early',
      triggerOnce: true,
      disabled: loadingStrategy === 'eager',
    })

    const [shouldRender, setShouldRender] = React.useState(loadingStrategy === 'eager')

    // Merge refs
    React.useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement)

    React.useEffect(() => {
      if (isVisible && !shouldRender) {
        // Small delay to ensure smooth rendering
        const timer = setTimeout(() => {
          setShouldRender(true)
        }, 50)

        return () => clearTimeout(timer)
      }
      return undefined
    }, [isVisible, shouldRender])

    return (
      <div
        ref={ref}
        className={cn('relative', className)}
        style={{
          ...style,
          minHeight: minHeight ? `${minHeight}px` : undefined,
        }}
        {...props}
      >
        {shouldRender ? (
          children
        ) : (
          <>
            {placeholder || (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent" />
              </div>
            )}
          </>
        )}
      </div>
    )
  }
)

ProgressiveContent.displayName = 'ProgressiveContent'
