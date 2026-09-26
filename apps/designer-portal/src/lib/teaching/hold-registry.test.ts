import { renderHook } from '@testing-library/react';
import {
  holdTeaching,
  isTeachingHeld,
  releaseTeaching,
  subscribeHolds,
  useTeachingHold,
} from './hold-registry';

afterEach(() => {
  for (const key of ['a', 'b', 'editor']) releaseTeaching(key);
});

describe('hold registry', () => {
  it('is held while any key is held and clears when all are released', () => {
    expect(isTeachingHeld()).toBe(false);
    holdTeaching('a');
    holdTeaching('b');
    expect(isTeachingHeld()).toBe(true);
    releaseTeaching('a');
    expect(isTeachingHeld()).toBe(true);
    releaseTeaching('b');
    expect(isTeachingHeld()).toBe(false);
  });

  it('treats a double hold as one hold, cleared by one release', () => {
    holdTeaching('a');
    holdTeaching('a');
    releaseTeaching('a');
    expect(isTeachingHeld()).toBe(false);
  });

  it('notifies subscribers only on a change, and stops after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeHolds(listener);
    holdTeaching('a');
    holdTeaching('a');
    expect(listener).toHaveBeenCalledTimes(1);
    releaseTeaching('b');
    expect(listener).toHaveBeenCalledTimes(1);
    releaseTeaching('a');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    holdTeaching('a');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('useTeachingHold holds while active and releases on false', () => {
    const { rerender } = renderHook(({ active }) => useTeachingHold('editor', active), {
      initialProps: { active: false },
    });
    expect(isTeachingHeld()).toBe(false);
    rerender({ active: true });
    expect(isTeachingHeld()).toBe(true);
    rerender({ active: false });
    expect(isTeachingHeld()).toBe(false);
  });

  it('useTeachingHold releases on unmount', () => {
    const { unmount } = renderHook(() => useTeachingHold('editor', true));
    expect(isTeachingHeld()).toBe(true);
    unmount();
    expect(isTeachingHeld()).toBe(false);
  });
});
