import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { from, select, useQueryMock } = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  useQueryMock: vi.fn((options: unknown) => options),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: useQueryMock,
}));

vi.mock('../../client', () => ({
  createBrowserClient: () => ({ from }),
}));

import { useProjectFFEItems } from '../use-project-v2';

const projectId = 'project-1';
const queryKey = ['project-ffe-items', projectId] as const;
let observers: Array<{ destroy: () => void }> = [];

afterEach(() => {
  observers.forEach((observer) => observer.destroy());
  observers = [];
});

describe('useProjectFFEItems shared cache', () => {
  beforeEach(() => {
    from.mockReset();
    select.mockReset();
    useQueryMock.mockClear();

    const query = {
      eq: vi.fn(),
      is: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    query.eq.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    select.mockReturnValue(query);
    from.mockReturnValue({ select });
  });

  it('fetches once for two Document readers mounted on the shared key', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
    });
    const options = useProjectFFEItems(projectId) as unknown as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown[]>;
    };
    const portalOptions = { ...options, queryKey };
    const firstReader = new QueryObserver(client, options);
    const secondReader = new QueryObserver(client, portalOptions);
    observers = [firstReader, secondReader];
    const unsubscribeFirst = firstReader.subscribe(() => {});
    const unsubscribeSecond = secondReader.subscribe(() => {});
    await Promise.all([client.fetchQuery(options), client.fetchQuery(portalOptions)]);
    unsubscribeFirst();
    unsubscribeSecond();

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('project_ffe_items');
    expect(client.getQueryCache().find({ queryKey })).toBeDefined();
  });
});
