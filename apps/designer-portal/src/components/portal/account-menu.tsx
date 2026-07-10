'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Loader2, LogOut, Settings, Smartphone, User } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@patina/design-system';
import { ConnectFieldModal } from '@/components/portal/connect-field-modal';
import {
  useAvailability,
  useSetAvailability,
  useAvailabilityRealtime,
  AVAILABILITY_STATUSES,
  type AvailabilityStatus,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { authEvents } from '@/lib/analytics/events';

const STATUS_META: Record<AvailabilityStatus, { label: string; color: string }> = {
  online: { label: 'Online', color: 'var(--color-sage)' },
  away: { label: 'Away', color: 'var(--color-golden-hour)' },
  busy: { label: 'Busy', color: 'var(--color-terracotta)' },
  offline: { label: 'Offline', color: 'var(--text-muted)' },
};

const ACCOUNT_LINKS = [
  { label: 'Profile', href: '/portal/profile', icon: User },
  { label: 'Settings', href: '/portal/settings', icon: Settings },
];

function initialsOf(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

interface AccountMenuProps {
  user: { name: string | null; email: string };
}

/**
 * Account-only avatar menu: identity header, declared-status selector,
 * Profile/Settings links, sign out. Replaces the design-system
 * UserStatusMenu (pre-unification styling); business pages (Earnings,
 * Portfolio) live in nav zones and the ⌘K palette, not here.
 */
export function AccountMenu({ user }: AccountMenuProps) {
  const { signOut } = useAuth();
  // Status comes from a client query; render the neutral offline dot until
  // hydration so SSR markup and first client paint match.
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [connectFieldOpen, setConnectFieldOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const { data: status } = useAvailability();
  const setAvailability = useSetAvailability();
  useAvailabilityRealtime();

  const currentStatus: AvailabilityStatus = hydrated ? (status ?? 'online') : 'offline';

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    authEvents.logout();
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
      setIsSigningOut(false);
    }
  }, [signOut]);

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={open}
          className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-warm)] font-mono text-[0.6rem] font-medium uppercase tracking-wider text-[var(--text-body)]">
            {initialsOf(user.name, user.email)}
          </span>
          <span
            aria-hidden="true"
            className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-surface)]"
            style={{ backgroundColor: STATUS_META[currentStatus].color }}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-0">
        {/* Identity */}
        <div className="border-b border-[var(--border-default)] px-4 py-3">
          <p className="font-heading text-sm font-medium text-[var(--text-primary)]">
            {user.name ?? user.email}
          </p>
          {user.name && (
            <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{user.email}</p>
          )}
        </div>

        {/* Declared status */}
        <div className="border-b border-[var(--border-default)] px-3 py-2.5">
          <p className="px-1 pb-1.5 font-mono text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)] opacity-70">
            Status
          </p>
          <div role="radiogroup" aria-label="Availability status" className="grid grid-cols-2 gap-1">
            {AVAILABILITY_STATUSES.map((value) => {
              const selected = currentStatus === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAvailability.mutate(value)}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                    selected
                      ? 'bg-[var(--bg-subtle)] font-medium text-[var(--text-primary)]'
                      : 'text-[var(--text-body)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: STATUS_META[value].color }}
                  />
                  {STATUS_META[value].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Account links */}
        <div className="px-1.5 py-1.5" role="menu">
          {ACCOUNT_LINKS.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[var(--text-body)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <Icon className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
              {label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setConnectFieldOpen(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[var(--text-body)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Smartphone className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
            Connect Patina Field…
          </button>
        </div>

        {/* Sign out */}
        <div className="border-t border-[var(--border-default)] px-1.5 py-1.5">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[var(--color-error)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-60"
          >
            {isSigningOut ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="h-4 w-4" aria-hidden="true" />
            )}
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </PopoverContent>
    </Popover>
    <ConnectFieldModal open={connectFieldOpen} onOpenChange={setConnectFieldOpen} />
    </>
  );
}
