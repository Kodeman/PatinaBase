'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const tabsVariants = cva('', {
  variants: {
    variant: {
      line: '',
      enclosed: 'border border-border rounded-lg p-1',
      soft: 'bg-muted p-1 rounded-lg',
    },
    orientation: {
      horizontal: 'flex-col',
      vertical: 'flex-row',
    },
  },
  defaultVariants: {
    variant: 'line',
    orientation: 'horizontal',
  },
})

const tabListVariants = cva('flex', {
  variants: {
    variant: {
      line: 'border-b border-border gap-6',
      enclosed: 'gap-1',
      soft: 'gap-1',
    },
    orientation: {
      horizontal: 'flex-row',
      vertical: 'flex-col',
    },
  },
  defaultVariants: {
    variant: 'line',
    orientation: 'horizontal',
  },
})

const tabTriggerVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        line: 'border-b-2 border-transparent hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground',
        enclosed:
          'rounded-md hover:bg-muted data-[state=active]:bg-background data-[state=active]:shadow-sm',
        soft: 'rounded-md hover:bg-background/50 data-[state=active]:bg-background data-[state=active]:shadow-sm',
      },
    },
    defaultVariants: {
      variant: 'line',
    },
  }
)

const tabContentVariants = cva(
  'mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        line: '',
        enclosed: 'p-4',
        soft: 'p-4',
      },
    },
    defaultVariants: {
      variant: 'line',
    },
  }
)

export interface TabsProps
  extends Omit<React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>, 'orientation'>,
    VariantProps<typeof tabsVariants> {
  variant?: 'line' | 'enclosed' | 'soft'
}

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
    VariantProps<typeof tabListVariants> {}

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabTriggerVariants> {
  icon?: React.ReactNode
}

export interface TabsContentProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>,
    VariantProps<typeof tabContentVariants> {
  lazy?: boolean
}

/**
 * Tabs component for organizing content into tabbed panels
 *
 * @example
 * ```tsx
 * <Tabs defaultValue="tab1" variant="line">
 *   <TabsList>
 *     <TabsTrigger value="tab1" icon={<HomeIcon />}>Home</TabsTrigger>
 *     <TabsTrigger value="tab2">Profile</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="tab1">Home content</TabsContent>
 *   <TabsContent value="tab2" lazy>Profile content</TabsContent>
 * </Tabs>
 * ```
 */
const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  TabsProps
>(({ className, variant, orientation, ...props }, ref) => (
  <TabsPrimitive.Root
    ref={ref}
    orientation={orientation || undefined}
    className={cn(tabsVariants({ variant, orientation, className }))}
    {...props}
  />
))
Tabs.displayName = TabsPrimitive.Root.displayName

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant, orientation, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(tabListVariants({ variant, orientation, className }))}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant, icon, children, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(tabTriggerVariants({ variant, className }))}
    {...props}
  >
    {icon && <span className="inline-flex shrink-0">{icon}</span>}
    {children}
  </TabsPrimitive.Trigger>
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  TabsContentProps
>(({ className, variant, lazy = false, children, ...props }, ref) => {
  const [hasBeenActive, setHasBeenActive] = React.useState(!lazy)

  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(tabContentVariants({ variant, className }))}
      onFocus={() => setHasBeenActive(true)}
      {...props}
    >
      {hasBeenActive ? children : null}
    </TabsPrimitive.Content>
  )
})
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
