/**
 * US-14 — leaving a Room onto the Document it was opened from is a return to that paper, not an
 * arrival: the leave announces it (suppressNextArrival) immediately before the navigation. Any
 * other origin is an ordinary walk.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { consumeSuppressed } from '@/lib/arrival/nav';
import { rememberRoomOrigin } from '@/lib/document/room-origin';
import { RoomShell } from '../room-shell';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function leaveTo(origin: string) {
  rememberRoomOrigin(origin);
  render(
    <RoomShell title="The Contract Room">
      <p>body</p>
    </RoomShell>,
  );
  fireEvent.click(screen.getAllByRole('button')[0]);
  act(() => {
    jest.advanceTimersByTime(380);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  window.sessionStorage.clear();
  mockPush.mockClear();
  consumeSuppressed('/doc/proposal-1');
  consumeSuppressed('/people');
});

afterEach(() => {
  jest.useRealTimers();
});

it('back onto the Document it was opened from: announced, so no arrival plays', () => {
  leaveTo('/doc/proposal-1');
  expect(mockPush).toHaveBeenCalledWith('/doc/proposal-1');
  expect(consumeSuppressed('/doc/proposal-1')).toBe(true);
});

it('any other origin is not announced', () => {
  leaveTo('/people');
  expect(mockPush).toHaveBeenCalledWith('/people');
  expect(consumeSuppressed('/people')).toBe(false);
});
