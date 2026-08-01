import { act, renderHook, waitFor } from '@testing-library/react';
import { useBufferedAutosave } from '../use-buffered-autosave';

describe('useBufferedAutosave', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('merges pending patches for one row before the debounce fires', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useBufferedAutosave<string, Record<string, unknown>>({ save, delay: 600 }),
    );

    act(() => {
      result.current.queue('row-1', { name: 'Concept' });
      result.current.queue('row-1', { duration: 21 });
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('row-1', {
      name: 'Concept',
      duration: 21,
    });
  });

  it('drains a newer patch queued while the prior save is in flight, even on unmount', async () => {
    let resolveFirst: (value?: unknown) => void = () => {};
    const save = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() =>
      useBufferedAutosave<string, Record<string, unknown>>({ save, delay: 600 }),
    );

    act(() => {
      result.current.queue('row-1', { name: 'First' });
      void result.current.flush('row-1');
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.queue('row-1', { duration: 35 });
    });
    unmount();

    await act(async () => {
      resolveFirst();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save.mock.calls).toEqual([
      ['row-1', { name: 'First' }],
      ['row-1', { duration: 35 }],
    ]);
  });

  it('keeps a failed row visible when a different row saves successfully', async () => {
    const save = jest.fn((key: string) =>
      key === 'row-a'
        ? Promise.reject(new Error('row-a failed'))
        : Promise.resolve(),
    );
    const { result } = renderHook(() =>
      useBufferedAutosave<string, Record<string, unknown>>({ save, delay: 600 }),
    );

    act(() => {
      result.current.queue('row-a', { name: 'Broken' });
      result.current.queue('row-b', { name: 'Saved' });
    });
    await act(async () => {
      await result.current.flush('row-a');
      await result.current.flush('row-b');
    });

    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('row-a failed');
  });
});
