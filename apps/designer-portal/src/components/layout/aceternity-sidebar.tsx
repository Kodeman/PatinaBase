'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  Logo,
  UserProfileCard,
  type UserPresenceStatus,
} from '@patina/design-system';
import {
  BarChart3,
  Bot,
  DollarSign,
  FileText,
  FolderOpen,
  GraduationCap,
  Grid3x3,

  Mail,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
  Store,
  Users,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
  isChild?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

function getNavSections(userRoles: string[]): NavSection[] {
  const isAdmin = userRoles.some((r) => r === 'admin' || r === 'super_admin');

  const sections: NavSection[] = [
    {
      title: 'Studio',
      items: [
        {
          label: 'Projects',
          href: '/projects',
          icon: <FolderOpen className="h-5 w-5" />,
        },
        {
          label: 'Proposals',
          href: '/proposals',
          icon: <FileText className="h-5 w-5" />,
          badge: 2,
        },
        {
          label: 'Catalog',
          href: '/catalog',
          icon: <Grid3x3 className="h-5 w-5" />,
        },
        {
          label: 'Vendors',
          href: '/vendors',
          icon: <Store className="h-5 w-5" />,
        },
      ],
    },
    {
      title: 'Clients',
      items: [
        {
          label: 'Client roster',
          href: '/clients',
          icon: <Users className="h-5 w-5" />,
          badge: 3,
        },
        {
          label: 'Leads',
          href: '/leads',
          icon: <UserPlus className="h-5 w-5" />,
        },
      ],
    },
    {
      title: 'Communications',
      items: [
        {
          label: 'Messages',
          href: '/messages',
          icon: <MessageSquare className="h-5 w-5" />,
          badge: 5,
        },
        {
          label: 'Communications',
          href: '/communications',
          icon: <Mail className="h-5 w-5" />,
        },
        {
          label: 'AI Companion',
          href: '/companion',
          icon: <Bot className="h-5 w-5" />,
        },
      ],
    },
    {
      title: 'Business',
      items: [
        {
          label: 'Earnings',
          href: '/earnings',
          icon: <DollarSign className="h-5 w-5" />,
        },
        {
          label: 'Teaching',
          href: '/teaching',
          icon: <GraduationCap className="h-5 w-5" />,
        },
      ],
    },
    ...(isAdmin
      ? [
          {
            title: 'Admin',
            items: [
              {
                label: 'Insights',
                href: '/insights',
                icon: <BarChart3 className="h-5 w-5" />,
              },
              {
                label: 'Administration',
                href: '/administration',
                icon: <Shield className="h-5 w-5" />,
              },
            ],
          },
        ]
      : []),
    {
      title: 'Labs',
      items: [
        {
          label: 'Demo workspace',
          href: '/demo',
          icon: <Sparkles className="h-5 w-5" />,
        },
      ],
    },
  ];

  return sections;
}

interface AceternitySidebarProps {
  className?: string;
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
}

export function AceternitySidebar({ className, isOpen, setIsOpen }: AceternitySidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const sidebarOpen = isOpen ?? true;
  const [userStatus] = useState<UserPresenceStatus>('online');

  // Check if a link is active (current page or a subpage)
  const isLinkActive = (href: string) => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const userRoles = user?.roles ?? ['designer'];
  const navSections = getNavSections(userRoles);

  const sidebarUser = user
    ? {
        name: user.name || user.email || 'Designer',
        email: user.email ?? undefined,
        avatar: undefined,
        roles: userRoles,
      }
    : undefined;

  const handleNavigate = (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    router.push(href);
    if (typeof window !== 'undefined' && window.innerWidth < 1024 && setIsOpen) {
      setIsOpen(false);
    }
  };

  return (
    <Sidebar open={isOpen} setOpen={setIsOpen} animate={true}>
      <SidebarBody className={cn('h-screen', className)}>
        {/* Logo */}
        <Logo>Patina Designer</Logo>

        {/* Navigation Links */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto pb-6">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-2">
              {sidebarOpen && (
                <p className="px-3 text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/60">
                  {section.title}
                </p>
              )}
              <div className="flex flex-col gap-1">
                {section.items.map((link) => (
                  <SidebarLink
                    key={link.href}
                    link={{
                      label: link.label,
                      href: link.href,
                      icon: link.icon,
                      badge: link.badge,
                    }}
                    className={cn(
                      link.isChild &&
                        'pl-8 text-sm text-sidebar-foreground/80 hover:text-sidebar-accent-foreground',
                      isLinkActive(link.href) &&
                        'bg-sidebar-accent text-sidebar-accent-foreground'
                    )}
                    onClick={handleNavigate(link.href)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Settings */}
        <div className="pb-2">
          <SidebarLink
            link={{
              label: 'Settings',
              href: '/settings',
              icon: <Settings className="h-5 w-5" />,
            }}
            className={cn(
              isLinkActive('/settings') &&
                'bg-sidebar-accent text-sidebar-accent-foreground'
            )}
            onClick={handleNavigate('/settings')}
          />
        </div>

        {/* User Profile */}
        {sidebarUser && (
          <UserProfileCard
            user={sidebarUser}
            status={userStatus}
            collapsed={!sidebarOpen}
            onClick={() => router.push('/profile')}
          />
        )}
      </SidebarBody>
    </Sidebar>
  );
}
