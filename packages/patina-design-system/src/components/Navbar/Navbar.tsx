import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const navbarVariants = cva(
  'flex items-center justify-between w-full border-b bg-background',
  {
    variants: {
      variant: {
        default: 'border-border',
        solid: 'bg-primary text-primary-foreground border-transparent',
        transparent: 'bg-transparent border-transparent',
      },
      size: {
        sm: 'h-12 px-4',
        md: 'h-16 px-6',
        lg: 'h-20 px-8',
      },
      sticky: {
        true: 'sticky top-0 z-50',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      sticky: false,
    },
  }
)

export interface NavbarProps
  extends React.ComponentPropsWithoutRef<'nav'>,
    VariantProps<typeof navbarVariants> {
  logo?: React.ReactNode
  children?: React.ReactNode
}

/**
 * Navbar component for main navigation
 *
 * @example
 * ```tsx
 * <Navbar logo={<Logo />} sticky>
 *   <NavbarContent>
 *     <NavbarLink href="/home">Home</NavbarLink>
 *     <NavbarLink href="/about">About</NavbarLink>
 *   </NavbarContent>
 *   <NavbarActions>
 *     <Button>Sign In</Button>
 *   </NavbarActions>
 * </Navbar>
 * ```
 */
const Navbar = React.forwardRef<HTMLElement, NavbarProps>(
  ({ className, variant, size, sticky, logo, children, ...props }, ref) => {
    return (
      <nav
        ref={ref}
        className={cn(navbarVariants({ variant, size, sticky, className }))}
        {...props}
      >
        {logo && <div className="flex items-center shrink-0">{logo}</div>}
        {children}
      </nav>
    )
  }
)
Navbar.displayName = 'Navbar'

const NavbarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center gap-6 flex-1', className)}
    {...props}
  />
))
NavbarContent.displayName = 'NavbarContent'

const NavbarActions = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center gap-2 shrink-0', className)}
    {...props}
  />
))
NavbarActions.displayName = 'NavbarActions'

const navbarLinkVariants = cva(
  'inline-flex items-center gap-2 text-sm font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md px-3 py-2',
  {
    variants: {
      active: {
        true: 'text-foreground bg-accent',
        false: 'text-muted-foreground',
      },
    },
    defaultVariants: {
      active: false,
    },
  }
)

export interface NavbarLinkProps
  extends React.ComponentPropsWithoutRef<'a'>,
    VariantProps<typeof navbarLinkVariants> {
  icon?: React.ReactNode
}

const NavbarLink = React.forwardRef<HTMLAnchorElement, NavbarLinkProps>(
  ({ className, active, icon, children, ...props }, ref) => (
    <a
      ref={ref}
      className={cn(navbarLinkVariants({ active, className }))}
      {...props}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      {children}
    </a>
  )
)
NavbarLink.displayName = 'NavbarLink'

const NavbarBrand = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center gap-2 font-semibold text-lg', className)}
    {...props}
  />
))
NavbarBrand.displayName = 'NavbarBrand'

export { Navbar, NavbarContent, NavbarActions, NavbarLink, NavbarBrand }
