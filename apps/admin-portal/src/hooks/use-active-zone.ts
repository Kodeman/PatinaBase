'use client';

import { usePathname } from 'next/navigation';
import { useContext, useMemo } from 'react';
import { ZONES, ZONE_SUB_ITEMS, type ZoneKey, type SubNavItem } from '@/config/navigation';
import { BreadcrumbContext } from '@/contexts/breadcrumb-context';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface ActiveZoneResult {
  zone: ZoneKey | null;
  zoneConfig: (typeof ZONES)[number] | null;
  subNavItems: SubNavItem[];
  isDeepPage: boolean;
  breadcrumbs: BreadcrumbItem[];
  activeSubNavHref: string | null;
}

/**
 * Derives the active navigation zone, sub-nav items, and breadcrumb state
 * from the current pathname. Used by TopBar, SubNav, and MobileTabBar.
 */
export function useActiveZone(): ActiveZoneResult {
  const pathname = usePathname();
  // Optional: outside a BreadcrumbProvider this reads null and every deep
  // page falls back to the plain URL-derived label (R3.6, C1 fix).
  const breadcrumbCtx = useContext(BreadcrumbContext);
  const lastLabelOverride = breadcrumbCtx?.lastLabel ?? null;

  return useMemo(() => {
    // Match zones by longest prefix to be safe if paths overlap
    const zone = [...ZONES]
      .sort((a, b) => {
        const longestA = Math.max(...a.paths.map((p) => p.length));
        const longestB = Math.max(...b.paths.map((p) => p.length));
        return longestB - longestA;
      })
      .find((z) => z.paths.some((p) => pathname === p || pathname.startsWith(p + '/')));

    if (!zone) {
      return {
        zone: null,
        zoneConfig: null,
        subNavItems: [],
        isDeepPage: false,
        breadcrumbs: [],
        activeSubNavHref: null,
      };
    }

    const subNavItems = ZONE_SUB_ITEMS[zone.key];

    let activeSubNavHref: string | null = null;
    for (const item of [...subNavItems].reverse()) {
      const itemPath = item.href.split('?')[0];
      if (item.exact) {
        if (pathname === itemPath) {
          activeSubNavHref = item.href;
          break;
        }
      } else {
        if (pathname === itemPath || pathname.startsWith(itemPath + '/')) {
          activeSubNavHref = item.href;
          break;
        }
      }
    }

    const isDeepPage = detectDeepPage(pathname, zone.key);
    const breadcrumbs = isDeepPage ? buildBreadcrumbs(pathname, zone, lastLabelOverride) : [];

    return {
      zone: zone.key,
      zoneConfig: zone,
      subNavItems,
      isDeepPage,
      breadcrumbs,
      activeSubNavHref,
    };
  }, [pathname, lastLabelOverride]);
}

function detectDeepPage(pathname: string, zoneKey: ZoneKey): boolean {
  const deepPatterns: Record<ZoneKey, RegExp[]> = {
    overview: [],
    people: [
      /^\/users\/[^/]+/,
      /^\/studios\/[^/]+/,
      /^\/applications\/[^/]+/,
      /^\/verification\/[^/]+/,
    ],
    content: [
      /^\/catalog\/[^/]+/,
    ],
    operations: [
      /^\/orders\/[^/]+/,
      /^\/projects\/[^/]+/,
    ],
    system: [
      /^\/audit\/[^/]+/,
      /^\/flags\/[^/]+/,
    ],
    // S1: the Order Workbench route (S2 builds the real page; a placeholder
    // ships today — see app/(dashboard)/fulfillment/orders/[orderId]/page.tsx).
    fulfillment: [
      /^\/fulfillment\/orders\/[^/]+/,
    ],
  };

  const nonDeepPaths = [
    '/catalog/new',
    '/catalog/categories',
    '/catalog/collections',
  ];
  if (nonDeepPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return false;
  }

  return deepPatterns[zoneKey]?.some((pattern) => pattern.test(pathname)) ?? false;
}

function buildBreadcrumbs(
  pathname: string,
  zone: (typeof ZONES)[number],
  lastLabelOverride: string | null = null
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ label: zone.label, href: zone.href }];

  const segments = pathname.replace(/^\//, '').split('/').filter(Boolean);

  let currentPath = '';
  for (let i = 0; i < segments.length; i++) {
    currentPath += '/' + segments[i];
    const segment = segments[i];
    const formatted = formatSegment(segment);

    // Skip a first path segment that only re-states the zone crumb already
    // pushed above (R3.6, C1 fix) — a zone-config artifact: the fulfillment
    // zone's label ('Fulfillment') and its own first URL segment
    // ('/fulfillment') format to identical text, so this loop doubled it on
    // EVERY /fulfillment/* deep page ("Fulfillment > Fulfillment > …"). No
    // other zone's first segment collides with its label today, but the
    // guard is zone-generic so it protects any future zone that does.
    if (i === 0 && formatted === zone.label) {
      continue;
    }

    const isLast = i === segments.length - 1;
    crumbs.push({
      // The last segment can be overridden by the page itself (e.g. an order
      // UUID → "Order #1 · Priya Anand", R3.6) — see useBreadcrumbLastLabel.
      label: isLast && lastLabelOverride ? lastLabelOverride : formatted,
      href: isLast ? undefined : currentPath,
    });
  }

  return crumbs;
}

function formatSegment(segment: string): string {
  return segment
    .replace(/-/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
