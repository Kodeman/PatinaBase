import {
  LayoutDashboard,
  Users,
  Shield,
  BadgeCheck,
  Package,
  ShoppingCart,
  Image,
  FileText,
  Flag,
  Activity,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface AdminNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  role?: string;
}

export const adminNavItems: AdminNavItem[] = [
  {
    name: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard
  },
  {
    name: 'Users',
    href: '/admin/users',
    icon: Users,
    permission: 'identity.user.read'
  },
  {
    name: 'Roles & Permissions',
    href: '/admin/roles',
    icon: Shield,
    permission: 'identity.role.read'
  },
  {
    name: 'Verification',
    href: '/admin/verification',
    icon: BadgeCheck,
    permission: 'designer.verify.review'
  },
  {
    name: 'Catalog',
    href: '/admin/catalog',
    icon: Package,
    permission: 'catalog.product.read'
  },
  {
    name: 'Orders',
    href: '/admin/orders',
    icon: ShoppingCart,
    permission: 'order.read'
  },
  {
    name: 'Media',
    href: '/admin/media',
    icon: Image,
    permission: 'catalog.product.read'
  },
  // Super admin only
  {
    name: 'Audit Logs',
    href: '/admin/audit',
    icon: FileText,
    role: 'super_admin'
  },
  {
    name: 'Feature Flags',
    href: '/admin/flags',
    icon: Flag,
    role: 'super_admin'
  },
  {
    name: 'System Health',
    href: '/admin/health',
    icon: Activity,
    role: 'super_admin'
  },
  {
    name: 'Settings',
    href: '/admin/settings',
    icon: Settings,
    role: 'super_admin'
  },
];
