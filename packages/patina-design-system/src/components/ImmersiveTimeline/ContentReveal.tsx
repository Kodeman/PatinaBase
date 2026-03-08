'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'
import { useIntersectionReveal } from '../../hooks/useIntersectionReveal'

const revealVariants = cva('transition-all duration-600', {
  variants: {
    animation: {
      fadeIn: 'opacity-0 data-[visible=true]:opacity-100',
      slideUp: 'opacity-0 translate-y-8 data-[visible=true]:opacity-100 data-[visible=true]:translate-y-0',
      slideDown: 'opacity-0 -translate-y-8 data-[visible=true]:opacity-100 data-[visible=true]:translate-y-0',
      slideLeft: 'opacity-0 translate-x-8 data-[visible=true]:opacity-100 data-[visible=true]:translate-x-0',
      slideRight: 'opacity-0 -translate-x-8 data-[visible=true]:opacity-100 data-[visible=true]:translate-x-0',
      scaleIn: 'opacity-0 scale-95 data-[visible=true]:opacity-100 data-[visible=true]:scale-100',
      unfold: 'opacity-0 scale-y-0 origin-top data-[visible=true]:opacity-100 data-[visible=true]:scale-y-100',
    },
    easing: {
      ease: 'ease',
      easeIn: 'ease-in',
      easeOut: 'ease-out',
      easeInOut: 'ease-in-out',
      spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
  },
  defaultVariants: {
    animation: 'fadeIn',
    easing: 'easeOut',
  },
})

export interface ContentRevealProps
  extends React.ComponentPropsWithoutRef<'div'>,
    VariantProps<typeof revealVariants> {
  triggerPoint?: 'early' | 'standard' | 'late' | 'center'
  delay?: number
  triggerOnce?: boolean
  disabled?: boolean
  children: React.ReactNode
}

/**
 * ContentReveal component for progressive disclosure with scroll-triggered animations
 *
 * @example
 * ```tsx
 * <ContentReveal animation="slideUp" triggerPoint="standard">
 *   <h2>This content reveals as you scroll</h2>
 * </ContentReveal>
 * ```
 */
export const ContentReveal = React.forwardRef<HTMLDivElement, ContentRevealProps>(
  (
    {
      className,
      animation,
      easing,
      triggerPoint = 'standard',
      delay = 0,
      triggerOnce = true,
      disabled = false,
      children,
      style,
      ...props
    },
    forwardedRef
  ) => {
    const [ref, isVisible] = useIntersectionReveal<HTMLDivElement>({
      triggerPoint,
      triggerOnce,
      disabled,
    })

    // Merge refs
    React.useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement)

    return (
      <div
        ref={ref}
        data-visible={isVisible}
        className={cn(revealVariants({ animation, easing }), className)}
        style={{
          ...style,
          transitionDelay: `${delay}ms`,
        }}
        {...props}
      >
        {children}
      </div>
    )
  }
)

ContentReveal.displayName = 'ContentReveal'
