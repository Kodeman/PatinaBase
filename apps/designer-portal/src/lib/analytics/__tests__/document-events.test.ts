const mockIsAnalyticsEnabled = jest.fn();

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: { capture: jest.fn() },
}));
jest.mock('../posthog', () => ({
  isAnalyticsEnabled: () => mockIsAnalyticsEnabled(),
}));

import posthog from 'posthog-js';
import { documentEvents } from '../document-events';

const captureMock = (posthog as unknown as { capture: jest.Mock }).capture;

describe('documentEvents · L6 additions', () => {
  beforeEach(() => {
    captureMock.mockClear();
    mockIsAnalyticsEnabled.mockReset();
    mockIsAnalyticsEnabled.mockReturnValue(true);
  });

  it('firstAuthored fires document_first_authored with the doc id', () => {
    documentEvents.firstAuthored({ doc_id: 'proposal-1' });
    expect(captureMock).toHaveBeenCalledWith('document_first_authored', {
      doc_id: 'proposal-1',
    });
  });

  it('zoneFlight fires document_zone_flight with doc id and held_ms', () => {
    documentEvents.zoneFlight({ doc_id: 'proposal-1', held_ms: 4200 });
    expect(captureMock).toHaveBeenCalledWith('document_zone_flight', {
      doc_id: 'proposal-1',
      held_ms: 4200,
    });
  });

  it('is a no-op when analytics is not enabled', () => {
    mockIsAnalyticsEnabled.mockReturnValue(false);
    documentEvents.firstAuthored({ doc_id: 'proposal-1' });
    documentEvents.zoneFlight({ doc_id: 'proposal-1', held_ms: 100 });
    expect(captureMock).not.toHaveBeenCalled();
  });
});
