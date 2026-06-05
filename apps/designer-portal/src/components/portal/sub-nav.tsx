'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useActiveZone, type BreadcrumbItem } from '@/hooks/use-active-zone';
import { useHydrated } from '@/hooks/use-hydrated';
import { useNavCounts } from '@/hooks/use-nav-counts';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { ZONE_ACTIONS } from '@/config/navigation';
import {
  useClient,
  useDecision,
  useProduct,
  useRoom,
  useLead,
  useVendor,
} from '@patina/supabase';
import { useProject } from '@/hooks/use-projects';
import { useProposal } from '@/hooks/use-proposals';
import { leadDisplayName } from '@/lib/lead-format';

// ── Breadcrumb label resolution ────────────────────────────────────────────
//
// Each entity type gets its own resolver component so the entity's React Query
// hook only runs when a crumb of that type is actually present in the trail.
// All resolvers share one loading contract (renderResolved below): NEVER show
// the raw UUID — render a skeleton while loading, a generic singular label on
// error/missing data, and the real name once resolved.

/** Skeleton + generic-label contract shared by every resolver. */
function renderResolved(
  name: string | null | undefined,
  isLoading: boolean,
  fallback: string,
): ReactNode {
  if (isLoading) {
    return (
      <span className="inline-block h-3 w-20 animate-pulse rounded bg-[var(--border-default)]" />
    );
  }
  return <>{name || fallback}</>;
}

/**
 * Resolves the display name for a client breadcrumb segment (tagged by
 * useActiveZone when a UUID appears under /portal/clients/[id]).
 */
function ClientBreadcrumbLabel({ id }: { id: string }) {
  const { data, isLoading } = useClient(id);
  const name = data?.client?.full_name || data?.client_name || data?.client_email;
  return renderResolved(name, isLoading, 'Client');
}

/**
 * Resolves the project name for a project breadcrumb segment so the trail reads
 * "Pipeline › Active › Aspen Loft Refresh" instead of the raw UUID (AP-C7).
 */
function ProjectBreadcrumbLabel({ id }: { id: string }) {
  // useProject's Supabase client is cast to `any` internally (getSupabase()),
  // so its data is untyped — the cast below is genuinely needed to read `name`.
  const { data, isLoading } = useProject(id) as {
    data?: { name?: string };
    isLoading: boolean;
  };
  return renderResolved(data?.name, isLoading, 'Project');
}

/** Resolves a proposal breadcrumb segment to its title. */
function ProposalBreadcrumbLabel({ id }: { id: string }) {
  // useProposal returns a typed `Proposal` (has `title`) — no cast needed.
  const { data, isLoading } = useProposal(id);
  return renderResolved(data?.title, isLoading, 'Proposal');
}

/** Resolves a decision breadcrumb segment to its title. */
function DecisionBreadcrumbLabel({ id }: { id: string }) {
  const { data, isLoading } = useDecision(id);
  return renderResolved(data?.title, isLoading, 'Decision');
}

/**
 * Resolves a product breadcrumb segment to its name. Covers both /portal/catalog/[id]
 * and /portal/teaching/product/[id] (both are real products UUIDs).
 */
function ProductBreadcrumbLabel({ id }: { id: string }) {
  // useProduct queries a typed SupabaseClient<Database> (products.name) — no cast needed.
  const { data, isLoading } = useProduct(id);
  return renderResolved(data?.name, isLoading, 'Product');
}

/** Resolves a room breadcrumb segment to its name. */
function RoomBreadcrumbLabel({ id }: { id: string }) {
  // useRoom returns a typed `Room` (has `name`) — no cast needed.
  const { data, isLoading } = useRoom(id);
  return renderResolved(data?.name, isLoading, 'Room');
}

/**
 * Resolves a vendor breadcrumb segment to its trade/display name. Reuses the
 * same `useVendor(id)` hook (query key ['vendor', id]) the vendor detail page
 * uses, so a warm cache resolves the name without a second fetch.
 */
function VendorBreadcrumbLabel({ id }: { id: string }) {
  // useVendor casts its Supabase client to `any` internally (getSupabase()),
  // so its data is untyped — read trade_name then name.
  const { data, isLoading } = useVendor(id) as {
    data?: { trade_name?: string; name?: string };
    isLoading: boolean;
  };
  return renderResolved(data?.trade_name || data?.name, isLoading, 'Vendor');
}

/** Resolves a lead breadcrumb segment to its display name. */
function LeadBreadcrumbLabel({ id }: { id: string }) {
  const { data, isLoading } = useLead(id) as {
    data?: Parameters<typeof leadDisplayName>[0];
    isLoading: boolean;
  };
  return renderResolved(
    data ? leadDisplayName(data) : undefined,
    isLoading,
    'Lead',
  );
}

/**
 * Dispatches a UUID-tagged breadcrumb crumb to the right entity resolver.
 * Untagged crumbs (and any future resourceType without a resolver) fall back
 * to the crumb's own label.
 */
function BreadcrumbLabel({ crumb }: { crumb: BreadcrumbItem }) {
  if (crumb.resourceType && crumb.resourceId) {
    const id = crumb.resourceId;
    switch (crumb.resourceType) {
      case 'project':
        return <ProjectBreadcrumbLabel id={id} />;
      case 'client':
        return <ClientBreadcrumbLabel id={id} />;
      case 'proposal':
        return <ProposalBreadcrumbLabel id={id} />;
      case 'decision':
        return <DecisionBreadcrumbLabel id={id} />;
      case 'product':
        return <ProductBreadcrumbLabel id={id} />;
      case 'room':
        return <RoomBreadcrumbLabel id={id} />;
      case 'lead':
        return <LeadBreadcrumbLabel id={id} />;
      case 'vendor':
        return <VendorBreadcrumbLabel id={id} />;
      default: {
        // Exhaustiveness guard: adding an 8th resourceType without a resolver
        // here is a COMPILE error. At runtime we still fall through to the
        // crumb's own label rather than ever rendering a raw UUID.
        const _exhaustive: never = crumb.resourceType;
        void _exhaustive;
      }
    }
  }
  return <>{crumb.label}</>;
}

export function SubNav() {
  const { zone, subNavItems, isDeepPage, breadcrumbs, activeSubNavHref } = useActiveZone();
  // Tab counts come from client-side queries; gate them on hydration so SSR
  // (no counts) and the first client paint render the same tree.
  const hydrated = useHydrated();
  const counts = useNavCounts(zone);
  const prefersReducedMotion = useReducedMotion();

  // Procurement sub-nav is gated behind the same pilot flag as the top-nav zone
  // (fail-closed while loading). Non-pilot designers who deep-link into
  // /portal/procurement/* see only the Coming Soon placeholder, not the tabs.
  const { value: procurementPilotEnabled } = useFeatureFlag(
    'procurement-workspace-pilot',
  );

  // No sub-nav for Today zone or when there are no items
  if (!zone || subNavItems.length === 0) return null;
  if (zone === 'procurement' && !procurementPilotEnabled) return null;

  const action = zone ? ZONE_ACTIONS[zone] : undefined;

  return (
    <nav className="hidden border-b border-[rgba(229,226,221,0.6)] bg-[var(--bg-primary)] md:block">
      <div className="mx-auto flex w-[90vw] max-w-portal items-center">
        {isDeepPage ? (
          // Breadcrumb mode for deep pages
          <div className="flex h-[38px] items-center gap-1.5">
            {breadcrumbs.map((crumb, i) => {
              // Resolve UUID segments to a real entity name (tagged by
              // useActiveZone). Works for both linked crumbs (sub-routes) and
              // the current-page crumb (detail pages, which have no href).
              const labelNode = <BreadcrumbLabel crumb={crumb} />;

              return (
              // resourceId forces a remount per entity (project A → B won't
              // flash the stale resolver name); label+index keeps static crumbs
              // stable and unique.
              <span key={crumb.resourceId ?? `${crumb.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && (
                  <ChevronRight className="h-3 w-3 text-[var(--text-muted)] opacity-40" />
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--accent-primary)] no-underline hover:text-[var(--text-primary)]"
                  >
                    {labelNode}
                  </Link>
                ) : (
                  <span className="font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    {labelNode}
                  </span>
                )}
              </span>
              );
            })}
          </div>
        ) : (
          // Normal sub-nav mode
          <div className="flex h-[38px] flex-1 items-stretch gap-0">
            {subNavItems.map((item) => {
              const isActive = activeSubNavHref === item.href;
              const count = counts[item.label];

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center whitespace-nowrap px-[0.7rem] text-[0.7rem] no-underline transition-all first:pl-0 ${
                    isActive
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: isActive && item.dotColor ? item.dotColor : undefined,
                  }}
                >
                  {/* Pipeline stage dot */}
                  {item.dotColor && (
                    <span
                      className="mr-[0.3rem] inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: item.dotColor }}
                    />
                  )}

                  {item.label}

                  {/* Count badge */}
                  {hydrated && count !== undefined && (
                    <span className="ml-1 font-mono text-[0.45rem] text-[var(--text-muted)]">
                      {count}
                    </span>
                  )}

                  {/* Active indicator */}
                  {isActive && (
                    <motion.span
                      layoutId="subnav-indicator"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent-primary)]"
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 380, damping: 30 }
                      }
                    />
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {/* Right-side action */}
        {!isDeepPage && action && action.href && (
          <div className="ml-auto flex items-center">
            <Link
              href={action.href}
              className="text-[0.68rem] text-[var(--accent-primary)] no-underline hover:text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {action.label}
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
