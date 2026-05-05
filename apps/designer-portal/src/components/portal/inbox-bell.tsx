'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useUnreadInboxCount, useInboxNotificationsRealtime } from '@patina/supabase';

interface InboxBellProps {
  href?: string;
  className?: string;
}

export function InboxBell({ href = '/portal/inbox', className }: InboxBellProps) {
  useInboxNotificationsRealtime();
  const { data: count = 0 } = useUnreadInboxCount();
  const display = count > 99 ? '99+' : count;

  return (
    <Link
      href={href}
      title="Inbox"
      aria-label={`Inbox${count > 0 ? ` (${count} unread)` : ''}`}
      data-testid="inbox-bell"
      className={
        className ??
        'relative flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--hover-bg,rgba(196,165,123,0.06))] hover:text-[var(--text-primary)]'
      }
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span
          className="absolute right-1 top-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[#D4A090] px-[3px] font-mono text-[0.4rem] text-white"
          data-testid="inbox-bell-count"
        >
          {display}
        </span>
      )}
    </Link>
  );
}
