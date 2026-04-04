'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useActiveZone } from '@/hooks/use-active-zone';
import { useNavCounts } from '@/hooks/use-nav-counts';
import { ZONE_ACTIONS } from '@/config/navigation';

export function SubNav() {
  const { zone, subNavItems, isDeepPage, breadcrumbs, activeSubNavHref } = useActiveZone();
  const counts = useNavCounts(zone);
  const prefersReducedMotion = useReducedMotion();

  // No sub-nav for Today zone or when there are no items
  if (!zone || subNavItems.length === 0) return null;

  const action = zone ? ZONE_ACTIONS[zone] : undefined;

  return (
    <nav className="hidden border-b border-[rgba(229,226,221,0.6)] bg-[var(--bg-primary)] md:block">
      <div className="mx-auto flex w-[90vw] max-w-portal items-center">
        {isDeepPage ? (
          // Breadcrumb mode for deep pages
          <div className="flex h-[38px] items-center gap-1.5">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && (
                  <ChevronRight className="h-3 w-3 text-[var(--text-muted)] opacity-40" />
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--accent-primary)] no-underline hover:text-[var(--text-primary)]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
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
        {!isDeepPage && action && !action.isViewToggle && action.href && (
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

        {/* Pipeline view toggle */}
        {!isDeepPage && action?.isViewToggle && zone === 'pipeline' && (
          <PipelineViewToggle />
        )}
      </div>
    </nav>
  );
}

function PipelineViewToggle() {
  const router = useRouter();

  // For now, default to List view. Could be stored in URL params or local state.
  return (
    <div className="ml-auto flex items-center gap-2">
      <span className="font-mono text-[0.55rem] uppercase tracking-wider text-[var(--text-muted)]">
        View:
      </span>
      <button
        className="text-[0.68rem] text-[var(--text-primary)]"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        List
      </button>
      <button
        className="text-[0.68rem] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-body)' }}
        onClick={() => {
          // TODO: Implement timeline view toggle
        }}
      >
        Timeline
      </button>
    </div>
  );
}
