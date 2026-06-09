import {
  CalendarDays,
  TrendingUp,
  ShoppingBag,
  Package,
  Users,
  MessageSquare,
  DollarSign,
  Image,
  HelpCircle,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

// ─── Zone Definitions ────────────────────────────────────────────────────────

export type ZoneKey = 'today' | 'pipeline' | 'procurement' | 'products' | 'aesthete' | 'clients' | 'messages';

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
      '/portal/rooms',
    ],
    icon: TrendingUp,
  },
  {
    key: 'procurement',
    label: 'Procurement',
    href: '/portal/procurement',
    paths: ['/portal/procurement'],
    icon: ShoppingBag,
  },
  {
    key: 'products',
    label: 'Products',
    // Products IS the three-layer Library now; the legacy single-tier
    // /portal/catalog list page redirects here.
    href: '/portal/library/personal',
    paths: [
      '/portal/library',
      '/portal/catalog', // detail / edit / new / import / collections / categories still live here
      '/portal/vendors', // vendor directory + detail join the products zone for the global breadcrumb
    ],
    icon: Package,
  },
  {
    key: 'aesthete',
    label: 'Aesthete',
    href: '/portal/teaching',
    paths: [
      '/portal/teaching',
      '/portal/companion',
    ],
    icon: Sparkles,
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
  {
    key: 'messages',
    label: 'Messages',
    href: '/portal/messages',
    paths: ['/portal/messages'],
    icon: MessageSquare,
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
    { label: 'Leads', href: '/portal/leads', dotColor: 'var(--color-dusty-blue, #8B9CAD)' },
    { label: 'Proposals', href: '/portal/proposals', dotColor: 'var(--color-golden-hour, #E8C547)' },
    { label: 'Active', href: '/portal/projects', dotColor: 'var(--color-clay, #C4A57B)' },
    { label: 'Completed', href: '/portal/projects?status=completed', dotColor: 'var(--color-sage, #A8B5A0)' },
    { label: 'Rooms', href: '/portal/rooms', dotColor: 'var(--color-terracotta, #D4A090)' },
  ],
  procurement: [
    { label: 'By Vendor', href: '/portal/procurement/by-vendor' },
    { label: 'By Status', href: '/portal/procurement/by-status' },
    { label: 'Calendar', href: '/portal/procurement/calendar' },
    { label: 'Receiving', href: '/portal/procurement/receiving' },
  ],
  // Products renders the three-layer Library picker (My Library / Studio Library
  // / Patina Catalog) via LibraryLayerNav, special-cased in SubNav — not these
  // uniform tabs. Kept empty so the generic renderer has nothing to draw.
  products: [],
  aesthete: [
    { label: 'Teaching', href: '/portal/teaching' },
    { label: 'Aesthete Engine', href: '/portal/companion' },
  ],
  clients: [
    { label: 'All Clients', href: '/portal/clients', exact: true },
    { label: 'Reviews', href: '/portal/reviews' },
    { label: 'Nurture Queue', href: '/portal/nurture' },
    { label: 'Decisions', href: '/portal/decisions' },
  ],
  messages: [
    { label: 'Inbox', href: '/portal/messages', exact: true },
    { label: 'Direct', href: '/portal/messages?scope=direct' },
    { label: 'Projects', href: '/portal/messages?scope=project' },
    { label: 'Vendors', href: '/portal/messages?scope=vendor_brief' },
    { label: 'Archived', href: '/portal/messages?scope=archived' },
  ],
};

// ─── Sub-Nav Right-Side Actions ──────────────────────────────────────────────

export interface SubNavAction {
  label: string;
  href?: string;
}

export const ZONE_ACTIONS: Partial<Record<ZoneKey, SubNavAction>> = {
  products: { label: '+ Add Product', href: '/portal/catalog/new' },
  clients: { label: '+ Add Client', href: '/portal/clients?add=1' },
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
  { label: 'Help & Resources', icon: HelpCircle, href: '/portal/resources' },
];
