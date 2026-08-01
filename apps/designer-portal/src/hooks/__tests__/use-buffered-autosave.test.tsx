import { act, renderHook, waitFor } from '@testing-library/react';
import { useBufferedAutosave } from '../use-buffered-autosave';
import { resetProposalAutosaveRegistryForTests } from '@/lib/proposal-autosave-registry';

describe('useBufferedAutosave', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    resetProposalAutosaveRegistryForTests();
    jest.useRealTimers();
  });

  it('merges pending patches for one row before the debounce fires', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useBufferedAutosave<string, Record<string, unknown>>({
        proposalId: 'proposal-1',
        save,
        delay: 600,
      }),
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
      useBufferedAutosave<string, Record<string, unknown>>({
        proposalId: 'proposal-1',
        save,
        delay: 600,
      }),
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
      useBufferedAutosave<string, Record<string, unknown>>({
        proposalId: 'proposal-1',
        save,
        delay: 600,
      }),
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

  it('rejects a proposal-wide flush when a failed patch remains queued', async () => {
    const save = jest.fn().mockRejectedValue(new Error('save failed'));
    const { result } = renderHook(() =>
      useBufferedAutosave<string, Record<string, unknown>>({
        proposalId: 'proposal-1',
        save,
        delay: 600,
      }),
    );

    act(() => {
      result.current.queue('row-1', { name: 'Unsaved' });
    });

    let failure: unknown;
    await act(async () => {
      try {
        await result.current.flushAll();
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toEqual(new Error('save failed'));
    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('save failed');
  });

  it('flushes proposal A with A\'s save callback when the hook rerenders for proposal B', async () => {
    const totals = { A: 0, B: 0 };
    const saveA = jest.fn(async (_key: string, patch: { total: number }) => {
      totals.A = patch.total;
    });
    const saveB = jest.fn(async (_key: string, patch: { total: number }) => {
      totals.B = patch.total;
    });
    const { result, rerender } = renderHook(
      ({ proposalId, save }) =>
        useBufferedAutosave<string, { total: number }>({
          proposalId,
          save,
          delay: 60_000,
        }),
      {
        initialProps: { proposalId: 'proposal-A', save: saveA },
      },
    );

    act(() => {
      result.current.queue('phase-A', { total: 100 });
    });
    rerender({ proposalId: 'proposal-B', save: saveB });

    await waitFor(() => expect(saveA).toHaveBeenCalledTimes(1));
    expect(saveA).toHaveBeenCalledWith('phase-A', { total: 100 });
    expect(saveB).not.toHaveBeenCalled();
    expect(totals).toEqual({ A: 100, B: 0 });

    act(() => {
      result.current.queue('phase-B', { total: 250 });
    });
    await act(async () => {
      await result.current.flushAll();
    });

    expect(saveB).toHaveBeenCalledWith('phase-B', { total: 250 });
    expect(totals).toEqual({ A: 100, B: 250 });
  });
});
