'use client';

import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { useUnreadInboxCount, useInboxNotificationsRealtime } from '@patina/supabase';

interface InboxBellProps {
  href?: string;
  className?: string;
}

export function InboxBell({ href = '/inbox', className }: InboxBellProps) {
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
        'relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]'
      }
    >
      <Inbox className="h-5 w-5 text-gray-600" />
      {count > 0 ? (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#C77B6E] px-1 text-xs font-bold text-white"
          data-testid="inbox-bell-count"
        >
          {display}
        </span>
      ) : null}
    </Link>
  );
}
