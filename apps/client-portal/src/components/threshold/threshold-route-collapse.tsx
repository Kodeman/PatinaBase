'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { useFeatureFlag } from '@/hooks/use-feature-flag';

import { collapsedHref } from './route-collapse';

interface ThresholdRouteCollapseProps {
  /** Every project this client can open, in the order the list renders them. */
  projectIds: string[];
}

/**
 * The destination anchor is a Threshold section that hydrates from
 * client-side data after the route change — it usually doesn't exist yet at
 * the moment the browser's own hash-scroll runs (which checks once, at the
 * first commit, and gives up if the element is absent). This is the cap on
 * how long we poll for it ourselves before giving up too.
 */
const SCROLL_POLL_TIMEOUT_MS = 2000;

/**
 * The eight old top-level destinations (the seven nav routes plus
 * `/messages`) collapse to anchors on the one project page for a
 * solo-project client under the Threshold. A client sitting on one of those
 * old routes — a stale bookmark, a link from an old email — should land on
 * the matching anchor, not the standalone page.
 *
 * Renders nothing. Mounts alongside `<AppChrome>` for every authenticated
 * page, same fail-closed shape as `SinglePaneSoloRedirect`: while the flag is
 * loading, and forever if it never resolves, nothing moves. Only a
 * resolved-true flag, a client with exactly one project, and a path that
 * maps to an anchor triggers the hop, and `replace` keeps the old route out
 * of the back-button history.
 *
 * No re-fire guard is needed: once the hop lands on `/projects/<id>`, that
 * path is unmapped, so `collapsedHref` returns null and the effect is
 * naturally inert — until the client visits another mapped route, at which
 * point it should (and does) collapse again. This mirrors
 * `SinglePaneSoloRedirect`, which relies on the same self-termination.
 */
export function ThresholdRouteCollapse({ projectIds }: ThresholdRouteCollapseProps) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { value: threshold, isLoading } = useFeatureFlag('threshold');
  const soloProjectId = projectIds.length === 1 ? projectIds[0] : null;

  // Holds the in-flight scroll poll's cancel function so a later hop (or the
  // component's own unmount) can stop a still-running poll. Kept in a ref
  // outside the redirect effect below on purpose: that effect re-runs the
  // moment `pathname` updates to the destination it just replaced to, and an
  // effect cleanup tied to that re-run would cancel the poll before the
  // anchor has had a chance to render.
  const cancelScrollPollRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (isLoading || !threshold || !soloProjectId) return;

    const href = collapsedHref(pathname, soloProjectId);
    if (!href) return;

    router.replace(href);

    const anchor = href.split('#')[1];
    if (!anchor) return;

    cancelScrollPollRef.current?.();

    let cancelled = false;
    let rafId: number;
    const startedAt = Date.now();

    const poll = () => {
      if (cancelled) return;
      const el = document.getElementById(anchor);
      if (el) {
        el.scrollIntoView({ block: 'start' });
        return;
      }
      if (Date.now() - startedAt >= SCROLL_POLL_TIMEOUT_MS) return;
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);

    cancelScrollPollRef.current = () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [isLoading, pathname, router, soloProjectId, threshold]);

  // Stop a still-running scroll poll if the component unmounts outright.
  useEffect(() => {
    return () => {
      cancelScrollPollRef.current?.();
    };
  }, []);

  return null;
}
