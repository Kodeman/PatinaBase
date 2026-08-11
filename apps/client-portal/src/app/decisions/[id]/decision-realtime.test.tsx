import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Subscription = {
  config: { event: string; table: string };
  callback: (...args: unknown[]) => void;
};

const subscriptions = new Map<string, Subscription>();
const channel = {
  on: jest.fn(
    (
      _event: string,
      config: Subscription['config'],
      callback: Subscription['callback'],
    ) => {
      subscriptions.set(config.table, { config, callback });
      return channel;
    },
  ),
  subscribe: jest.fn(() => channel),
};
const removeChannel = jest.fn();

jest.mock('@patina/supabase/client', () => ({
  createBrowserClient: () => ({
    channel: () => channel,
    removeChannel,
  }),
}));

import { useDecisionRealtime } from '@patina/supabase/hooks/use-decisions';

function RealtimeWitness() {
  useDecisionRealtime('decision-1');
  return null;
}

beforeEach(() => {
  subscriptions.clear();
  channel.on.mockImplementation(
    (
      _event: string,
      config: Subscription['config'],
      callback: Subscription['callback'],
    ) => {
      subscriptions.set(config.table, { config, callback });
      return channel;
    },
  );
  channel.subscribe.mockImplementation(() => channel);
});

it('invalidates the authorized comment query when a remote comment is inserted', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = jest
    .spyOn(queryClient, 'invalidateQueries')
    .mockResolvedValue(undefined);

  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <RealtimeWitness />
    </QueryClientProvider>,
  );

  expect(subscriptions.get('decision_comments')?.config).toEqual(
    expect.objectContaining({ event: '*', table: 'decision_comments' }),
  );
  act(() =>
    subscriptions
      .get('decision_comments')
      ?.callback({ eventType: 'INSERT' }),
  );
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['decision-comments', 'decision-1'],
  });

  unmount();
  expect(removeChannel).toHaveBeenCalledWith(channel);
});
