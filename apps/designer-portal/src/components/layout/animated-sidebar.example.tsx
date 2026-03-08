/**
 * Animated Sidebar Navigation - Usage Examples
 *
 * This file demonstrates how to use the AnimatedSidebar component
 * with various configurations and patterns.
 */

import {
  Home,
  Package,
  Users,
  Settings,
  BarChart,
  FileText,
  Palette,
  ShoppingBag,
  MessageSquare,
  Bell
} from 'lucide-react';
import { AnimatedSidebar, NavItem } from './animated-sidebar';

// ============================================================================
// Example 1: Basic Sidebar with Simple Links
// ============================================================================
export function BasicSidebarExample() {
  const basicItems: NavItem[] = [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: Home,
    },
    {
      title: 'Products',
      href: '/products',
      icon: Package,
    },
    {
      title: 'Customers',
      href: '/customers',
      icon: Users,
    },
    {
      title: 'Settings',
      href: '/settings',
      icon: Settings,
    },
  ];

  return <AnimatedSidebar items={basicItems} />;
}

// ============================================================================
// Example 2: Sidebar with Badges
// ============================================================================
export function SidebarWithBadgesExample() {
  const itemsWithBadges: NavItem[] = [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: Home,
    },
    {
      title: 'Products',
      href: '/products',
      icon: Package,
      badge: 12, // Show count of items
    },
    {
      title: 'Messages',
      href: '/messages',
      icon: MessageSquare,
      badge: 5, // Unread messages
    },
    {
      title: 'Notifications',
      href: '/notifications',
      icon: Bell,
      badge: 23, // Unread notifications
    },
  ];

  return <AnimatedSidebar items={itemsWithBadges} />;
}

// ============================================================================
// Example 3: Sidebar with Nested Navigation (Collapsible Sections)
// ============================================================================
export function NestedSidebarExample() {
  const nestedItems: NavItem[] = [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: Home,
    },
    {
      title: 'Products',
      icon: Package,
      badge: 12,
      children: [
        {
          title: 'All Products',
          href: '/products',
        },
        {
          title: 'Categories',
          href: '/products/categories',
        },
        {
          title: 'Inventory',
          href: '/products/inventory',
          badge: 3, // Low stock items
        },
      ],
    },
    {
      title: 'Customers',
      icon: Users,
      children: [
        {
          title: 'All Customers',
          href: '/customers',
        },
        {
          title: 'Groups',
          href: '/customers/groups',
        },
        {
          title: 'Reviews',
          href: '/customers/reviews',
          badge: 8,
        },
      ],
    },
    {
      title: 'Analytics',
      href: '/analytics',
      icon: BarChart,
    },
  ];

  return <AnimatedSidebar items={nestedItems} />;
}

// ============================================================================
// Example 4: Designer Portal Specific Navigation
// ============================================================================
export function DesignerPortalSidebarExample() {
  const designerItems: NavItem[] = [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: Home,
    },
    {
      title: 'Design Projects',
      icon: Palette,
      children: [
        {
          title: 'Active Projects',
          href: '/projects/active',
          badge: 5,
        },
        {
          title: 'Drafts',
          href: '/projects/drafts',
          badge: 3,
        },
        {
          title: 'Completed',
          href: '/projects/completed',
        },
      ],
    },
    {
      title: 'Product Catalog',
      icon: ShoppingBag,
      children: [
        {
          title: 'Browse Products',
          href: '/catalog',
        },
        {
          title: 'My Selections',
          href: '/catalog/selections',
          badge: 12,
        },
        {
          title: 'Categories',
          href: '/catalog/categories',
        },
      ],
    },
    {
      title: 'Client Boards',
      href: '/boards',
      icon: FileText,
      badge: 2, // Pending approvals
    },
    {
      title: 'Messages',
      href: '/messages',
      icon: MessageSquare,
      badge: 7,
    },
    {
      title: 'Settings',
      icon: Settings,
      children: [
        {
          title: 'Profile',
          href: '/settings/profile',
        },
        {
          title: 'Preferences',
          href: '/settings/preferences',
        },
        {
          title: 'Notifications',
          href: '/settings/notifications',
        },
      ],
    },
  ];

  return <AnimatedSidebar items={designerItems} />;
}

// ============================================================================
// Example 5: Deeply Nested Navigation (Multiple Levels)
// ============================================================================
export function DeeplyNestedSidebarExample() {
  const deeplyNestedItems: NavItem[] = [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: Home,
    },
    {
      title: 'Products',
      icon: Package,
      children: [
        {
          title: 'Furniture',
          children: [
            {
              title: 'Living Room',
              href: '/products/furniture/living-room',
            },
            {
              title: 'Bedroom',
              href: '/products/furniture/bedroom',
            },
            {
              title: 'Dining',
              href: '/products/furniture/dining',
            },
          ],
        },
        {
          title: 'Decor',
          children: [
            {
              title: 'Wall Art',
              href: '/products/decor/wall-art',
            },
            {
              title: 'Lighting',
              href: '/products/decor/lighting',
            },
          ],
        },
        {
          title: 'All Products',
          href: '/products',
        },
      ],
    },
  ];

  return <AnimatedSidebar items={deeplyNestedItems} />;
}

// ============================================================================
// Example 6: Custom Active Route
// ============================================================================
export function CustomActiveRouteExample() {
  const items: NavItem[] = [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: Home,
    },
    {
      title: 'Products',
      href: '/products',
      icon: Package,
    },
  ];

  // You can manually control which route is considered active
  const customActiveRoute = '/products';

  return <AnimatedSidebar items={items} activeRoute={customActiveRoute} />;
}

// ============================================================================
// Example 7: With Custom Styling
// ============================================================================
export function StyledSidebarExample() {
  const items: NavItem[] = [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: Home,
    },
    {
      title: 'Products',
      href: '/products',
      icon: Package,
    },
  ];

  return (
    <AnimatedSidebar
      items={items}
      className="border-r bg-sidebar"
    />
  );
}

// ============================================================================
// How to Use in Your Layout
// ============================================================================
/*
// app/layout.tsx or app/dashboard/layout.tsx

import { AnimatedSidebar } from '@/components/layout/animated-sidebar';
import { navItems } from '@/config/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r bg-sidebar">
        <AnimatedSidebar items={navItems} />
      </aside>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
*/

// ============================================================================
// Navigation Config File Pattern
// ============================================================================
/*
// config/navigation.ts

import { NavItem } from '@/components/layout/animated-sidebar';
import { Home, Package, Users, Settings } from 'lucide-react';

export const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Home,
  },
  {
    title: 'Products',
    icon: Package,
    children: [
      {
        title: 'All Products',
        href: '/products',
      },
      {
        title: 'Categories',
        href: '/products/categories',
      },
    ],
  },
  {
    title: 'Customers',
    href: '/customers',
    icon: Users,
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
  },
];
*/
