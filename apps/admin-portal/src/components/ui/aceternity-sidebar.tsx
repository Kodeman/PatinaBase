'use client';

import React, { useState, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from './button';

// Context for managing sidebar state
interface SidebarContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextType>({
  open: false,
  setOpen: () => {},
  animate: true,
});

// Main Sidebar component
export interface SidebarProps {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  animate?: boolean;
}

export const Sidebar = ({
  children,
  open: controlledOpen,
  setOpen: controlledSetOpen,
  animate = true
}: SidebarProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = controlledSetOpen ?? setUncontrolledOpen;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

// Sidebar Body component
export interface SidebarBodyProps {
  className?: string;
  children: React.ReactNode;
}

export const SidebarBody = ({ className, children }: SidebarBodyProps) => {
  const { open, setOpen, animate } = useContext(SidebarContext);

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              'fixed inset-0 bg-background/80 backdrop-blur-sm lg:hidden z-40'
            )}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Desktop Sidebar - Always visible on desktop */}
      <motion.aside
        className={cn(
          'hidden lg:flex lg:flex-col bg-background border-r',
          'h-screen relative',
          'z-0',
          className
        )}
        animate={
          animate
            ? {
                width: open ? 256 : 60,
              }
            : { width: 256 }
        }
        initial={animate ? { width: 60 } : { width: 256 }}
        transition={{
          duration: 0.3,
          ease: 'easeInOut',
        }}
      >
        <div className="flex flex-col h-full p-4">
          {children}
        </div>
      </motion.aside>

      {/* Mobile Sidebar - Slides in from left */}
      <AnimatePresence>
        {open && (
          <motion.aside
            className={cn(
              'flex lg:hidden flex-col bg-background border-r',
              'fixed left-0 top-0',
              'h-screen',
              'z-50',
              'w-64',
              className
            )}
            initial={{ x: -256 }}
            animate={{ x: 0 }}
            exit={{ x: -256 }}
            transition={{
              duration: 0.3,
              ease: 'easeInOut',
            }}
          >
            <div className="flex flex-col h-full p-4">
              {children}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};

// Sidebar Link component
export interface SidebarLinkProps {
  link: {
    label: string;
    href: string;
    icon?: React.ReactNode;
    badge?: number | string;
  };
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const SidebarLink = ({ link, className, onClick }: SidebarLinkProps) => {
  const { open } = useContext(SidebarContext);

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg',
        'text-sm font-medium',
        'hover:bg-accent hover:text-accent-foreground',
        'transition-colors',
        'w-full text-left',
        'relative group',
        className
      )}
      title={!open ? link.label : undefined}
    >
      {link.icon && <span className="shrink-0">{link.icon}</span>}
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden whitespace-nowrap"
          >
            {link.label}
          </motion.span>
        )}
      </AnimatePresence>
      {link.badge && open && (
        <motion.span
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{ duration: 0.2 }}
          className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground"
        >
          {link.badge}
        </motion.span>
      )}
      {/* Tooltip for collapsed state */}
      {!open && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-sm rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
          {link.label}
        </div>
      )}
    </button>
  );
};

// Logo component
export interface LogoProps {
  children: React.ReactNode;
  className?: string;
}

export const Logo = ({ children, className }: LogoProps) => {
  const { open } = useContext(SidebarContext);

  return (
    <div className={cn('flex items-center gap-2 mb-8', className)}>
      {/* Logo Icon */}
      <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
        {typeof children === 'string' ? children.charAt(0) : 'P'}
      </div>
      {/* Logo Text */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="font-bold text-xl overflow-hidden whitespace-nowrap"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// User Profile component
export interface UserProfileProps {
  user: {
    name?: string;
    email?: string;
    avatar?: string;
  };
  className?: string;
}

export const UserProfile = ({ user, className }: UserProfileProps) => {
  const { open } = useContext(SidebarContext);
  const initials = user.name
    ? user.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <div className={cn('flex items-center gap-3 mt-auto p-3 border-t', className)}>
      {user.avatar ? (
        <img
          src={user.avatar}
          alt={user.name || 'User'}
          className="w-8 h-8 rounded-full shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold shrink-0">
          {initials}
        </div>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 min-w-0 overflow-hidden"
          >
            <p className="text-sm font-medium truncate">{user.name || 'User'}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Export types
export type { SidebarContextType };