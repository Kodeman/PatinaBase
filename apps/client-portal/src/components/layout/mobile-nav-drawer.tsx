'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Box } from 'lucide-react';

import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@patina/design-system';

import { NAV_ITEMS } from './nav-config';
import { useAuth } from '../../hooks/use-auth';
import { useRoomScans } from '@patina/supabase';
import { authEvents } from '../../lib/analytics/events';

/**
 * MobileNavDrawer — the `☰` menu shown below `md`, where the desktop link row
 * is hidden. Lists every nav-config destination plus Rooms (when the homeowner
 * has scans) and the account actions, so no section is unreachable on a phone.
 */
export function MobileNavDrawer() {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { data: scans = [] } = useRoomScans(user ? { userId: user.id } : undefined);
  const close = () => setOpen(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const linkClass = (href: string) =>
    `flex items-center gap-3 rounded-md px-3 py-3 text-base transition-colors ${
      isActive(href)
        ? 'bg-[rgba(196,165,123,0.10)] font-medium text-[var(--text-primary)]'
        : 'text-[var(--text-body)] hover:bg-[rgba(196,165,123,0.06)]'
    }`;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          data-testid="mobile-nav-trigger"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-[var(--text-primary)] transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </DrawerTrigger>
      <DrawerContent side="left" className="bg-[var(--bg-surface)] p-0">
        <DrawerHeader className="border-b border-[var(--border-default)] px-5 py-4">
          <DrawerTitle className="font-heading text-lg tracking-wide text-[var(--text-primary)]">
            Patina
          </DrawerTitle>
        </DrawerHeader>
        <nav className="flex flex-col gap-1 overflow-y-auto p-3">
          {NAV_ITEMS.map(({ key, label, href, icon: Icon }) => (
            <Link key={key} href={href} onClick={close} className={linkClass(href)}>
              <Icon className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden />
              {label}
            </Link>
          ))}
          {user && scans.length > 0 ? (
            <Link href="/scans" onClick={close} className={linkClass('/scans')}>
              <Box className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden />
              Rooms
            </Link>
          ) : null}

          <div className="my-2 h-px bg-[var(--border-default)]" />

          <Link href="/account" onClick={close} className={linkClass('/account')}>
            Account
          </Link>
          <Link
            href="/settings/notifications"
            onClick={close}
            className={linkClass('/settings/notifications')}
          >
            Notifications
          </Link>
          <button
            type="button"
            onClick={() => {
              close();
              authEvents.logout();
              void signOut();
            }}
            className="flex items-center gap-3 rounded-md px-3 py-3 text-left text-base text-[var(--text-body)] transition-colors hover:bg-[rgba(196,165,123,0.06)]"
          >
            Sign out
          </button>
        </nav>
      </DrawerContent>
    </Drawer>
  );
}
