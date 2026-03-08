'use client';

import { X } from 'lucide-react';
import { Button } from '@patina/design-system';
import { cn } from '@/lib/utils';
import { AnimatedSidebar, type NavItem } from './animated-sidebar';
import {
  BarChart3,
  DollarSign,
  FileText,
  FolderOpen,
  GraduationCap,
  Grid3x3,
  HelpCircle,
  Home,
  Inbox,
  Mail,
  MessageSquare,
  Package,
  Settings,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SidebarContentProps {
  isAdmin: boolean;
}

function SidebarContent({ isAdmin }: SidebarContentProps) {
  // Define navigation structure with nested items
  const navigationItems: NavItem[] = [
    {
      title: 'Dashboard',
      href: '/',
      icon: Home
    },
    {
      title: 'Clients',
      icon: Users,
      badge: 3,
      children: [
        { title: 'Client roster', href: '/clients' },
        { title: 'Lifecycle Demo', href: '/clients/demo', icon: Sparkles },
      ]
    },
    {
      title: 'Catalog',
      icon: Grid3x3,
      children: [
        { title: 'All Products', href: '/catalog' },
        { title: 'Collections', href: '/catalog/collections' },
        { title: 'Categories', href: '/catalog/categories' },
        { title: 'Favorites', href: '/catalog/favorites', badge: 12 },
        { title: 'System Demo', href: '/catalog/demo' },
      ]
    },
    {
      title: 'Proposals',
      href: '/proposals',
      icon: FileText,
      badge: 2
    },
    {
      title: 'Projects',
      icon: FolderOpen,
      children: [
        { title: 'Active Projects', href: '/projects/active' },
        { title: 'Completed', href: '/projects/completed' },
        { title: 'Archived', href: '/projects/archived' },
      ]
    },
    {
      title: 'Messages',
      href: '/messages',
      icon: MessageSquare,
      badge: 5
    },
    {
      title: 'Teaching',
      href: '/teaching',
      icon: GraduationCap
    },
    {
      title: 'Leads',
      href: '/leads',
      icon: Inbox,
      badge: 4
    },
    {
      title: 'Earnings',
      href: '/earnings',
      icon: DollarSign
    },
    {
      title: 'Communications',
      icon: Mail,
      children: [
        { title: 'Command Center', href: '/communications' },
        { title: 'Campaigns', href: '/communications/campaigns' },
        { title: 'Templates', href: '/communications/templates' },
        { title: 'Audiences', href: '/communications/audiences' },
        { title: 'Automations', href: '/communications/automations' },
        { title: 'Analytics', href: '/communications/analytics' },
      ]
    },
    // Admin-only insights
    ...(isAdmin ? [{
      title: 'Insights',
      href: '/insights',
      icon: BarChart3
    }] : []),
    {
      title: 'Resources',
      icon: Package,
      children: [
        { title: 'Design Tools', href: '/resources/tools' },
        { title: 'Templates', href: '/resources/templates' },
        { title: 'Guidelines', href: '/resources/guidelines' },
      ]
    },
    // Add admin link if user is admin
    ...(isAdmin ? [{
      title: 'Administration',
      href: '/admin',
      icon: Shield
    }] : []),
    {
      title: 'Settings',
      icon: Settings,
      children: [
        { title: 'Profile', href: '/settings/profile' },
        { title: 'Account', href: '/settings/account' },
        { title: 'Notifications', href: '/settings/notifications' },
        { title: 'Billing', href: '/settings/billing' },
      ]
    },
    {
      title: 'Help & Support',
      href: '/help',
      icon: HelpCircle
    },
  ];

  return <AnimatedSidebar items={navigationItems} className="h-full" />;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes('admin') || user?.roles?.includes('super_admin');

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-background transition-transform lg:static lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo and close button */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary" />
            <span className="font-heading text-lg font-semibold">Patina</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close menu</span>
          </Button>
        </div>

        {/* Animated Navigation */}
        <div className="flex-1 overflow-hidden">
          <SidebarContent isAdmin={isAdmin} />
        </div>

        {/* Footer */}
        <div className="border-t p-4">
          <div className="text-xs text-muted-foreground">
            <div className="font-medium">Designer Portal</div>
            <div className="mt-1">© 2025 Patina</div>
          </div>
        </div>
      </aside>
    </>
  );
}
