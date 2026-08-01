/**
 * Presentation state for `/doc/[id]` resolution.
 *
 * A lifecycle mutation can invalidate a cached `missing` result immediately
 * before the newly-created relationship/proposal row is re-read. That miss is
 * not a dead end while the query is actively fetching. Conversely, an already
 * resolved document stays visible during ordinary background refetches.
 */
export function documentResolutionState({
  resolutionKind,
  isLoading,
  isFetching,
}: {
  resolutionKind: 'engagement' | 'redirect' | 'missing' | undefined;
  isLoading: boolean;
  isFetching: boolean;
}): 'loading' | 'missing' | 'ready' {
  if (resolutionKind === 'engagement') return 'ready';
  if (
    isLoading ||
    isFetching ||
    resolutionKind === 'redirect' ||
    resolutionKind === undefined
  ) {
    return 'loading';
  }
  return 'missing';
}
