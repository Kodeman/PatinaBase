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
  isError,
}: {
  resolutionKind: 'engagement' | 'redirect' | 'missing' | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
}): 'loading' | 'missing' | 'ready' | 'error' {
  if (resolutionKind === 'engagement') return 'ready';
  if (isError) return 'error';
  if (isLoading || isFetching || resolutionKind === 'redirect') {
    return 'loading';
  }
  return 'missing';
}
