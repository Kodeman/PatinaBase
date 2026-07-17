jest.mock('posthog-js', () => ({ __esModule: true, default: { capture: jest.fn() } }));
jest.mock('../posthog', () => ({ isAnalyticsEnabled: () => true }));

import posthog from 'posthog-js';
import { roomEvents } from '../room-events';

const captureMock = (posthog as unknown as { capture: jest.Mock }).capture;

describe('roomEvents', () => {
  beforeEach(() => captureMock.mockClear());

  it('roomOpened fires room_opened with room_id + source=index', () => {
    roomEvents.roomOpened({ room_id: 'room-1', source: 'index' });
    expect(captureMock).toHaveBeenCalledWith('room_opened', {
      room_id: 'room-1',
      source: 'index',
    });
  });

  it('roomOpened fires room_opened with source=document', () => {
    roomEvents.roomOpened({ room_id: 'room-2', source: 'document' });
    expect(captureMock).toHaveBeenCalledWith('room_opened', {
      room_id: 'room-2',
      source: 'document',
    });
  });

  it('modeSwitched fires mode_switched with room_id + mode', () => {
    roomEvents.modeSwitched({ room_id: 'room-1', mode: 'orbit' });
    expect(captureMock).toHaveBeenCalledWith('mode_switched', {
      room_id: 'room-1',
      mode: 'orbit',
    });
  });

  it('measureUsed fires measure_used with room_id', () => {
    roomEvents.measureUsed({ room_id: 'room-1' });
    expect(captureMock).toHaveBeenCalledWith('measure_used', { room_id: 'room-1' });
  });
});
