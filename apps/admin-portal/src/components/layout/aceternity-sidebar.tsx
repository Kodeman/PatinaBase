'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  Logo,
} from '@/components/ui/aceternity-sidebar';
import { UserProfileCard, type UserPresenceStatus } from '@patina/design-system';
import {
  FolderKanban,
  Package,
  ShoppingCart,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminAceternitySidebarProps {
  className?: string;
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
}

export function AdminAceternitySidebar({ className, isOpen, setIsOpen }: AdminAceternitySidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useAuth();
  const sidebarOpen = isOpen ?? true;
  const [userStatus] = useState<UserPresenceStatus>('online');

  // Simplified navigation - only production-ready pages
  // Demo pages are now consolidated under /demo
  const links = [
    {
      label: 'User Management',
      href: '/users',
      icon: <Users className="h-5 w-5" />,
    },
    {
      label: 'Verification Queue',
      href: '/verification',
      icon: <UserCheck className="h-5 w-5" />,
    },
    {
      label: 'Catalog',
      href: '/catalog',
      icon: <Package className="h-5 w-5" />,
    },
    {
      label: 'Projects',
      href: '/projects',
      icon: <FolderKanban className="h-5 w-5" />,
    },
    {
      label: 'Orders',
      href: '/orders',
      icon: <ShoppingCart className="h-5 w-5" />,
    },
    {
      label: 'Demo Workspace',
      href: '/demo',
      icon: <Sparkles className="h-5 w-5" />,
    },
  ];

  // Check if a link is active (current page or a subpage)
  const isLinkActive = (href: string) => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // User data from session - fixes the hardcoded data bug
  const sidebarUser = session?.user
    ? {
        name: session.user.name || session.user.email || 'Admin',
        email: session.user.email ?? undefined,
        avatar: undefined,
        roles: session.user.roles ?? ['admin'],
      }
    : undefined;

  return (
    <Sidebar open={isOpen} setOpen={setIsOpen} animate={true}>
      <SidebarBody className={cn('h-screen', className)}>
        {/* Logo */}
        <Logo>Patina Admin</Logo>

        {/* Navigation Links */}
        <div className="flex flex-col gap-2 flex-1">
          {links.map((link, idx) => (
            <SidebarLink
              key={idx}
              link={link}
              className={cn(
                isLinkActive(link.href) &&
                'bg-sidebar-accent text-sidebar-accent-foreground'
              )}
              onClick={(e) => {
                e.preventDefault();
                router.push(link.href as any);
                // Close mobile sidebar after navigation
                if (window.innerWidth < 1024 && setIsOpen) {
                  setIsOpen(false);
                }
              }}
            />
          ))}
        </div>

        {/* User Profile */}
        {sidebarUser && (
          <UserProfileCard
            user={sidebarUser}
            status={userStatus}
            collapsed={!sidebarOpen}
          />
        )}
      </SidebarBody>
    </Sidebar>
  );
}
