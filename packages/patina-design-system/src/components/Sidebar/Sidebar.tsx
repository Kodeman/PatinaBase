'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const sidebarVariants = cva(
  'flex flex-col h-full border-r bg-background transition-all duration-300',
  {
    variants: {
      variant: {
        default: 'border-border',
        solid: 'bg-muted border-transparent',
      },
      size: {
        sm: 'w-48',
        md: 'w-64',
        lg: 'w-80',
      },
      collapsible: {
        true: '',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      collapsible: false,
    },
  }
)

export interface SidebarProps
  extends React.ComponentPropsWithoutRef<'aside'>,
    VariantProps<typeof sidebarVariants> {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

/**
 * Sidebar component for side navigation
 *
 * @example
 * ```tsx
 * <Sidebar>
 *   <SidebarHeader>
 *     <h2>Menu</h2>
 *   </SidebarHeader>
 *   <SidebarContent>
 *     <SidebarNav>
 *       <SidebarNavItem href="/dashboard" icon={<HomeIcon />}>
 *         Dashboard
 *       </SidebarNavItem>
 *       <SidebarNavItem href="/settings">Settings</SidebarNavItem>
 *     </SidebarNav>
 *   </SidebarContent>
 *   <SidebarFooter>
 *     <Button>Logout</Button>
 *   </SidebarFooter>
 * </Sidebar>
 * ```
 */
const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  (
    {
      className,
      variant,
      size,
      collapsible,
      collapsed = false,
      onCollapsedChange,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <aside
        ref={ref}
        className={cn(
          sidebarVariants({ variant, size, collapsible }),
          collapsed && collapsible && 'w-16',
          className
        )}
        data-collapsed={collapsed}
        {...props}
      >
        {children}
      </aside>
    )
  }
)
Sidebar.displayName = 'Sidebar'

const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center gap-2 px-6 py-4 border-b', className)}
    {...props}
  />
))
SidebarHeader.displayName = 'SidebarHeader'

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex-1 overflow-auto py-4', className)} {...props} />
))
SidebarContent.displayName = 'SidebarContent'

const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('px-6 py-4 border-t mt-auto', className)}
    {...props}
  />
))
SidebarFooter.displayName = 'SidebarFooter'

const SidebarNav = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<'nav'>
>(({ className, ...props }, ref) => (
  <nav ref={ref} className={cn('flex flex-col gap-1 px-3', className)} {...props} />
))
SidebarNav.displayName = 'SidebarNav'

const sidebarNavItemVariants = cva(
  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      active: {
        true: 'bg-accent text-accent-foreground',
        false: 'text-muted-foreground',
      },
    },
    defaultVariants: {
      active: false,
    },
  }
)

export interface SidebarNavItemProps
  extends React.ComponentPropsWithoutRef<'a'>,
    VariantProps<typeof sidebarNavItemVariants> {
  icon?: React.ReactNode
  badge?: React.ReactNode
}

const SidebarNavItem = React.forwardRef<HTMLAnchorElement, SidebarNavItemProps>(
  ({ className, active, icon, badge, children, ...props }, ref) => {
    const isCollapsed = React.useContext(SidebarCollapsedContext)

    return (
      <a
        ref={ref}
        className={cn(sidebarNavItemVariants({ active, className }))}
        title={isCollapsed ? (children as string) : undefined}
        {...props}
      >
        {icon && <span className="inline-flex shrink-0">{icon}</span>}
        {!isCollapsed && (
          <>
            <span className="flex-1">{children}</span>
            {badge && <span className="shrink-0">{badge}</span>}
          </>
        )}
      </a>
    )
  }
)
SidebarNavItem.displayName = 'SidebarNavItem'

const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & { title?: string }
>(({ className, title, children, ...props }, ref) => {
  const isCollapsed = React.useContext(SidebarCollapsedContext)

  return (
    <div ref={ref} className={cn('px-3 py-2', className)} {...props}>
      {title && !isCollapsed && (
        <h4 className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h4>
      )}
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
})
SidebarGroup.displayName = 'SidebarGroup'

// Context for collapsed state
const SidebarCollapsedContext = React.createContext(false)

export {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarNav,
  SidebarNavItem,
  SidebarGroup,
  SidebarCollapsedContext,
}
