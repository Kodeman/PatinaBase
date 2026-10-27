import type { UseQueryResult } from '@tanstack/react-query';

type LineQuery = Pick<UseQueryResult<readonly unknown[]>,
  'data' | 'isPending' | 'isFetching' | 'isStale' | 'error'>;

/** Matches the canonical useProjectFFEItems transport, not a UI pagination policy. */
const PAGE_SIZE = 1000;

/** The native query publishes only complete buffered lists, never intermediate pages. */
export function lineQueryState(query: LineQuery) {
  const total = query.data?.length ?? null;
  return {
    total,
    pages: total === null ? null : Math.ceil(total / PAGE_SIZE),
    loading: query.isPending,
    refreshing: total !== null && query.isFetching,
    stale: query.isStale,
    error: query.error,
  };
}
