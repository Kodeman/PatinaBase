'use client';

import Link from 'next/link';
import { Bell, Box, MessageSquare } from 'lucide-react';

import { useProfile, useRoomScans } from '@patina/supabase';
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@patina/design-system';

import type { ProjectListItem } from '../../types/project';
import { useAuth } from '../../hooks/use-auth';
import { formatRelativeTime } from '../../lib/utils/format';
import { ProjectSwitcher } from './project-switcher';

interface ClientHeaderProps {
  projects: ProjectListItem[];
  activeProjectId?: string;
  approvalsPending?: number;
  unreadMessages?: number;
  lastUpdated?: string;
}

export function ClientHeader({
  projects,
  activeProjectId,
  approvalsPending = 0,
  unreadMessages = 0,
  lastUpdated,
}: ClientHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-default)] bg-[var(--bg-primary)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--bg-primary)]/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Link
            href="/projects"
            className="font-heading text-lg tracking-wide text-[var(--text-primary)] transition-opacity hover:opacity-70"
          >
            Patina
          </Link>
          <ProjectSwitcher projects={projects} activeProjectId={activeProjectId} />
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden />
            <span className="font-heading text-lg font-bold text-[var(--text-primary)]">
              {approvalsPending}
            </span>
            <span className="type-meta hidden sm:inline">approvals</span>
          </div>
          <Link
            href="/messages"
            className="flex items-center gap-2 transition-opacity hover:opacity-70"
          >
            <MessageSquare className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden />
            <span className="font-heading text-lg font-bold text-[var(--text-primary)]">
              {unreadMessages}
            </span>
            <span className="type-meta hidden sm:inline">messages</span>
          </Link>
          <RoomsLink />
          {lastUpdated ? (
            <span className="type-meta hidden md:inline">
              Updated {formatRelativeTime(lastUpdated) ?? 'recently'}
            </span>
          ) : null}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function RoomsLink() {
  const { user } = useAuth();
  const { data: scans = [] } = useRoomScans(user ? { userId: user.id } : undefined);
  if (!user || scans.length === 0) return null;
  return (
    <Link
      href="/scans"
      className="flex items-center gap-2 transition-opacity hover:opacity-70"
      data-testid="header-rooms-link"
    >
      <Box className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden />
      <span className="type-meta hidden sm:inline">rooms</span>
    </Link>
  );
}

function UserMenu() {
  const { data: profile } = useProfile();
  const { signOut } = useAuth();

  const displayName = profile?.full_name?.trim() || profile?.email || '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open account menu"
          data-testid="header-user-menu"
          className="rounded-full ring-offset-2 transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          <Avatar
            size="sm"
            src={profile?.avatar_url ?? undefined}
            name={displayName || undefined}
            alt={displayName}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {displayName ? (
          <>
            <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/account" data-testid="header-user-menu-account">
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/notifications" data-testid="header-user-menu-notifications">
            Notifications
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void signOut();
          }}
          data-testid="header-user-menu-signout"
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

