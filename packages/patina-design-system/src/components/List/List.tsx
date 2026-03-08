import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const listVariants = cva('', {
  variants: {
    variant: {
      unordered: 'list-disc',
      ordered: 'list-decimal',
      none: 'list-none',
    },
    spacing: {
      none: 'space-y-0',
      sm: 'space-y-1',
      md: 'space-y-2',
      lg: 'space-y-3',
    },
    stylePosition: {
      inside: 'list-inside',
      outside: 'list-outside',
    },
  },
  defaultVariants: {
    variant: 'unordered',
    spacing: 'md',
    stylePosition: 'outside',
  },
})

export interface ListProps
  extends React.ComponentPropsWithoutRef<'ul'>,
    VariantProps<typeof listVariants> {
  as?: 'ul' | 'ol'
}

export interface ListItemProps extends React.ComponentPropsWithoutRef<'li'> {
  icon?: React.ReactNode
}

/**
 * List component for displaying ordered and unordered lists
 *
 * @example
 * ```tsx
 * <List variant="unordered">
 *   <ListItem>Item 1</ListItem>
 *   <ListItem>Item 2</ListItem>
 * </List>
 * ```
 */
const List = React.forwardRef<HTMLUListElement | HTMLOListElement, ListProps>(
  (
    {
      className,
      variant,
      spacing,
      stylePosition,
      as,
      children,
      ...props
    },
    ref
  ) => {
    const Component = as || (variant === 'ordered' ? 'ol' : 'ul')

    return (
      <Component
        ref={ref as any}
        className={cn(
          listVariants({ variant, spacing, stylePosition }),
          'pl-5',
          className
        )}
        {...props}
      >
        {children}
      </Component>
    )
  }
)
List.displayName = 'List'

const ListItem = React.forwardRef<HTMLLIElement, ListItemProps>(
  ({ className, icon, children, ...props }, ref) => {
    if (icon) {
      return (
        <li ref={ref} className={cn('flex items-start gap-2', className)} {...props}>
          <span className="mt-0.5 inline-flex shrink-0">{icon}</span>
          <span className="flex-1">{children}</span>
        </li>
      )
    }

    return (
      <li ref={ref} className={cn(className)} {...props}>
        {children}
      </li>
    )
  }
)
ListItem.displayName = 'ListItem'

export { List, ListItem }
