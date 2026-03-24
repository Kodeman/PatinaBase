'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  Logo,
} from '@/components/ui/aceternity-sidebar';
import { UserProfileCard, type UserPresenceStatus } from '@patina/design-system';
import {
  Activity,
  BarChart3,
  ClipboardList,
  FileText,
  Flag,
  FolderKanban,
  Image,
  LayoutDashboard,
  LayoutTemplate,
  Mail,
  Package,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminAceternitySidebarProps {
  className?: string;
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
}

interface NavSection {
  label: string;
  links: Array<{ label: string; href: string; icon: React.ReactNode }>;
}

export function AdminAceternitySidebar({ className, isOpen, setIsOpen }: AdminAceternitySidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useAuth();
  const sidebarOpen = isOpen ?? true;
  const [userStatus] = useState<UserPresenceStatus>('online');

  const sections: NavSection[] = [
    {
      label: 'Overview',
      links: [
        {
          label: 'Dashboard',
          href: '/dashboard',
          icon: <LayoutDashboard className="h-5 w-5" />,
        },
      ],
    },
    {
      label: 'People',
      links: [
        {
          label: 'User Management',
          href: '/users',
          icon: <Users className="h-5 w-5" />,
        },
        {
          label: 'Roles & Permissions',
          href: '/roles',
          icon: <ShieldCheck className="h-5 w-5" />,
        },
        {
          label: 'Verification Queue',
          href: '/verification',
          icon: <UserCheck className="h-5 w-5" />,
        },
        {
          label: 'Waitlist',
          href: '/waitlist',
          icon: <ClipboardList className="h-5 w-5" />,
        },
      ],
    },
    {
      label: 'Commerce',
      links: [
        {
          label: 'Catalog',
          href: '/catalog',
          icon: <Package className="h-5 w-5" />,
        },
        {
          label: 'Orders',
          href: '/orders',
          icon: <ShoppingCart className="h-5 w-5" />,
        },
        {
          label: 'Projects',
          href: '/projects',
          icon: <FolderKanban className="h-5 w-5" />,
        },
      ],
    },
    {
      label: 'Communications',
      links: [
        {
          label: 'Command Center',
          href: '/communications',
          icon: <Mail className="h-5 w-5" />,
        },
        {
          label: 'Campaigns',
          href: '/communications/campaigns',
          icon: <Send className="h-5 w-5" />,
        },
        {
          label: 'Templates',
          href: '/communications/templates',
          icon: <LayoutTemplate className="h-5 w-5" />,
        },
        {
          label: 'Audiences',
          href: '/communications/audiences',
          icon: <Users className="h-5 w-5" />,
        },
        {
          label: 'Automations',
          href: '/communications/automations',
          icon: <Zap className="h-5 w-5" />,
        },
      ],
    },
    {
      label: 'System',
      links: [
        {
          label: 'Analytics',
          href: '/analytics',
          icon: <BarChart3 className="h-5 w-5" />,
        },
        {
          label: 'Media Library',
          href: '/media',
          icon: <Image className="h-5 w-5" />,
        },
        {
          label: 'Audit Logs',
          href: '/audit',
          icon: <FileText className="h-5 w-5" />,
        },
        {
          label: 'System Health',
          href: '/health',
          icon: <Activity className="h-5 w-5" />,
        },
        {
          label: 'Feature Flags',
          href: '/flags',
          icon: <Flag className="h-5 w-5" />,
        },
        {
          label: 'Settings',
          href: '/settings',
          icon: <Settings className="h-5 w-5" />,
        },
      ],
    },
  ];

  const bottomLinks = [
    {
      label: 'Demo Workspace',
      href: '/demo',
      icon: <Sparkles className="h-5 w-5" />,
    },
  ];

  // Check if a link is active (current page or a subpage)
  const isLinkActive = (href: string) => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const handleNavClick = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(href as any);
    if (window.innerWidth < 1024 && setIsOpen) {
      setIsOpen(false);
    }
  };

  // User data from session - fixes the hardcoded data bug
  const sidebarUser = session?.user
    ? {
        name: session.user.name || session.user.email || 'Admin',
        email: session.user.email ?? undefined,
        avatar: undefined,
        roles: session.user.roles ?? ['admin'],
      }
    : undefined;

  return (
    <Sidebar open={isOpen} setOpen={setIsOpen} animate={true}>
      <SidebarBody className={cn('h-screen', className)}>
        {/* Logo */}
        <Logo>Patina Admin</Logo>

        {/* Navigation Links */}
        <div className="flex flex-col gap-1 flex-1 overflow-y-auto">
          {sections.map((section, sIdx) => (
            <div key={section.label}>
              {sIdx > 0 && (
                <div className="mt-4 mb-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {sidebarOpen ? section.label : ''}
                </div>
              )}
              {section.links.map((link, idx) => (
                <SidebarLink
                  key={`${section.label}-${idx}`}
                  link={link}
                  className={cn(
                    isLinkActive(link.href) &&
                    'bg-sidebar-accent text-sidebar-accent-foreground'
                  )}
                  onClick={handleNavClick(link.href)}
                />
              ))}
            </div>
          ))}

          {/* Spacer + Demo */}
          <div className="mt-auto" />
          {bottomLinks.map((link, idx) => (
            <SidebarLink
              key={`bottom-${idx}`}
              link={link}
              className={cn(
                isLinkActive(link.href) &&
                'bg-sidebar-accent text-sidebar-accent-foreground'
              )}
              onClick={handleNavClick(link.href)}
            />
          ))}
        </div>

        {/* User Profile */}
        {sidebarUser && (
          <UserProfileCard
            user={sidebarUser}
            status={userStatus}
            collapsed={!sidebarOpen}
          />
        )}
      </SidebarBody>
    </Sidebar>
  );
}
