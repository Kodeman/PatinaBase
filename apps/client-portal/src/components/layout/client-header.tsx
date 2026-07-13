'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Box, ChevronDown, HelpCircle, MessageSquare } from 'lucide-react';

import {
  useProfile,
  useRoomScans,
  useMyPendingReviewRequests,
  useMySubmittedReviews,
} from '@patina/supabase';
import { ContextualHelpPanel } from '@patina/help-system';
import { NotificationBell } from '../notifications/notification-bell';
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
import { authEvents } from '../../lib/analytics/events';
import { pathnameToSurfaceKey } from '../../lib/help-system/pathname-to-surface-key';
import { ProjectSwitcher } from './project-switcher';
import { MobileNavDrawer } from './mobile-nav-drawer';
import { PRIMARY_NAV_ITEMS, OVERFLOW_NAV_ITEMS } from './nav-config';

interface ClientHeaderProps {
  projects: ProjectListItem[];
  activeProjectId?: string;
  approvalsPending?: number;
  unreadMessages?: number;
}

/** Small count pill — rendered only when there is something to show. */
function CountBadge({ value }: { value: number }) {
  if (!value || value <= 0) return null;
  return (
    <span className="rounded-sm bg-[var(--accent-primary)] px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-white">
      {value}
    </span>
  );
}

export function ClientHeader({
  projects,
  activeProjectId,
  approvalsPending = 0,
  unreadMessages = 0,
}: ClientHeaderProps) {
  const pathname = usePathname() ?? '';
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const navLinkClass = (href: string) =>
    `hidden min-h-[44px] min-w-0 items-center whitespace-nowrap type-meta transition-opacity hover:opacity-70 md:inline-flex ${
      isActive(href) ? 'text-[var(--text-primary)] opacity-100' : ''
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-default)] bg-[var(--bg-primary)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--bg-primary)]/80">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
        {/* Left: mobile menu (md-) + logo + project switcher */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <MobileNavDrawer />
          <Link
            href="/projects"
            className="inline-flex min-h-[44px] flex-shrink-0 items-center font-heading text-lg tracking-wide text-[var(--text-primary)] transition-opacity hover:opacity-70"
          >
            Patina
          </Link>
          <ProjectSwitcher projects={projects} activeProjectId={activeProjectId} />
        </div>

        {/* Center: primary links + More (desktop only) */}
        <nav className="hidden min-w-0 flex-1 items-center gap-5 md:flex lg:gap-6">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={navLinkClass(item.href)}
              data-testid={`header-${item.key}-link`}
            >
              {item.label}
            </Link>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="hidden min-h-[44px] items-center gap-1 whitespace-nowrap type-meta transition-opacity hover:opacity-70 md:inline-flex"
                data-testid="header-more-menu"
              >
                More
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[11rem]">
              {OVERFLOW_NAV_ITEMS.map((item) => (
                <DropdownMenuItem key={item.key} asChild>
                  <Link
                    href={item.href}
                    data-testid={`header-more-${item.key}-link`}
                    className="flex items-center gap-2"
                  >
                    <item.icon className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden />
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* Right: utilities (compact; counts only when > 0) */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-3 sm:gap-4">
          <div className="hidden min-h-[44px] items-center gap-1.5 md:flex" title="Approvals pending">
            <Bell className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden />
            <span className="type-meta hidden lg:inline">approvals</span>
            <CountBadge value={approvalsPending} />
          </div>
          <Link
            href="/messages"
            className="hidden min-h-[44px] items-center gap-1.5 transition-opacity hover:opacity-70 md:flex"
          >
            <MessageSquare className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden />
            <span className="type-meta hidden lg:inline">messages</span>
            <CountBadge value={unreadMessages} />
          </Link>
          <RoomsLink />
          <ReviewsLink />
          <NotificationBell />
          <HelpButton />
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
      className="hidden min-h-[44px] items-center gap-1.5 transition-opacity hover:opacity-70 md:inline-flex"
      data-testid="header-rooms-link"
    >
      <Box className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden />
      <span className="type-meta hidden lg:inline">rooms</span>
    </Link>
  );
}

function ReviewsLink() {
  const { user } = useAuth();
  const { data: pending = [] } = useMyPendingReviewRequests(user?.id);
  const { data: past = [] } = useMySubmittedReviews(user?.id);
  if (!user || (pending.length === 0 && past.length === 0)) return null;
  return (
    <Link
      href="/reviews"
      className="hidden min-h-[44px] items-center gap-1.5 transition-opacity hover:opacity-70 md:inline-flex"
      data-testid="header-reviews-link"
    >
      <span className="type-meta hidden lg:inline">reviews</span>
      {pending.length > 0 ? (
        <span className="rounded-sm bg-[var(--accent-primary)] px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-white">
          {pending.length}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * HelpButton — the `?` trigger that opens the <ContextualHelpPanel /> for the
 * surface the homeowner currently has open (surface key derived from the path).
 */
function HelpButton() {
  const pathname = usePathname();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const surfaceKey = useMemo(() => pathnameToSurfaceKey(pathname ?? '/'), [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsHelpOpen(true)}
        aria-label="Help"
        aria-haspopup="dialog"
        aria-expanded={isHelpOpen}
        title="Help"
        data-testid="header-help-trigger"
        className="hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-[var(--text-primary)] transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] sm:inline-flex"
      >
        <HelpCircle className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden />
      </button>
      <ContextualHelpPanel
        open={isHelpOpen}
        onOpenChange={setIsHelpOpen}
        surfaceKey={surfaceKey}
      />
    </>
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
            authEvents.logout();
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
