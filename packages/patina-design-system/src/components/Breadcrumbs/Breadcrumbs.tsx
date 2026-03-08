import * as React from 'react'
import { cn } from '../../utils/cn'

export interface BreadcrumbItem {
  label: string
  href?: string
  icon?: React.ReactNode
  current?: boolean
}

export interface BreadcrumbsProps extends React.ComponentPropsWithoutRef<'nav'> {
  items: BreadcrumbItem[]
  separator?: React.ReactNode
  maxItems?: number
  itemsBeforeCollapse?: number
  itemsAfterCollapse?: number
  onItemClick?: (item: BreadcrumbItem, index: number) => void
}

/**
 * Breadcrumbs component for showing hierarchical navigation
 *
 * @example
 * ```tsx
 * <Breadcrumbs
 *   items={[
 *     { label: 'Home', href: '/' },
 *     { label: 'Products', href: '/products' },
 *     { label: 'Shoes', current: true }
 *   ]}
 *   separator="/"
 * />
 * ```
 */
const Breadcrumbs = React.forwardRef<HTMLElement, BreadcrumbsProps>(
  (
    {
      items,
      separator = '/',
      maxItems,
      itemsBeforeCollapse = 1,
      itemsAfterCollapse = 1,
      onItemClick,
      className,
      ...props
    },
    ref
  ) => {
    const shouldCollapse = maxItems && items.length > maxItems

    const getDisplayItems = () => {
      if (!shouldCollapse) return items

      const beforeItems = items.slice(0, itemsBeforeCollapse)
      const afterItems = items.slice(-itemsAfterCollapse)
      const collapsedItems = items.slice(itemsBeforeCollapse, -itemsAfterCollapse)

      return [
        ...beforeItems,
        {
          label: '...',
          collapsed: true,
          collapsedItems,
        } as BreadcrumbItem & { collapsed: boolean; collapsedItems: BreadcrumbItem[] },
        ...afterItems,
      ]
    }

    const displayItems = getDisplayItems()

    return (
      <nav
        ref={ref}
        aria-label="Breadcrumb"
        className={cn('flex items-center', className)}
        {...props}
      >
        <ol className="flex items-center gap-2">
          {displayItems.map((item, index) => {
            const isLast = index === displayItems.length - 1
            const isCurrent = item.current || isLast
            const isCollapsed = 'collapsed' in item && item.collapsed

            return (
              <li key={index} className="flex items-center gap-2">
                {isCollapsed ? (
                  <span className="text-sm text-muted-foreground">...</span>
                ) : (
                  <>
                    {item.href && !isCurrent ? (
                      <a
                        href={item.href}
                        onClick={(e) => {
                          if (onItemClick) {
                            e.preventDefault()
                            onItemClick(item, index)
                          }
                        }}
                        className={cn(
                          'inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-foreground',
                          isCurrent ? 'text-foreground' : 'text-muted-foreground'
                        )}
                        aria-current={isCurrent ? 'page' : undefined}
                      >
                        {item.icon && (
                          <span className="inline-flex shrink-0">{item.icon}</span>
                        )}
                        {item.label}
                      </a>
                    ) : (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-sm font-medium',
                          isCurrent ? 'text-foreground' : 'text-muted-foreground'
                        )}
                        aria-current={isCurrent ? 'page' : undefined}
                      >
                        {item.icon && (
                          <span className="inline-flex shrink-0">{item.icon}</span>
                        )}
                        {item.label}
                      </span>
                    )}
                  </>
                )}

                {!isLast && (
                  <span
                    className="text-sm text-muted-foreground select-none"
                    aria-hidden="true"
                  >
                    {typeof separator === 'string' ? separator : separator}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
    )
  }
)
Breadcrumbs.displayName = 'Breadcrumbs'

export { Breadcrumbs }
