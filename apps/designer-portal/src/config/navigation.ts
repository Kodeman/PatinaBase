import {
  CalendarDays,
  TrendingUp,
  Package,
  Users,
  DollarSign,
  Image,
  Clock,
  Settings,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';

// ─── Zone Definitions ────────────────────────────────────────────────────────

export type ZoneKey = 'today' | 'pipeline' | 'products' | 'clients';

export interface ZoneConfig {
  key: ZoneKey;
  label: string;
  href: string;
  /** Path prefixes that belong to this zone (checked in order, most specific first) */
  paths: string[];
  icon: LucideIcon;
}

export const ZONES: ZoneConfig[] = [
  {
    key: 'today',
    label: 'Today',
    href: '/portal',
    paths: ['/portal'],
    icon: CalendarDays,
  },
  {
    key: 'pipeline',
    label: 'Pipeline',
    href: '/portal/pipeline',
    paths: [
      '/portal/pipeline',
      '/portal/leads',
      '/portal/proposals',
      '/portal/projects',
    ],
    icon: TrendingUp,
  },
  {
    key: 'products',
    label: 'Products',
    href: '/portal/catalog',
    paths: [
      '/portal/catalog',
      '/portal/teaching',
      '/portal/companion',
    ],
    icon: Package,
  },
  {
    key: 'clients',
    label: 'Clients',
    href: '/portal/clients',
    paths: [
      '/portal/clients',
      '/portal/reviews',
      '/portal/nurture',
      '/portal/decisions',
    ],
    icon: Users,
  },
];

// ─── Sub-Navigation Items ────────────────────────────────────────────────────

export interface SubNavItem {
  label: string;
  href: string;
  /** CSS color value for pipeline stage dot */
  dotColor?: string;
  /** Whether to use exact pathname match (default: prefix match) */
  exact?: boolean;
}

export const ZONE_SUB_ITEMS: Record<ZoneKey, SubNavItem[]> = {
  today: [], // no sub-nav for Today
  pipeline: [
    { label: 'All', href: '/portal/pipeline', exact: true },
    { label: 'Leads', href: '/portal/pipeline?stage=leads', dotColor: 'var(--color-dusty-blue, #8B9CAD)' },
    { label: 'Proposals', href: '/portal/pipeline?stage=proposals', dotColor: 'var(--color-golden-hour, #E8C547)' },
    { label: 'Active', href: '/portal/pipeline?stage=active', dotColor: 'var(--color-clay, #C4A57B)' },
    { label: 'Completed', href: '/portal/pipeline?stage=completed', dotColor: 'var(--color-sage, #A8B5A0)' },
  ],
  products: [
    { label: 'Catalog', href: '/portal/catalog', exact: true },
    { label: 'Capture Queue', href: '/portal/catalog/import' },
    { label: 'Teaching', href: '/portal/teaching' },
    { label: 'Aesthete Engine', href: '/portal/companion' },
  ],
  clients: [
    { label: 'All Clients', href: '/portal/clients', exact: true },
    { label: 'Reviews', href: '/portal/reviews' },
    { label: 'Nurture Queue', href: '/portal/nurture' },
    { label: 'Decisions', href: '/portal/decisions' },
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
  products: { label: '+ Add Product', href: '/portal/catalog/new' },
  clients: { label: '+ Add Client', href: '/portal/clients/new' },
  pipeline: { label: '', isViewToggle: true },
};

// ─── Profile Menu Items ──────────────────────────────────────────────────────

export interface ProfileMenuItem {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Optional meta text shown right-aligned */
  meta?: string;
}

export const PROFILE_MENU_ITEMS: ProfileMenuItem[] = [
  { label: 'Earnings', icon: DollarSign, href: '/portal/earnings' },
  { label: 'Portfolio', icon: Image, href: '/portal/portfolio' },
  { label: 'Time Tracking', icon: Clock, href: '/portal/settings' },
  { label: 'Settings', icon: Settings, href: '/portal/settings' },
  { label: 'Help & Resources', icon: HelpCircle, href: '/portal/resources' },
];
