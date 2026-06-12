'use client';

/**
 * R21 flight telemetry. After the flip (the-document-pilot graduated), any
 * visit to an old zone fires `document_zone_flight` with the from-route and
 * the last document in hand — the instrument that replaces the twice-missed
 * Q14 and ranks the dissolve backlog. Mounted in the old-portal layout; a
 * no-op before the flip and on the bare /portal landing (which is the flip
 * redirect itself, not a flight).
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { documentEvents } from '@/lib/analytics/document-events';

export function ZoneFlightTelemetry() {
  const pathname = usePathname();
  const { value: flipped } = useFeatureFlag('the-document-pilot');
  const lastFired = useRef<string | null>(null);

  useEffect(() => {
    if (!flipped || !pathname) return;
    // The bare /portal is the flip redirect to /desk, not a flight.
    if (pathname === '/portal') return;
    if (lastFired.current === pathname) return;
    lastFired.current = pathname;
    documentEvents.zoneFlight(pathname);
  }, [flipped, pathname]);

  return null;
}
