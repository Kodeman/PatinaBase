import {
  boundaryLog,
  firedOn,
  getCurrentTeachingSurface,
  record,
  resetTeachingBoundaries,
  setCurrentTeachingSurface,
  subscribe,
} from './boundaries';

const ACCOUNTS = 'designer-portal/document/accounts';
const HOURS = 'designer-portal/document/hours';

describe('teaching boundary log', () => {
  beforeEach(() => resetTeachingBoundaries());

  it('reports a recorded boundary on its surface only', () => {
    record({ boundaryKey: 'invoice_sent', at: 1_000, surfaceKey: ACCOUNTS });

    expect(firedOn(ACCOUNTS, 'invoice_sent')).toBe(true);
    expect(firedOn(ACCOUNTS, 'time_logged')).toBe(false);
    expect(firedOn(HOURS, 'invoice_sent')).toBe(false);
  });

  it('counts only firings at or after sinceMs', () => {
    record({ boundaryKey: 'time_logged', at: 1_000, surfaceKey: HOURS });

    expect(firedOn(HOURS, 'time_logged', 999)).toBe(true);
    expect(firedOn(HOURS, 'time_logged', 1_000)).toBe(true);
    expect(firedOn(HOURS, 'time_logged', 1_001)).toBe(false);

    record({ boundaryKey: 'time_logged', at: 2_000, surfaceKey: HOURS });
    expect(firedOn(HOURS, 'time_logged', 1_001)).toBe(true);
  });

  it('notifies subscribers of each firing until they unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);
    const firing = { boundaryKey: 'part_saved' as const, at: 5, surfaceKey: 'galley' };

    record(firing);
    expect(listener).toHaveBeenCalledWith(firing);

    unsubscribe();
    record({ boundaryKey: 'invite_sent', at: 6, surfaceKey: 'people' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('defaults the current surface to unknown and lets surfaces set it', () => {
    expect(getCurrentTeachingSurface()).toBe('unknown');
    setCurrentTeachingSurface(ACCOUNTS);
    expect(getCurrentTeachingSurface()).toBe(ACCOUNTS);
  });

  it('exposes firedOn as the selector BoundaryLog', () => {
    record({ boundaryKey: 'client_page_sent', at: 10, surfaceKey: 'people' });
    expect(boundaryLog.firedOn('people', 'client_page_sent', 10)).toBe(true);
  });
});
