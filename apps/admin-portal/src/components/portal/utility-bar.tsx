'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { PROFILE_MENU_ITEMS } from '@/config/navigation';

function initialsFor(source: string) {
  const s = source.trim();
  if (!s) return '??';
  const parts = s.split(/[\s@]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

export function UtilityBar() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
      setIsSigningOut(false);
    }
  }, [signOut]);

  if (!user) return null;

  const displayName = user.name?.trim() || user.email;
  const showEmailSub = !!user.name?.trim() && user.name !== user.email;
  const initials = initialsFor(displayName);
  const roles = user.roles ?? [];
  const items = PROFILE_MENU_ITEMS.filter((i) => i.action !== 'sign-out');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="group flex items-center gap-2.5 rounded-sm px-2 py-1.5 transition-colors hover:bg-[var(--bg-hover)]"
          aria-label="Open profile menu"
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] font-mono text-[0.55rem] tracking-[0.08em] text-[var(--accent-primary)]">
            {initials}
          </span>
          <span
            className="hidden max-w-[160px] truncate text-[0.72rem] text-[var(--text-primary)] lg:inline"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {displayName}
          </span>
          <ChevronDown className="h-3 w-3 text-[var(--text-muted)] transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[220px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-0 shadow-[0_4px_16px_rgba(44,41,38,0.06)]"
      >
        <div className="px-3 pb-2.5 pt-3">
          <div
            className="truncate text-[0.85rem] font-medium text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {displayName}
          </div>
          {showEmailSub && (
            <div className="truncate text-[0.7rem] text-[var(--text-muted)]">{user.email}</div>
          )}
          {roles.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {roles.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center rounded-sm border border-[var(--border-subtle)] px-1.5 py-[1px] font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[var(--text-muted)]"
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>

        <DropdownMenuSeparator className="my-0 bg-[var(--border-subtle)]" />

        <div className="py-1">
          {items.map((item) => (
            <DropdownMenuItem
              key={item.label}
              onSelect={(e) => {
                e.preventDefault();
                router.push(item.href as any);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-none px-3 py-1.5 text-[0.78rem] text-[var(--text-body)] outline-none transition-colors data-[highlighted]:bg-[var(--bg-hover)] data-[highlighted]:text-[var(--text-primary)] focus:bg-[var(--bg-hover)] focus:text-[var(--text-primary)]"
            >
              <item.icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span style={{ fontFamily: 'var(--font-body)' }}>{item.label}</span>
            </DropdownMenuItem>
          ))}
        </div>

        <DropdownMenuSeparator className="my-0 bg-[var(--border-subtle)]" />

        <DropdownMenuItem
          disabled={isSigningOut}
          onSelect={(e) => {
            e.preventDefault();
            handleSignOut();
          }}
          className="flex cursor-pointer items-center gap-2 rounded-none px-3 py-1.5 text-[0.78rem] text-[var(--text-body)] outline-none transition-colors data-[highlighted]:bg-[var(--bg-hover)] data-[highlighted]:text-[var(--color-error)] focus:bg-[var(--bg-hover)] focus:text-[var(--color-error)]"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span style={{ fontFamily: 'var(--font-body)' }}>
            {isSigningOut ? 'Signing out…' : 'Sign Out'}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
