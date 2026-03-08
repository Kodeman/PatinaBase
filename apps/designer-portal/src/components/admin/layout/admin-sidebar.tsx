'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  Badge,
  Button,
  ScrollArea,
  cn
} from '@patina/design-system';
import { adminNavItems, type AdminNavItem } from './admin-nav-config';
import { hasCanonicalPermission, hasRole } from '@/lib/rbac';

interface AdminSidebarProps {
  className?: string;
}

export function AdminSidebar({ className }: AdminSidebarProps) {
  const pathname = usePathname();
  const { session } = useAuth();

  // Filter nav items based on permissions and roles
  const visibleNavItems = React.useMemo(() => {
    if (!session) return [];

    return adminNavItems.filter((item) => {
      // Check role requirement
      if (item.role) {
        return hasRole(session, item.role);
      }

      // Check permission requirement
      if (item.permission) {
        return hasCanonicalPermission(session, item.permission);
      }

      // No restrictions, show item
      return true;
    });
  }, [session]);

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin';
    }
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        'flex h-screen w-64 flex-col border-r bg-background',
        className
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary" />
          <div className="flex flex-col">
            <span className="font-heading text-lg font-semibold">Patina</span>
            <span className="text-xs text-muted-foreground">Admin Portal</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={active ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start gap-3 transition-all',
                    active && 'bg-secondary text-secondary-foreground'
                  )}
                  size="sm"
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1 text-left">{item.name}</span>
                </Button>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-4">
        <div className="text-xs text-muted-foreground">
          <div className="font-medium">Admin Portal</div>
          <div className="mt-1">© 2025 Patina</div>
        </div>
      </div>
    </aside>
  );
}
