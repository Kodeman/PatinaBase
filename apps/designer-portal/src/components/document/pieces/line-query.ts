import type { UseQueryResult } from '@tanstack/react-query';

type LineQuery = Pick<UseQueryResult<readonly unknown[]>,
  'data' | 'isPending' | 'isFetching' | 'isStale' | 'error'>;

/** The native query publishes only complete buffered lists, never intermediate pages. */
export function lineQueryState(query: LineQuery) {
  const total = query.data?.length ?? null;
  return {
    total,
    loading: query.isPending,
    refreshing: total !== null && query.isFetching,
    stale: query.isStale,
    error: query.error,
  };
}
