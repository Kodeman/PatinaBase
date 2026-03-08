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
  ShoppingBag,
  MessageSquare,
  Bell,
  CreditCard,
  Truck
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
      title: 'Orders',
      href: '/orders',
      icon: ShoppingBag,
      badge: 8, // Pending orders
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
// Example 4: Admin Portal Specific Navigation
// ============================================================================
export function AdminPortalSidebarExample() {
  const adminItems: NavItem[] = [
    {
      title: 'Dashboard',
      href: '/dashboard',
      icon: Home,
    },
    {
      title: 'Product Management',
      icon: Package,
      children: [
        {
          title: 'All Products',
          href: '/products',
          badge: 156,
        },
        {
          title: 'Categories',
          href: '/products/categories',
        },
        {
          title: 'Vendors',
          href: '/products/vendors',
        },
        {
          title: 'Inventory',
          href: '/products/inventory',
          badge: 12, // Low stock alerts
        },
      ],
    },
    {
      title: 'Orders',
      icon: ShoppingBag,
      children: [
        {
          title: 'All Orders',
          href: '/orders',
        },
        {
          title: 'Pending',
          href: '/orders/pending',
          badge: 8,
        },
        {
          title: 'Shipped',
          href: '/orders/shipped',
        },
        {
          title: 'Completed',
          href: '/orders/completed',
        },
      ],
    },
    {
      title: 'Customer Management',
      icon: Users,
      children: [
        {
          title: 'All Customers',
          href: '/customers',
        },
        {
          title: 'Designers',
          href: '/customers/designers',
          badge: 23,
        },
        {
          title: 'End Users',
          href: '/customers/end-users',
        },
      ],
    },
    {
      title: 'Shipping',
      href: '/shipping',
      icon: Truck,
      badge: 5, // Pending shipments
    },
    {
      title: 'Payments',
      href: '/payments',
      icon: CreditCard,
    },
    {
      title: 'Reports',
      icon: BarChart,
      children: [
        {
          title: 'Sales Report',
          href: '/reports/sales',
        },
        {
          title: 'Inventory Report',
          href: '/reports/inventory',
        },
        {
          title: 'Customer Report',
          href: '/reports/customers',
        },
      ],
    },
    {
      title: 'Settings',
      icon: Settings,
      children: [
        {
          title: 'General',
          href: '/settings/general',
        },
        {
          title: 'Users & Roles',
          href: '/settings/users',
        },
        {
          title: 'Integrations',
          href: '/settings/integrations',
        },
      ],
    },
  ];

  return <AnimatedSidebar items={adminItems} />;
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
