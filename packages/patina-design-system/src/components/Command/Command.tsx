'use client'

import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'
import { Search, Check } from 'lucide-react'

const commandVariants = cva(
  'flex h-full w-full flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground',
  {
    variants: {
      variant: {
        default: 'border border-border',
        ghost: '',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface CommandProps
  extends React.ComponentPropsWithoutRef<typeof CommandPrimitive>,
    VariantProps<typeof commandVariants> {}

/**
 * Command component for creating command menus, search interfaces, and filterable lists
 *
 * Built with cmdk library and Patina design tokens
 *
 * @example
 * ```tsx
 * <Command>
 *   <CommandInput placeholder="Search..." />
 *   <CommandList>
 *     <CommandEmpty>No results found.</CommandEmpty>
 *     <CommandGroup heading="Suggestions">
 *       <CommandItem>Calendar</CommandItem>
 *       <CommandItem>Search</CommandItem>
 *     </CommandGroup>
 *   </CommandList>
 * </Command>
 * ```
 */
const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  CommandProps
>(({ className, variant, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(commandVariants({ variant, className }))}
    {...props}
  />
))
Command.displayName = CommandPrimitive.displayName

export interface CommandInputProps
  extends React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> {
  /**
   * Show search icon
   * @default true
   */
  showIcon?: boolean
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  CommandInputProps
>(({ className, showIcon = true, ...props }, ref) => (
  <div className="flex items-center border-b border-border px-3" cmdk-input-wrapper="">
    {showIcon && <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />}
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  </div>
))
CommandInput.displayName = CommandPrimitive.Input.displayName

export interface CommandListProps
  extends React.ComponentPropsWithoutRef<typeof CommandPrimitive.List> {}

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  CommandListProps
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)}
    {...props}
  />
))
CommandList.displayName = CommandPrimitive.List.displayName

export interface CommandEmptyProps
  extends React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty> {}

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  CommandEmptyProps
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-6 text-center text-sm text-muted-foreground"
    {...props}
  />
))
CommandEmpty.displayName = CommandPrimitive.Empty.displayName

export interface CommandGroupProps
  extends React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group> {}

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  CommandGroupProps
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
      className
    )}
    {...props}
  />
))
CommandGroup.displayName = CommandPrimitive.Group.displayName

export interface CommandSeparatorProps
  extends React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator> {}

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  CommandSeparatorProps
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 h-px bg-border', className)}
    {...props}
  />
))
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

export interface CommandItemProps
  extends React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item> {
  /**
   * Show selected indicator
   */
  selected?: boolean
  /**
   * Icon to display
   */
  icon?: React.ReactNode
}

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  CommandItemProps
>(({ className, selected, icon, children, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    {selected && (
      <Check className="h-4 w-4 shrink-0 text-primary" />
    )}
    {!selected && icon && (
      <span className="h-4 w-4 shrink-0 inline-flex items-center justify-center">
        {icon}
      </span>
    )}
    <span className="flex-1">{children}</span>
  </CommandPrimitive.Item>
))
CommandItem.displayName = CommandPrimitive.Item.displayName

export interface CommandCheckboxItemProps extends CommandItemProps {
  /**
   * Whether the item is checked
   */
  checked?: boolean
  /**
   * Callback when checked state changes
   */
  onCheckedChange?: (checked: boolean) => void
}

/**
 * CommandCheckboxItem - A command item with checkbox-like behavior
 * Perfect for filter panels and multi-select scenarios
 *
 * @example
 * ```tsx
 * <CommandCheckboxItem
 *   checked={isSelected}
 *   onCheckedChange={setIsSelected}
 * >
 *   Filter option
 * </CommandCheckboxItem>
 * ```
 */
const CommandCheckboxItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  CommandCheckboxItemProps
>(({ className, checked, onCheckedChange, children, icon, ...props }, ref) => {
  const handleSelect = React.useCallback(() => {
    onCheckedChange?.(!checked)
  }, [checked, onCheckedChange])

  return (
    <CommandItem
      ref={ref}
      className={cn(
        'gap-2',
        checked && 'bg-accent/50 text-accent-foreground',
        className
      )}
      onSelect={handleSelect}
      selected={checked}
      icon={icon}
      {...props}
    >
      {children}
    </CommandItem>
  )
})
CommandCheckboxItem.displayName = 'CommandCheckboxItem'

export interface CommandShortcutProps extends React.HTMLAttributes<HTMLSpanElement> {}

const CommandShortcut = ({ className, ...props }: CommandShortcutProps) => {
  return (
    <span
      className={cn(
        'ml-auto text-xs tracking-widest text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}
CommandShortcut.displayName = 'CommandShortcut'

export interface CommandDialogProps extends React.ComponentPropsWithoutRef<'div'> {
  /**
   * Whether the dialog is open
   */
  open?: boolean
  /**
   * Callback when open state changes
   */
  onOpenChange?: (open: boolean) => void
}

/**
 * CommandDialog - A command palette in a dialog
 * Perfect for quick search and navigation
 *
 * @example
 * ```tsx
 * <CommandDialog open={open} onOpenChange={setOpen}>
 *   <CommandInput placeholder="Type a command..." />
 *   <CommandList>
 *     <CommandEmpty>No results found.</CommandEmpty>
 *     <CommandGroup heading="Suggestions">
 *       <CommandItem>Calendar</CommandItem>
 *     </CommandGroup>
 *   </CommandList>
 * </CommandDialog>
 * ```
 */
const CommandDialog = ({ children, open, onOpenChange, ...props }: CommandDialogProps) => {
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange?.(!open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
      onClick={() => onOpenChange?.(false)}
      {...props}
    >
      <div
        className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-0 shadow-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </div>
    </div>
  )
}
CommandDialog.displayName = 'CommandDialog'

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandCheckboxItem,
  CommandShortcut,
  CommandSeparator,
  CommandDialog,
}
