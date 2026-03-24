'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  BarChart3,
  ClipboardList,
  FileText,
  Flag,
  Image,
  KeyRound,
  LayoutDashboard,
  Package,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Users,
} from 'lucide-react';

const navigation: Array<{ name: string; href: string; icon: any }> = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Users', href: '/users', icon: Users },
  { name: 'User Lifecycle Demo', href: '/users/demo', icon: Sparkles },
  { name: 'Designer Verification', href: '/verification', icon: Shield },
  { name: 'Waitlist', href: '/waitlist', icon: ClipboardList },
  { name: 'Roles & Permissions', href: '/roles', icon: KeyRound },
  { name: 'Catalog', href: '/catalog', icon: Package },
  { name: 'Media', href: '/media', icon: Image },
  { name: 'Orders', href: '/orders', icon: ShoppingCart },
  { name: 'Search', href: '/search', icon: Search },
  { name: 'Privacy', href: '/privacy', icon: FileText },
  { name: 'Feature Flags', href: '/flags', icon: Flag },
  { name: 'System Health', href: '/health', icon: AlertCircle },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Audit Logs', href: '/audit', icon: FileText },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col space-y-1">
      {navigation.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;

        return (
          <Link
            key={item.name}
            href={item.href as any}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
