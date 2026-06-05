'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { ZONES, ZONE_SUB_ITEMS, type ZoneKey, type SubNavItem } from '@/config/navigation';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  /** Set when the segment is a UUID, so SubNav can resolve it to a name. */
  resourceType?:
    | 'project'
    | 'client'
    | 'proposal'
    | 'decision'
    | 'product'
    | 'room'
    | 'lead';
  resourceId?: string;
}

/**
 * Maps the first path segment under /portal to the entity type its UUID
 * children represent, so SubNav can swap raw UUIDs for real names.
 *
 * COUPLED: a new root must be added in THREE places to render correctly:
 *   1. here (RESOURCE_BY_ROOT) — so the UUID child gets a resourceType,
 *   2. the first-segment skip-list + `labels` map in buildBreadcrumbs() below
 *      — so the root segment renders a friendly label instead of the raw slug,
 *   3. a matching resolver case in BreadcrumbLabel (sub-nav.tsx) — so the
 *      resourceType actually resolves to a name (the `never` guard there will
 *      flag a missing case at compile time).
 */
const RESOURCE_BY_ROOT: Record<string, BreadcrumbItem['resourceType']> = {
  projects: 'project',
  clients: 'client',
  proposals: 'proposal',
  decisions: 'decision',
  catalog: 'product',
  leads: 'lead',
  rooms: 'room',
};

const BREADCRUMB_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      // Stage tabs point at dedicated entity pages (Leads/Proposals/Projects)
      // rather than /portal/pipeline?stage= filters. Match the configured tab
      // hrefs exactly so SubNav's string-equality highlight works. The two
      // /portal/projects tabs (Active vs Completed) are disambiguated by ?status.
      if (pathname.startsWith('/portal/leads')) {
        activeSubNavHref = '/portal/leads';
      } else if (pathname.startsWith('/portal/proposals')) {
        activeSubNavHref = '/portal/proposals';
      } else if (pathname.startsWith('/portal/projects')) {
        activeSubNavHref =
          searchParams.get('status') === 'completed'
            ? '/portal/projects?status=completed'
            : '/portal/projects';
      } else if (pathname.startsWith('/portal/rooms')) {
        activeSubNavHref = '/portal/rooms';
      } else if (pathname === '/portal/pipeline') {
        activeSubNavHref = '/portal/pipeline';
      }
    } else if (zone.key === 'messages') {
      // Messages uses ?scope=… for sub-nav filtering. The base /portal/messages
      // path is "Inbox"; deeper /portal/messages/:threadId routes also surface
      // as Inbox so the back-to-inbox affordance feels consistent.
      const scope = searchParams.get('scope');
      if (scope) {
        activeSubNavHref = `/portal/messages?scope=${scope}`;
      } else {
        activeSubNavHref = '/portal/messages';
      }
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
      /^\/portal\/rooms\/[^/]+/,        // /portal/rooms/[id]
    ],
    procurement: [],                    // Sprint 1: no deep sub-routes
    products: [
      /^\/portal\/catalog\/[^/]+/,      // /portal/catalog/[id] (but not /catalog/import, /catalog/new, /catalog/collections, /catalog/categories)
      /^\/portal\/teaching\/product/,   // /portal/teaching/product/[id]
    ],
    clients: [
      /^\/portal\/clients\/[^/]+/,      // /portal/clients/[id]
      /^\/portal\/decisions\/[^/]+/,    // /portal/decisions/[id]
    ],
    messages: [],
  };

  // Exclude known non-deep sub-routes
  const nonDeepPaths = [
    '/portal/catalog/new',
    '/portal/catalog/import',
    '/portal/catalog/collections',
    '/portal/catalog/categories',
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
    // COUPLED with RESOURCE_BY_ROOT (above) + BreadcrumbLabel resolvers in
    // sub-nav.tsx — new roots must be added in all three. See RESOURCE_BY_ROOT.
    if (i === 0 && ['projects', 'proposals', 'leads', 'catalog', 'clients', 'decisions', 'teaching', 'rooms'].includes(segment)) {
      // Map to a friendly label
      const labels: Record<string, string> = {
        projects: 'Active',
        proposals: 'Proposals',
        leads: 'Leads',
        catalog: 'Catalog',
        clients: 'Clients',
        decisions: 'Decisions',
        teaching: 'Teaching',
        rooms: 'Rooms',
      };
      crumbs.push({ label: labels[segment] || segment, href: currentPath });
      continue;
    }

    // For ID-like segments, we just use the segment as-is (will be resolved by
    // SubNav into a project/client name). The last segment gets no href (it's
    // the current page).
    const isLast = i === segments.length - 1;
    const isUuid = BREADCRUMB_UUID_RE.test(segment);
    let resourceType: BreadcrumbItem['resourceType'] = isUuid
      ? RESOURCE_BY_ROOT[segments[0]]
      : undefined;

    // Teaching product detail (/portal/teaching/product/<productId>) — the id
    // segment is a real products UUID (the page fetches it via useProduct), so
    // resolve it as a product. Slug-shaped ids won't match BREADCRUMB_UUID_RE,
    // leaving resourceType undefined (formatted segment fallback).
    if (
      isUuid &&
      segments[0] === 'teaching' &&
      segments[1] === 'product' &&
      i === 2
    ) {
      resourceType = 'product';
    }
    crumbs.push({
      // Keep the raw id as the fallback label; SubNav swaps in the resolved name.
      label: isUuid ? segment : formatSegment(segment),
      href: isLast ? undefined : currentPath,
      resourceType,
      resourceId: resourceType ? segment : undefined,
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
