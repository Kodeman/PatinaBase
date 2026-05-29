'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useActiveZone } from '@/hooks/use-active-zone';
import { useNavCounts } from '@/hooks/use-nav-counts';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { ZONE_ACTIONS } from '@/config/navigation';
import { useClient } from '@patina/supabase';
import { useProject } from '@/hooks/use-projects';

/**
 * Resolves the display name for a client breadcrumb segment (tagged by
 * useActiveZone when a UUID appears under /portal/clients/[id]).
 */
function ClientBreadcrumbLabel({ clientId }: { clientId: string }) {
  const { data } = useClient(clientId);
  const displayName =
    data?.client?.full_name || data?.client_name || data?.client_email || clientId;
  return <>{displayName}</>;
}

/**
 * Resolves the project name for a project breadcrumb segment so the trail reads
 * "Pipeline › Active › Aspen Loft Refresh" instead of the raw UUID (AP-C7).
 */
function ProjectBreadcrumbLabel({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId) as { data?: { name?: string } };
  return <>{data?.name || 'Project'}</>;
}

export function SubNav() {
  const { zone, subNavItems, isDeepPage, breadcrumbs, activeSubNavHref } = useActiveZone();
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
              // Resolve UUID segments to a name (tagged by useActiveZone). Works
              // for both linked crumbs (sub-routes) and the current-page crumb
              // (project detail, which has no href).
              const labelNode =
                crumb.resourceType === 'project' && crumb.resourceId ? (
                  <ProjectBreadcrumbLabel projectId={crumb.resourceId} />
                ) : crumb.resourceType === 'client' && crumb.resourceId ? (
                  <ClientBreadcrumbLabel clientId={crumb.resourceId} />
                ) : (
                  crumb.label
                );

              return (
              <span key={i} className="flex items-center gap-1.5">
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
                  {count !== undefined && (
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
