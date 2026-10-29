import { lineQueryState } from '../line-query';

const settled = { isPending: false, isFetching: false, isStale: false, error: null };

it.each([0, 36, 500, 1000, 1001, 2000])('reports the complete total for %i lines', (total) => {
  expect(lineQueryState({ ...settled, data: Array.from({ length: total }) })).toEqual({
    total, loading: false, refreshing: false, stale: false, error: null,
  });
});

it('keeps total and pages unknown during the initial buffered load', () => {
  expect(lineQueryState({ ...settled, data: undefined, isPending: true, isFetching: true, isStale: true }))
    .toEqual({ total: null, loading: true, refreshing: false, stale: true, error: null });
});

it('distinguishes an initial refusal from a successful empty list', () => {
  const error = new Error('second page refused');
  expect(lineQueryState({ ...settled, data: undefined, error, isStale: true }))
    .toEqual({ total: null, loading: false, refreshing: false, stale: true, error });
});

it('keeps the known complete total while a warm refresh is pending or refused', () => {
  const data = Array.from({ length: 2000 });
  expect(lineQueryState({ ...settled, data, isFetching: true, isStale: true }))
    .toEqual({ total: 2000, loading: false, refreshing: true, stale: true, error: null });
  const error = new Error('refresh refused');
  expect(lineQueryState({ ...settled, data, error, isStale: true }))
    .toEqual({ total: 2000, loading: false, refreshing: false, stale: true, error });
});
