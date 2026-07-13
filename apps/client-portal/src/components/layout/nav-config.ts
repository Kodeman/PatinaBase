import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  CheckSquare,
  FileText,
  Receipt,
  PieChart,
  Folder,
  Package,
} from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown directly in the desktop bar; the rest collapse into "More ▾". */
  primary: boolean;
}

// Single source of truth for the client-portal destinations — feeds the
// desktop bar, the "More ▾" overflow menu, and the mobile drawer so they can
// never drift. Rooms is intentionally not here: it is gated on the homeowner
// actually having room scans and stays a conditional icon in the header.
export const NAV_ITEMS: NavItem[] = [
  { key: 'today', label: 'Today', href: '/today', icon: CalendarDays, primary: true },
  { key: 'decisions', label: 'Decisions', href: '/decisions', icon: CheckSquare, primary: true },
  { key: 'proposals', label: 'Proposals', href: '/proposals', icon: FileText, primary: true },
  { key: 'invoices', label: 'Invoices', href: '/invoices', icon: Receipt, primary: true },
  { key: 'budget', label: 'Budget', href: '/budget', icon: PieChart, primary: false },
  { key: 'documents', label: 'Documents', href: '/documents', icon: Folder, primary: false },
  { key: 'orders', label: 'Orders', href: '/orders', icon: Package, primary: false },
];

export const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => item.primary);
export const OVERFLOW_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.primary);
