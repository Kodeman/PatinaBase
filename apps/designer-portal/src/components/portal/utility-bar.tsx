'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Search, MessageSquare, HelpCircle } from 'lucide-react';
import { ContextualHelpPanel } from '@patina/help-system';
import { Button, IconButton } from '@/components/ui/controls';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { useUnreadCounts } from '@/hooks/use-unread-counts';
import { useCommandPalette } from '@/contexts/command-palette-context';
import { useMessagesPanel } from '@/contexts/messages-panel-context';
import { pathnameToSurfaceKey } from '@/lib/help-system/pathname-to-surface-key';
import { NotificationDropdown } from './notification-dropdown';
import { AccountMenu } from './account-menu';
import { QuickCreateMenu } from './quick-create-menu';
import { TimerButton } from './time/timer-button';

export function UtilityBar() {
  const { user } = useAuth();
  // Unread counts come from client-side queries; gate the badges on
  // hydration so SSR (no counts) and first client paint render the same
  // tree — prevents a hydration mismatch when the query cache is warm.
  const hydrated = useHydrated();
  const { notifications, messages } = useUnreadCounts();
  const commandPalette = useCommandPalette();
  const messagesPanel = useMessagesPanel();
  const pathname = usePathname();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Derive the active surface key from the current pathname. Recomputed on
  // navigation so the panel always asks for articles tied to the page the
  // user actually has open. Sprint 3 will replace this with `useSurfaceKey()`
  // sourced from page-level providers; see pathnameToSurfaceKey for context.
  const surfaceKey = useMemo(
    () => pathnameToSurfaceKey(pathname ?? '/portal'),
    [pathname],
  );

  return (
    <div className="flex items-center gap-1">
      {/* Create / track cluster — the clay + New button anchors the header */}
      <QuickCreateMenu />
      <TimerButton />

      {/* Divider between the create/track pair and the ambient icons */}
      <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-[var(--border-default)]" />

      {/* Search (⌘K) — text+kbd cluster, so kit Button ghost sm */}
      <Button
        variant="ghost"
        size="sm"
        onClick={commandPalette.open}
        className="h-9 gap-1.5 rounded-md px-2.5"
        title="Search (⌘K)"
      >
        <Search className="h-4 w-4" />
        <kbd className="hidden font-mono text-[0.6rem] text-[var(--text-muted)] opacity-60 lg:inline">
          ⌘K
        </kbd>
      </Button>

      {/* Notifications */}
      <NotificationDropdown
        count={hydrated ? notifications : 0}
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
      />

      {/* Help (Sprint 2 · C6 — opens ContextualHelpPanel for the current surface) */}
      <IconButton
        variant="ghost"
        size="md"
        label="Help"
        onClick={() => setIsHelpOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isHelpOpen}
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </IconButton>

      {/* Contextual help panel (renders in its own portal; mounted here so it
          inherits portal-tree theming + auth context). The panel itself fires
          help.panel.opened / help.panel.closed analytics — no extra wiring. */}
      <ContextualHelpPanel
        open={isHelpOpen}
        onOpenChange={setIsHelpOpen}
        surfaceKey={surfaceKey}
      />

      {/* Messages — IconButton is relative, so the badge stays overlaid */}
      <IconButton
        variant="ghost"
        size="md"
        label="Messages"
        onClick={messagesPanel.toggle}
        className="relative"
      >
        <MessageSquare className="h-4 w-4" />
        {hydrated && messages > 0 && (
          <span className="absolute right-1 top-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[var(--color-terracotta)] px-[3px] font-mono text-[0.4rem] text-white">
            {messages}
          </span>
        )}
      </IconButton>

      {/* Account — wrapped so the First Project Walkthrough tour (Sprint 3 W1)
          can anchor its step 5 coachmark on the avatar trigger. */}
      {user && (
        <div data-tour-anchor="profile" className="flex items-center">
          <AccountMenu user={{ name: user.name ?? null, email: user.email }} />
        </div>
      )}
    </div>
  );
}
