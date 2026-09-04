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
 * The seven old top-level destinations collapse to anchors on the one
 * project page for a solo-project client under the Threshold. A client
 * sitting on one of those old routes — a stale bookmark, a link from an old
 * email — should land on the matching anchor, not the standalone page.
 *
 * Renders nothing. Mounts alongside `<AppChrome>` for every authenticated
 * page, same fail-closed shape as `SinglePaneSoloRedirect`: while the flag is
 * loading, and forever if it never resolves, nothing moves. Only a
 * resolved-true flag, a client with exactly one project, and a path that maps
 * to an anchor triggers the hop, and `replace` keeps the old route out of the
 * back-button history. A ref guards against firing more than once for the
 * same resolved state.
 */
export function ThresholdRouteCollapse({ projectIds }: ThresholdRouteCollapseProps) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { value: threshold, isLoading } = useFeatureFlag('threshold');
  const soloProjectId = projectIds.length === 1 ? projectIds[0] : null;
  const hasReplaced = useRef(false);

  useEffect(() => {
    if (isLoading || !threshold || !soloProjectId) return;
    if (hasReplaced.current) return;

    const href = collapsedHref(pathname, soloProjectId);
    if (!href) return;

    hasReplaced.current = true;
    router.replace(href);
  }, [isLoading, pathname, router, soloProjectId, threshold]);

  return null;
}
