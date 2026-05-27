'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { procurementEvents } from '@/lib/analytics/procurement-events';

/**
 * Procurement zone layout — gates the `/portal/procurement/*` route group
 * behind the `procurement-workspace-pilot` PostHog feature flag (dossier §6).
 *
 * When the flag is off, deep-links to `/portal/procurement/by-vendor` etc.
 * render a "Coming soon" placeholder instead of 404ing or redirecting. This is
 * gentler than a redirect for designers who bookmark a URL before being added
 * to the pilot cohort.
 *
 * Also fires the `procurement_zone_visited` exposure event on every entry into
 * the zone (one-time per pathname change — not per re-render).
 */
export default function ProcurementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pilotEnabled = useFeatureFlag('procurement-workspace-pilot');
  const pathname = usePathname();

  useEffect(() => {
    if (!pilotEnabled) return;
    // sub_view derives from the path segment after /portal/procurement/.
    // Examples:  /portal/procurement → undefined (root redirect handles this)
    //            /portal/procurement/by-vendor → 'by-vendor'
    //            /portal/procurement/calendar → 'calendar'
    const subView = pathname?.match(/\/portal\/procurement\/([^/?]+)/)?.[1];
    procurementEvents.zoneVisited(subView ? { sub_view: subView } : {});
  }, [pathname, pilotEnabled]);

  if (!pilotEnabled) {
    return <ProcurementComingSoon />;
  }

  return <>{children}</>;
}

/**
 * Coming-soon placeholder rendered when a non-pilot designer hits any
 * `/portal/procurement/*` route. Visually consistent with other portal
 * empty-state cards so it doesn't feel like an error page.
 */
function ProcurementComingSoon() {
  return (
    <div className="pt-12">
      <div className="mx-auto max-w-2xl rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-8 py-12 text-center">
        <div className="type-meta-small mb-3 text-[var(--color-clay,#C4A57B)]">
          Coming soon
        </div>
        <h1 className="type-section-head mb-3">Procurement Workspace</h1>
        <p className="mx-auto max-w-md text-[0.85rem] leading-relaxed text-[var(--text-muted)]">
          We&apos;re piloting the Procurement workspace with a small group of
          designers before rolling it out broadly. Talk to your Patina contact
          if you&apos;d like to join the pilot.
        </p>
      </div>
    </div>
  );
}
