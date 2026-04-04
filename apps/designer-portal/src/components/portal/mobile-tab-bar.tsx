'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, TrendingUp, Package, Users, MessageSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMessagesPanel } from '@/contexts/messages-panel-context';
import { useUnreadCounts } from '@/hooks/use-unread-counts';

interface Tab {
  label: string;
  href: string;
  paths: string[];
  icon: LucideIcon;
  /** If true, opens overlay instead of navigating */
  isOverlay?: boolean;
}

const tabs: Tab[] = [
  {
    label: 'Today',
    href: '/portal',
    paths: ['/portal'],
    icon: CalendarDays,
  },
  {
    label: 'Pipeline',
    href: '/portal/pipeline',
    paths: ['/portal/pipeline', '/portal/leads', '/portal/projects', '/portal/proposals'],
    icon: TrendingUp,
  },
  {
    label: 'Products',
    href: '/portal/catalog',
    paths: ['/portal/catalog', '/portal/teaching', '/portal/companion'],
    icon: Package,
  },
  {
    label: 'Clients',
    href: '/portal/clients',
    paths: ['/portal/clients', '/portal/reviews', '/portal/nurture', '/portal/decisions'],
    icon: Users,
  },
  {
    label: 'Messages',
    href: '/portal/messages',
    paths: ['/portal/messages'],
    icon: MessageSquare,
    isOverlay: true,
  },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const messagesPanel = useMessagesPanel();
  const { messages: unreadMessages } = useUnreadCounts();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border-default)] bg-[var(--bg-surface)] pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex h-[52px] items-center justify-around">
        {tabs.map((tab) => {
          // Check specific paths before catch-all
          const isActive = tab.paths.some(
            (p) => pathname === p || pathname.startsWith(p + '/')
          );

          if (tab.isOverlay) {
            return (
              <button
                key={tab.label}
                onClick={messagesPanel.toggle}
                className={`relative flex flex-col items-center gap-[3px] ${
                  messagesPanel.isOpen
                    ? 'text-[var(--accent-primary)]'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                <tab.icon className="h-5 w-5" strokeWidth={1.5} />
                <span className="type-meta-small">{tab.label}</span>
                {unreadMessages > 0 && (
                  <span className="absolute -right-1 top-0 h-[7px] w-[7px] rounded-full bg-[#D4A090]" />
                )}
              </button>
            );
          }

          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`relative flex flex-col items-center gap-[3px] no-underline ${
                isActive
                  ? 'text-[var(--accent-primary)]'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              <tab.icon className="h-5 w-5" strokeWidth={1.5} />
              <span className="type-meta-small">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
