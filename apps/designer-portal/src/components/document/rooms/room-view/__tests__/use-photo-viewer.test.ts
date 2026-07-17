jest.mock('@/lib/analytics', () => ({
  roomEvents: { roomPhotoOpened: jest.fn() },
}));

import { act, renderHook } from '@testing-library/react';
import { roomEvents } from '@/lib/analytics';
import { usePhotoViewer } from '../use-photo-viewer';

const roomPhotoOpenedMock = roomEvents.roomPhotoOpened as jest.Mock;

describe('usePhotoViewer', () => {
  beforeEach(() => roomPhotoOpenedMock.mockClear());

  it('starts closed', () => {
    const { result } = renderHook(() => usePhotoViewer(6, 'room-1'));
    expect(result.current.openIndex).toBeNull();
  });

  it('openAtIndex opens at the clamped index and fires room_photo_opened once, with the given source', () => {
    const { result } = renderHook(() => usePhotoViewer(6, 'room-1'));

    act(() => result.current.openAtIndex(2, 'strip'));

    expect(result.current.openIndex).toBe(2);
    expect(roomPhotoOpenedMock).toHaveBeenCalledTimes(1);
    expect(roomPhotoOpenedMock).toHaveBeenCalledWith({ room_id: 'room-1', source: 'strip' });
  });

  it.each(['strip', 'plan', 'orbit', 'rail'] as const)(
    'accepts source=%s on the opening call',
    (source) => {
      const { result } = renderHook(() => usePhotoViewer(6, 'room-1'));
      act(() => result.current.openAtIndex(0, source));
      expect(roomPhotoOpenedMock).toHaveBeenCalledWith({ room_id: 'room-1', source });
    },
  );

  it('clamps a negative index to 0 and an over-range index to count-1, still firing once', () => {
    const { result } = renderHook(() => usePhotoViewer(6, 'room-1'));

    act(() => result.current.openAtIndex(-3, 'rail'));
    expect(result.current.openIndex).toBe(0);

    act(() => result.current.close());
    roomPhotoOpenedMock.mockClear();

    act(() => result.current.openAtIndex(99, 'plan'));
    expect(result.current.openIndex).toBe(5);
    expect(roomPhotoOpenedMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-fire on prev/next while already open (no source passed, viewer stays open)', () => {
    const { result } = renderHook(() => usePhotoViewer(6, 'room-1'));

    act(() => result.current.openAtIndex(0, 'plan'));
    expect(roomPhotoOpenedMock).toHaveBeenCalledTimes(1);

    // Mirrors PhotoViewer's prev/next: onIndexChange(safeIndex ± 1), no source.
    act(() => result.current.openAtIndex(1));
    act(() => result.current.openAtIndex(2));
    act(() => result.current.openAtIndex(1));

    expect(result.current.openIndex).toBe(1);
    expect(roomPhotoOpenedMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-fire even if a source IS passed while the viewer is already open', () => {
    const { result } = renderHook(() => usePhotoViewer(6, 'room-1'));

    act(() => result.current.openAtIndex(0, 'plan'));
    expect(roomPhotoOpenedMock).toHaveBeenCalledTimes(1);

    // A second marker click while the viewer is already open — the source
    // arg is present but the CLOSED → OPEN guard has nothing to trigger on.
    act(() => result.current.openAtIndex(4, 'orbit'));

    expect(result.current.openIndex).toBe(4);
    expect(roomPhotoOpenedMock).toHaveBeenCalledTimes(1);
    expect(roomPhotoOpenedMock).toHaveBeenCalledWith({ room_id: 'room-1', source: 'plan' });
  });

  it('fires again on a fresh open after close()', () => {
    const { result } = renderHook(() => usePhotoViewer(6, 'room-1'));

    act(() => result.current.openAtIndex(0, 'strip'));
    act(() => result.current.close());
    expect(result.current.openIndex).toBeNull();

    act(() => result.current.openAtIndex(3, 'rail'));

    expect(result.current.openIndex).toBe(3);
    expect(roomPhotoOpenedMock).toHaveBeenCalledTimes(2);
    expect(roomPhotoOpenedMock).toHaveBeenLastCalledWith({ room_id: 'room-1', source: 'rail' });
  });

  it('does not fire when opened with no source at all (defensive — no current call site does this)', () => {
    const { result } = renderHook(() => usePhotoViewer(6, 'room-1'));
    act(() => result.current.openAtIndex(0));
    expect(result.current.openIndex).toBe(0);
    expect(roomPhotoOpenedMock).not.toHaveBeenCalled();
  });

  it('count <= 0 keeps the viewer closed and never fires, regardless of source', () => {
    const { result } = renderHook(() => usePhotoViewer(0, 'room-1'));
    act(() => result.current.openAtIndex(0, 'strip'));
    expect(result.current.openIndex).toBeNull();
    expect(roomPhotoOpenedMock).not.toHaveBeenCalled();
  });
});
