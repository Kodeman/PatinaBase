import {
  LayoutDashboard,
  Users,
  Package,
  Briefcase,
  ShieldCheck,
  Settings,
  LogOut,
  HelpCircle,
  Truck,
  type LucideIcon,
} from 'lucide-react';

// ─── Zone Definitions ────────────────────────────────────────────────────────

export type ZoneKey = 'overview' | 'people' | 'content' | 'operations' | 'system' | 'fulfillment';

export interface ZoneConfig {
  key: ZoneKey;
  label: string;
  href: string;
  /** Path prefixes that belong to this zone (checked in order, most specific first) */
  paths: string[];
  icon: LucideIcon;
}

// Back of House (S1, spec §1) — a 6th zone, gated at module level: hidden
// from nav when the flag is unset, but its pages stay URL-routable either
// way (a direct link/refresh to /fulfillment/* always works — only the nav
// entry point is gated). Flip on locally with
// NEXT_PUBLIC_ENABLE_FULFILLMENT=true in apps/admin-portal/.env.local.
const FULFILLMENT_ZONE: ZoneConfig = {
  key: 'fulfillment',
  label: 'Fulfillment',
  href: '/fulfillment',
  paths: ['/fulfillment'],
  icon: Truck,
};
const FULFILLMENT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_FULFILLMENT === 'true';

export const ZONES: ZoneConfig[] = [
  {
    key: 'overview',
    label: 'Overview',
    href: '/dashboard',
    paths: ['/mission-control', '/dashboard', '/analytics'],
    icon: LayoutDashboard,
  },
  {
    key: 'people',
    label: 'People',
    href: '/users',
    paths: [
      '/users',
      '/studios',
      '/roles',
      '/applications',
      '/verification',
      '/waitlist',
    ],
    icon: Users,
  },
  {
    key: 'content',
    label: 'Content',
    href: '/catalog',
    paths: [
      '/catalog',
      '/media',
      '/communications',
      '/feeds',
    ],
    icon: Package,
  },
  {
    key: 'operations',
    label: 'Operations',
    href: '/orders',
    paths: [
      '/orders',
      '/pipeline',
      '/projects',
      '/cowork',
    ],
    icon: Briefcase,
  },
  {
    key: 'system',
    label: 'System',
    href: '/health',
    paths: [
      '/health',
      '/system',
      '/audit',
      '/flags',
      '/settings',
      '/demo',
    ],
    icon: ShieldCheck,
  },
  ...(FULFILLMENT_ENABLED ? [FULFILLMENT_ZONE] : []),
];

// ─── Sub-Navigation Items ────────────────────────────────────────────────────

export interface SubNavItem {
  label: string;
  href: string;
  /** CSS color value for stage dot */
  dotColor?: string;
  /** Whether to use exact pathname match (default: prefix match) */
  exact?: boolean;
}

export const ZONE_SUB_ITEMS: Record<ZoneKey, SubNavItem[]> = {
  overview: [
    { label: 'Mission Control', href: '/mission-control' },
    { label: 'Dashboard', href: '/dashboard', exact: true },
    { label: 'Analytics', href: '/analytics' },
  ],
  people: [
    { label: 'Users', href: '/users' },
    { label: 'Studios', href: '/studios' },
    { label: 'Roles', href: '/roles' },
    { label: 'Applications', href: '/applications' },
    { label: 'Verification', href: '/verification' },
    { label: 'Waitlist', href: '/waitlist' },
  ],
  content: [
    { label: 'Catalog', href: '/catalog' },
    { label: 'Promotions', href: '/catalog/promotions' },
    { label: 'Media', href: '/media' },
    { label: 'Communications', href: '/communications' },
    { label: 'Feeds', href: '/feeds' },
  ],
  operations: [
    { label: 'Orders', href: '/orders' },
    { label: 'Pipeline', href: '/pipeline' },
    { label: 'Projects', href: '/projects' },
    { label: 'Cowork', href: '/cowork' },
  ],
  system: [
    { label: 'Health', href: '/health' },
    { label: 'Deployments', href: '/system/deployments' },
    { label: 'Audit', href: '/audit' },
    { label: 'Flags', href: '/flags' },
    { label: 'Settings', href: '/settings' },
    { label: 'Demo', href: '/demo' },
  ],
  // Present unconditionally (ZoneKey requires it) — only reachable via nav
  // when FULFILLMENT_ENABLED gates the zone itself into ZONES above. Every
  // route here has a real page.tsx (S1 ships stubs for shipments/exceptions/
  // vendors/config — see each page's header comment for which slice owns it).
  fulfillment: [
    { label: 'Queue', href: '/fulfillment', exact: true },
    { label: 'Shipments', href: '/fulfillment/shipments' },
    { label: 'Exceptions', href: '/fulfillment/exceptions' },
    { label: 'Vendors', href: '/fulfillment/vendors' },
    { label: 'Config', href: '/fulfillment/config' },
  ],
};

// ─── Sub-Nav Right-Side Actions ──────────────────────────────────────────────

export interface SubNavAction {
  label: string;
  href?: string;
  /** If true, rendered as a toggle group instead of a link */
  isViewToggle?: boolean;
}

export const ZONE_ACTIONS: Partial<Record<ZoneKey, SubNavAction>> = {
  content: { label: '+ Add Product', href: '/catalog/new' },
};

// ─── Profile Menu Items ──────────────────────────────────────────────────────

export interface ProfileMenuItem {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Optional meta text shown right-aligned */
  meta?: string;
  /** If set, menu item triggers an action instead of navigation */
  action?: 'sign-out';
}

export const PROFILE_MENU_ITEMS: ProfileMenuItem[] = [
  { label: 'Settings', icon: Settings, href: '/settings' },
  { label: 'Help', icon: HelpCircle, href: '/settings' },
  { label: 'Sign Out', icon: LogOut, href: '#', action: 'sign-out' },
];
