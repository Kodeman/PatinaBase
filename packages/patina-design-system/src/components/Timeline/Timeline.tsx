import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const timelineVariants = cva('flex flex-col', {
  variants: {
    variant: {
      default: '',
      compact: 'gap-2',
      comfortable: 'gap-6',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

export interface TimelineItem {
  id: string
  title: string
  description?: string
  timestamp?: string
  icon?: React.ReactNode
  status?: 'completed' | 'current' | 'upcoming'
}

export interface TimelineProps
  extends React.ComponentPropsWithoutRef<'div'>,
    VariantProps<typeof timelineVariants> {
  items: TimelineItem[]
}

/**
 * Timeline component for displaying events in chronological order
 *
 * @example
 * ```tsx
 * const items = [
 *   { id: '1', title: 'Order placed', timestamp: '2 hours ago', status: 'completed' },
 *   { id: '2', title: 'Processing', timestamp: '1 hour ago', status: 'current' },
 *   { id: '3', title: 'Shipped', status: 'upcoming' },
 * ]
 *
 * <Timeline items={items} />
 * ```
 */
const Timeline = React.forwardRef<HTMLDivElement, TimelineProps>(
  ({ className, variant, items, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(timelineVariants({ variant, className }))} {...props}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          const status = item.status || 'upcoming'

          return (
            <div key={item.id} className="flex gap-4">
              {/* Timeline marker */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2',
                    status === 'completed' &&
                      'border-primary bg-primary text-primary-foreground',
                    status === 'current' &&
                      'border-primary bg-background text-primary',
                    status === 'upcoming' &&
                      'border-muted-foreground/20 bg-background text-muted-foreground'
                  )}
                >
                  {item.icon ? (
                    <span className="inline-flex shrink-0">{item.icon}</span>
                  ) : status === 'completed' ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-current" />
                  )}
                </div>
                {!isLast && (
                  <div
                    className={cn(
                      'w-0.5 flex-1 min-h-[40px]',
                      status === 'completed' ? 'bg-primary' : 'bg-border'
                    )}
                  />
                )}
              </div>

              {/* Timeline content */}
              <div className="flex-1 pb-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-medium text-sm">{item.title}</h4>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {item.description}
                      </p>
                    )}
                  </div>
                  {item.timestamp && (
                    <time className="text-xs text-muted-foreground whitespace-nowrap">
                      {item.timestamp}
                    </time>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }
)
Timeline.displayName = 'Timeline'

export { Timeline }
