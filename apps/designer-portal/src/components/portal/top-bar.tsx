'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { useActiveZone } from '@/hooks/use-active-zone';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { ZONES, type ZoneKey } from '@/config/navigation';
import { UtilityBar } from './utility-bar';

// ─── First Project Walkthrough tour anchors (Sprint 3 W1) ────────────────────
//
// The tour uses `[data-tour-anchor="<key>"]` CSS selectors to position
// coachmark popovers. These anchors live on the global top nav so the tour
// can fire from anywhere in the portal without depending on which page the
// user is on. The Aesthete step (step 3) does NOT get its own zone — the
// Aesthete Engine lives under the Products subnav, which only renders when
// Products is the active zone. For Sprint 3 we render an invisible
// positioning marker inside the Products zone link instead, so step 3 lands
// in the same general area as step 4 with distinct CMS-authored copy
// explaining how to reach the Aesthete Engine.
const TOUR_ANCHOR_FOR_ZONE: Partial<Record<ZoneKey, string>> = {
  today: 'today',
  pipeline: 'pipeline',
  products: 'products',
};

export function TopBar() {
  const { zone: activeZoneKey } = useActiveZone();
  const prefersReducedMotion = useReducedMotion();

  // Procurement workspace is behind the `procurement-workspace-pilot` flag.
  // Hide the zone in the top nav when the flag is off so non-pilot designers
  // never see a tab they can't use. Route-level gating lives in
  // `/portal/procurement/layout.tsx` so deep-links land on a Coming Soon
  // placeholder rather than 404ing through the nav filter.
  const procurementPilotEnabled = useFeatureFlag('procurement-workspace-pilot');
  const visibleZones = ZONES.filter((zone) => {
    if (zone.key === 'procurement') return procurementPilotEnabled;
    return true;
  });

  return (
    <header className="hidden border-b border-[var(--border-default)] bg-[var(--bg-surface)] md:block">
      <div className="flex h-[52px] items-center px-5 lg:px-8">
        {/* Logo */}
        <Link
          href="/portal"
          className="mr-8 flex-shrink-0 font-heading text-[0.72rem] font-medium uppercase tracking-[0.2em] text-[var(--text-primary)] no-underline"
        >
          Patina
        </Link>

        {/* Primary Navigation — 4 Zones */}
        <nav className="flex h-full flex-1 items-stretch gap-0">
          {visibleZones.map((zone) => {
            const isActive = activeZoneKey === zone.key;
            const tourAnchor = TOUR_ANCHOR_FOR_ZONE[zone.key];
            return (
              <Link
                key={zone.key}
                href={zone.href}
                data-tour-anchor={tourAnchor}
                className={`relative flex items-center whitespace-nowrap border-b-2 px-[0.85rem] text-[0.75rem] no-underline transition-colors ${
                  isActive
                    ? 'border-[var(--accent-primary)] font-medium text-[var(--text-primary)]'
                    : 'border-transparent font-normal text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {zone.label}
                {/* Aesthete tour anchor (step 3) — invisible sibling inside the
                    Products zone link. The Aesthete Engine lives at /portal/companion
                    under the Products subnav; this anchor lets the tour position its
                    step 3 coachmark on the Products zone in the global nav so it
                    remains visible across all pages during the walkthrough. */}
                {zone.key === 'products' && (
                  <span
                    aria-hidden="true"
                    data-tour-anchor="aesthete"
                    className="pointer-events-none absolute inset-0"
                  />
                )}
                {isActive && (
                  <motion.span
                    layoutId="zone-indicator"
                    className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[var(--accent-primary)]"
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
        </nav>

        {/* Utility Bar — Search, Notifications, Messages, Profile */}
        <UtilityBar />
      </div>
    </header>
  );
}
