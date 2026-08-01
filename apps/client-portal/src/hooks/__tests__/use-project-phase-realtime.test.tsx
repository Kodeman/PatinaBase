import { act, renderHook } from '@testing-library/react';
import { createBrowserClient } from '@patina/supabase';

import { useProjectPhaseRealtime } from '../use-project-phase-realtime';

const refresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
}));

const mockCreateBrowserClient = createBrowserClient as jest.Mock;

describe('useProjectPhaseRealtime', () => {
  let changeHandlers: Array<() => void>;
  let channel: {
    on: jest.Mock;
    subscribe: jest.Mock;
  };
  let removeChannel: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    refresh.mockReset();
    changeHandlers = [];
    removeChannel = jest.fn().mockResolvedValue(undefined);
    channel = {
      on: jest.fn((_event, _filter, handler: () => void) => {
        changeHandlers.push(handler);
        return channel;
      }),
      subscribe: jest.fn(() => channel),
    };
    mockCreateBrowserClient.mockReturnValue({
      channel: jest.fn(() => channel),
      removeChannel,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('subscribes to filtered creates and transitions, but never unfiltered deletes', () => {
    renderHook(() => useProjectPhaseRealtime('project-1'));

    expect(channel.on.mock.calls.map((call) => call[1])).toEqual([
      {
        event: 'INSERT',
        schema: 'public',
        table: 'project_phases',
        filter: 'project_id=eq.project-1',
      },
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'project_phases',
        filter: 'project_id=eq.project-1',
      },
    ]);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
  });

  it('refreshes from canonical server data without depending on event payload shape', () => {
    renderHook(() => useProjectPhaseRealtime('project-1'));

    act(() => {
      (changeHandlers[1] as unknown as (payload: unknown) => void)({
        unexpected: 'payload',
        old: null,
        new: { any: 'shape' },
      });
      jest.advanceTimersByTime(75);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('coalesces a branching transition and removes the channel on cleanup', () => {
    const { unmount } = renderHook(() => useProjectPhaseRealtime('project-1'));

    act(() => {
      changeHandlers[0]?.();
      changeHandlers[1]?.();
      changeHandlers[1]?.();
      jest.advanceTimersByTime(75);
    });

    expect(refresh).toHaveBeenCalledTimes(1);

    unmount();

    expect(removeChannel).toHaveBeenCalledWith(channel);
  });
});
