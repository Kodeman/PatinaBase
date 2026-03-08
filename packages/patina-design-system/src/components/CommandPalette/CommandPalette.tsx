import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '../../utils/cn'

export interface CommandPaletteProps
  extends React.ComponentPropsWithoutRef<typeof CommandPrimitive> {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * CommandPalette component using cmdk
 * Press Cmd+K (Mac) or Ctrl+K (Windows/Linux) to open
 *
 * @example
 * ```tsx
 * <CommandPalette open={open} onOpenChange={setOpen}>
 *   <CommandPaletteInput placeholder="Search..." />
 *   <CommandPaletteList>
 *     <CommandPaletteEmpty>No results found.</CommandPaletteEmpty>
 *     <CommandPaletteGroup heading="Suggestions">
 *       <CommandPaletteItem onSelect={() => {}}>
 *         Calendar
 *       </CommandPaletteItem>
 *     </CommandPaletteGroup>
 *   </CommandPaletteList>
 * </CommandPalette>
 * ```
 */
const CommandPalette = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  CommandPaletteProps
>(({ className, open, onOpenChange, children, ...props }, ref) => {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <CommandPrimitive
            ref={ref}
            className={cn(
              'flex h-full w-full flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg',
              className
            )}
            {...props}
          >
            {children}
          </CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
})
CommandPalette.displayName = 'CommandPalette'

const CommandPaletteInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b px-3">
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
      className="mr-2 h-4 w-4 shrink-0 opacity-50"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  </div>
))
CommandPaletteInput.displayName = 'CommandPaletteInput'

const CommandPaletteList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)}
    {...props}
  />
))
CommandPaletteList.displayName = 'CommandPaletteList'

const CommandPaletteEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className={cn('py-6 text-center text-sm text-muted-foreground', className)}
    {...props}
  />
))
CommandPaletteEmpty.displayName = 'CommandPaletteEmpty'

const CommandPaletteGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
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
CommandPaletteGroup.displayName = 'CommandPaletteGroup'

const CommandPaletteSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 h-px bg-border', className)}
    {...props}
  />
))
CommandPaletteSeparator.displayName = 'CommandPaletteSeparator'

const CommandPaletteItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  />
))
CommandPaletteItem.displayName = 'CommandPaletteItem'

const CommandPaletteShortcut = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<'span'>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      'ml-auto text-xs tracking-widest text-muted-foreground',
      className
    )}
    {...props}
  />
))
CommandPaletteShortcut.displayName = 'CommandPaletteShortcut'

export {
  CommandPalette,
  CommandPaletteInput,
  CommandPaletteList,
  CommandPaletteEmpty,
  CommandPaletteGroup,
  CommandPaletteSeparator,
  CommandPaletteItem,
  CommandPaletteShortcut,
}
