'use client';

import React, { useState, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../Button';

// Context for managing sidebar state
interface SidebarContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextType>({
  open: true,
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
  const [uncontrolledOpen, setUncontrolledOpen] = useState(true);

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

export const SidebarBody = ({ className, children, ...props }: SidebarBodyProps) => {
  return (
    <>
      <DesktopSidebar className={className} {...props}>
        {children}
      </DesktopSidebar>
      <MobileSidebar className={className} {...props}>
        {children}
      </MobileSidebar>
    </>
  );
};

// Desktop Sidebar
const DesktopSidebar = ({ className, children, ...props }: SidebarBodyProps) => {
  const { open, setOpen, animate } = useContext(SidebarContext);

  return (
    <motion.div
      className={cn(
        'hidden md:flex md:flex-col h-full px-4 py-6 bg-sidebar border-r border-sidebar-border relative overflow-hidden',
        className
      )}
      animate={{
        width: animate ? (open ? '240px' : '60px') : '240px',
      }}
      initial={{ width: '240px' }}
      transition={{
        duration: 0.3,
        ease: 'easeInOut',
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      role="navigation"
      aria-label="Main navigation"
      {...props}
    >
      {/* Gradient overlay for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(135deg,
            oklch(var(--sidebar) / 0.1) 0%,
            oklch(var(--primary) / 0.05) 100%)`
        }}
      />

      <div className="relative z-10 flex flex-col h-full">
        {children}
      </div>
    </motion.div>
  );
};

// Mobile Sidebar
const MobileSidebar = ({ className, children }: SidebarBodyProps) => {
  const { open, setOpen } = useContext(SidebarContext);

  return (
    <>
      {/* Mobile toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden fixed top-4 left-4 z-50"
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation menu"
      >
        <motion.svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-sidebar-foreground"
        >
          <motion.path
            d="M4 6h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            animate={{
              rotate: open ? 45 : 0,
              y: open ? 8 : 0
            }}
            transition={{ duration: 0.2 }}
          />
          <motion.path
            d="M4 12h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            animate={{
              opacity: open ? 0 : 1
            }}
            transition={{ duration: 0.2 }}
          />
          <motion.path
            d="M4 18h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            animate={{
              rotate: open ? -45 : 0,
              y: open ? -8 : 0
            }}
            transition={{ duration: 0.2 }}
          />
        </motion.svg>
      </Button>

      <AnimatePresence>
        {open && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/20 md:hidden z-40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />

            {/* Mobile sidebar */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 30,
              }}
              className={cn(
                'md:hidden fixed left-0 top-0 h-full w-64 z-50 flex flex-col px-4 py-6',
                'bg-sidebar border-r border-sidebar-border shadow-xl',
                className
              )}
              role="navigation"
              aria-label="Mobile navigation"
            >
              {children}
            </motion.div>
          </>
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
    badge?: number;
  };
  className?: string;
  onClick?: () => void;
}

export const SidebarLink = ({ link, className, onClick }: SidebarLinkProps) => {
  const { open, animate } = useContext(SidebarContext);

  return (
    <a
      href={link.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 py-2 px-3 rounded-lg',
        'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'transition-all duration-200 ease-in-out',
        'focus:outline-none focus:ring-2 focus:ring-sidebar-ring focus:ring-offset-2 focus:ring-offset-sidebar',
        className
      )}
    >
      {/* Icon with Patina primary color on hover */}
      <motion.div
        className="flex-shrink-0"
        whileHover={{
          scale: 1.1,
          rotate: [0, -10, 10, -10, 0],
        }}
        transition={{
          duration: 0.3,
          ease: 'easeInOut',
        }}
      >
        {link.icon || <Link className="h-5 w-5" />}
      </motion.div>

      {/* Label with animation */}
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{
              opacity: animate ? 1 : 1,
              width: animate ? 'auto' : 'auto'
            }}
            exit={{ opacity: 0, width: 0 }}
            transition={{
              duration: 0.2,
              ease: 'easeInOut',
            }}
            className="text-sm font-medium whitespace-nowrap overflow-hidden"
          >
            {link.label}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Badge with Patina primary color */}
      {link.badge !== undefined && link.badge > 0 && (
        <AnimatePresence>
          {open && (
            <motion.span
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full',
                'text-[10px] font-bold',
                'bg-primary text-primary-foreground'
              )}
              style={{
                backgroundColor: 'oklch(var(--primary))',
                color: 'oklch(var(--primary-foreground))',
              }}
            >
              {link.badge}
            </motion.span>
          )}
        </AnimatePresence>
      )}
    </a>
  );
};

// Logo component for sidebar header
export interface LogoProps {
  children?: React.ReactNode;
  className?: string;
}

export const Logo = ({ children, className }: LogoProps) => {
  const { open } = useContext(SidebarContext);

  return (
    <div className={cn('flex items-center gap-2 mb-8', className)}>
      {/* Patina logo with clay-beige accent */}
      <div
        className="h-8 w-8 rounded-lg flex-shrink-0"
        style={{
          background: `linear-gradient(135deg,
            oklch(var(--primary)) 0%,
            oklch(var(--primary) / 0.8) 100%)`,
        }}
      />

      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="font-heading text-lg font-bold text-sidebar-foreground whitespace-nowrap overflow-hidden"
          >
            {children || 'Patina'}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};

// User Profile component for sidebar footer
export interface UserProfileProps {
  user?: {
    name: string;
    email?: string;
    avatar?: string;
  };
  className?: string;
}

export const UserProfile = ({ user, className }: UserProfileProps) => {
  const { open } = useContext(SidebarContext);

  if (!user) return null;

  return (
    <div className={cn('mt-auto pt-4 border-t border-sidebar-border', className)}>
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                backgroundColor: 'oklch(var(--secondary))',
                color: 'oklch(var(--secondary-foreground))',
              }}
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* User info */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="text-sm font-medium text-sidebar-foreground">
                {user.name}
              </div>
              {user.email && (
                <div className="text-xs text-sidebar-foreground/60">
                  {user.email}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// Export all components
export default {
  Sidebar,
  SidebarBody,
  SidebarLink,
  Logo,
  UserProfile,
};