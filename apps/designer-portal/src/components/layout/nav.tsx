'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Home,
  Users,
  Grid3x3,
  FileText,
  FolderOpen,
  MessageSquare,
  GraduationCap,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Clients', href: '/clients', icon: Users },
  { name: 'Clients Demo', href: '/clients/demo', icon: Sparkles },
  { name: 'Catalog', href: '/catalog', icon: Grid3x3 },
  { name: 'Catalog Demo', href: '/catalog/demo', icon: Sparkles },
  { name: 'Proposals', href: '/proposals', icon: FileText },
  { name: 'Projects', href: '/projects', icon: FolderOpen },
  { name: 'Messages', href: '/messages', icon: MessageSquare },
  { name: 'Teaching', href: '/teaching', icon: GraduationCap },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1 px-3">
      {navigation.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
