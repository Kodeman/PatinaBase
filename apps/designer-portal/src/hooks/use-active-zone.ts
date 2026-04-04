'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { ZONES, ZONE_SUB_ITEMS, type ZoneKey, type SubNavItem } from '@/config/navigation';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface ActiveZoneResult {
  /** The currently active zone key, or null if no zone matches */
  zone: ZoneKey | null;
  /** The zone config object */
  zoneConfig: (typeof ZONES)[number] | null;
  /** Sub-nav items for the active zone */
  subNavItems: SubNavItem[];
  /** Whether the current page is "deep" (should show breadcrumbs instead of sub-nav) */
  isDeepPage: boolean;
  /** Breadcrumb trail for deep pages */
  breadcrumbs: BreadcrumbItem[];
  /** The currently active sub-nav item href */
  activeSubNavHref: string | null;
}

/**
 * Derives the active navigation zone, sub-nav items, and breadcrumb state
 * from the current pathname. Used by TopBar, SubNav, and MobileTabBar.
 */
export function useActiveZone(): ActiveZoneResult {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useMemo(() => {
    // Match zones in reverse so more specific paths match before the `/portal` catch-all
    const zone = [...ZONES].reverse().find((z) =>
      z.paths.some((p) => pathname === p || pathname.startsWith(p + '/'))
    );

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

    // Determine active sub-nav item
    let activeSubNavHref: string | null = null;

    if (zone.key === 'pipeline') {
      // Pipeline uses search params for stage filtering
      const stage = searchParams.get('stage');
      if (stage && pathname === '/portal/pipeline') {
        activeSubNavHref = `/portal/pipeline?stage=${stage}`;
      } else if (pathname === '/portal/pipeline') {
        activeSubNavHref = '/portal/pipeline';
      }
      // If on /portal/leads, /portal/proposals, /portal/projects — map to pipeline stage
      if (pathname.startsWith('/portal/leads')) activeSubNavHref = '/portal/pipeline?stage=leads';
      if (pathname.startsWith('/portal/proposals')) activeSubNavHref = '/portal/pipeline?stage=proposals';
      if (pathname.startsWith('/portal/projects')) activeSubNavHref = '/portal/pipeline?stage=active';
    } else {
      // Standard path matching for other zones
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
    }

    // Deep page detection: more than 1 segment beyond the zone's base path
    // e.g., /portal/projects/abc-123/procurement is deep relative to /portal/pipeline
    const isDeepPage = detectDeepPage(pathname, zone.key);

    // Build breadcrumbs for deep pages
    const breadcrumbs = isDeepPage ? buildBreadcrumbs(pathname, zone) : [];

    return {
      zone: zone.key,
      zoneConfig: zone,
      subNavItems,
      isDeepPage,
      breadcrumbs,
      activeSubNavHref,
    };
  }, [pathname, searchParams]);
}

/**
 * A page is "deep" if it's inside a specific item (e.g., a project detail page).
 * We detect this by checking if the pathname has segments beyond the known sub-nav routes.
 */
function detectDeepPage(pathname: string, zoneKey: ZoneKey): boolean {
  const deepPatterns: Record<ZoneKey, RegExp[]> = {
    today: [],
    pipeline: [
      /^\/portal\/projects\/[^/]+/,    // /portal/projects/[id]
      /^\/portal\/proposals\/[^/]+/,    // /portal/proposals/[id]
      /^\/portal\/leads\/[^/]+/,        // /portal/leads/[id]
      /^\/portal\/pipeline\/[^/]+/,     // /portal/pipeline/[id]
    ],
    products: [
      /^\/portal\/catalog\/[^/]+/,      // /portal/catalog/[id] (but not /catalog/import, /catalog/new, /catalog/collections, /catalog/categories)
      /^\/portal\/teaching\/product/,   // /portal/teaching/product/[id]
    ],
    clients: [
      /^\/portal\/clients\/[^/]+/,      // /portal/clients/[id]
      /^\/portal\/decisions\/[^/]+/,    // /portal/decisions/[id]
    ],
  };

  // Exclude known non-deep sub-routes
  const nonDeepPaths = [
    '/portal/catalog/new',
    '/portal/catalog/import',
    '/portal/catalog/collections',
    '/portal/catalog/categories',
    '/portal/clients/new',
  ];
  if (nonDeepPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return false;
  }

  return deepPatterns[zoneKey]?.some((pattern) => pattern.test(pathname)) ?? false;
}

/**
 * Build a breadcrumb trail from the pathname segments.
 */
function buildBreadcrumbs(
  pathname: string,
  zone: (typeof ZONES)[number]
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [
    { label: zone.label, href: zone.href },
  ];

  // Parse segments after /portal/
  const segments = pathname.replace(/^\/portal\//, '').split('/').filter(Boolean);

  // Build progressive paths
  let currentPath = '/portal';
  for (let i = 0; i < segments.length; i++) {
    currentPath += '/' + segments[i];
    const segment = segments[i];

    // Skip the first segment if it matches the zone name (e.g., "projects" for pipeline)
    if (i === 0 && ['projects', 'proposals', 'leads', 'catalog', 'clients', 'decisions', 'teaching'].includes(segment)) {
      // Map to a friendly label
      const labels: Record<string, string> = {
        projects: 'Active',
        proposals: 'Proposals',
        leads: 'Leads',
        catalog: 'Catalog',
        clients: 'Clients',
        decisions: 'Decisions',
        teaching: 'Teaching',
      };
      crumbs.push({ label: labels[segment] || segment, href: currentPath });
      continue;
    }

    // For ID-like segments, we just use the segment as-is (will be resolved by the page)
    // The last segment gets no href (it's the current page)
    const isLast = i === segments.length - 1;
    crumbs.push({
      label: formatSegment(segment),
      href: isLast ? undefined : currentPath,
    });
  }

  return crumbs;
}

function formatSegment(segment: string): string {
  // Convert kebab-case or camelCase to Title Case
  return segment
    .replace(/-/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
