'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { ZONES, ZONE_SUB_ITEMS, type ZoneKey, type SubNavItem } from '@/config/navigation';

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
    const breadcrumbs = isDeepPage ? buildBreadcrumbs(pathname, zone) : [];

    return {
      zone: zone.key,
      zoneConfig: zone,
      subNavItems,
      isDeepPage,
      breadcrumbs,
      activeSubNavHref,
    };
  }, [pathname]);
}

function detectDeepPage(pathname: string, zoneKey: ZoneKey): boolean {
  const deepPatterns: Record<ZoneKey, RegExp[]> = {
    overview: [],
    people: [
      /^\/users\/[^/]+/,
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
  zone: (typeof ZONES)[number]
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ label: zone.label, href: zone.href }];

  const segments = pathname.replace(/^\//, '').split('/').filter(Boolean);

  let currentPath = '';
  for (let i = 0; i < segments.length; i++) {
    currentPath += '/' + segments[i];
    const segment = segments[i];

    if (i === 0) {
      crumbs.push({ label: formatSegment(segment), href: currentPath });
      continue;
    }

    const isLast = i === segments.length - 1;
    crumbs.push({
      label: formatSegment(segment),
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
