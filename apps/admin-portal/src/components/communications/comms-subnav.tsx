'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Megaphone,
  LayoutTemplate,
  Users,
  Zap,
  BarChart3,
  AlertTriangle,
  ShieldOff,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SubnavItem {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const ITEMS: SubnavItem[] = [
  { href: '/communications', label: 'Hub', Icon: LayoutDashboard, exact: true },
  { href: '/communications/campaigns', label: 'Campaigns', Icon: Megaphone },
  { href: '/communications/templates', label: 'Templates', Icon: LayoutTemplate },
  { href: '/communications/audiences', label: 'Audiences', Icon: Users },
  { href: '/communications/automations', label: 'Automations', Icon: Zap },
  { href: '/communications/analytics', label: 'Analytics', Icon: BarChart3 },
  { href: '/communications/dlq', label: 'DLQ', Icon: AlertTriangle },
  { href: '/communications/suppressed', label: 'Suppressed', Icon: ShieldOff },
  { href: '/communications/threads', label: 'Threads', Icon: MessageSquare },
];

export function CommsSubnav() {
  const pathname = usePathname() || '';
  return (
    <nav className="bg-white border-b border-patina-clay-beige/20">
      <div className="flex gap-1 overflow-x-auto px-6">
        {ITEMS.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href as any}
              className={cn(
                'flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                active
                  ? 'border-patina-mocha-brown text-patina-charcoal'
                  : 'border-transparent text-patina-clay-beige hover:text-patina-charcoal',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
