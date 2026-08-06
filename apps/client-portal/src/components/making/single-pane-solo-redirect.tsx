'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useFeatureFlag } from '@/hooks/use-feature-flag';

interface SinglePaneSoloRedirectProps {
  /** Every project this client can open, in the order the list renders them. */
  projectIds: string[];
}

/**
 * One job, no list: a client with exactly one project should land on that
 * project, not on a list of one.
 *
 * Renders nothing. Mounts alongside the existing `/projects` list — the list
 * still renders and still works, which is what keeps this fail-closed: while
 * the flag loads, and forever if it never resolves, the client sees today's
 * page. Only a resolved-true flag and a client with exactly one project moves
 * anyone, and `replace` keeps the list out of the back-button history so
 * "back" leaves the portal rather than bouncing between the two.
 *
 * Clients with two or more projects keep the list under the flag — the pane is
 * one project's story, and choosing which story is still a real choice.
 */
export function SinglePaneSoloRedirect({ projectIds }: SinglePaneSoloRedirectProps) {
  const router = useRouter();
  const { value: singlePane, isLoading } = useFeatureFlag('single-pane');
  const soloProjectId = projectIds.length === 1 ? projectIds[0] : null;

  useEffect(() => {
    if (isLoading || !singlePane || !soloProjectId) return;
    router.replace(`/projects/${soloProjectId}`);
  }, [isLoading, router, singlePane, soloProjectId]);

  return null;
}
