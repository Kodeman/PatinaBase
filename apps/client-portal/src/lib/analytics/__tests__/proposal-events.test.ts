jest.mock('posthog-js', () => ({ __esModule: true, default: { capture: jest.fn() } }));
jest.mock('../posthog', () => ({ isAnalyticsEnabled: () => true }));

import posthog from 'posthog-js';
import { proposalClientEvents } from '../events';

const captureMock = (posthog as unknown as { capture: jest.Mock }).capture;

describe('proposalClientEvents', () => {
  beforeEach(() => captureMock.mockClear());

  it('viewedByClient fires proposal_viewed_by_client with platform: client', () => {
    proposalClientEvents.viewedByClient({ proposalId: 'p1' });
    expect(captureMock).toHaveBeenCalledWith('proposal_viewed_by_client', {
      proposal_id: 'p1',
      platform: 'client',
    });
  });

  it('sectionViewed fires proposal_section_viewed with platform: client', () => {
    proposalClientEvents.sectionViewed({
      proposalId: 'p1',
      sectionType: 'scope',
      durationSeconds: 45,
    });
    expect(captureMock).toHaveBeenCalledWith('proposal_section_viewed', {
      proposal_id: 'p1',
      section_type: 'scope',
      duration_seconds: 45,
      platform: 'client',
    });
  });

  it('signed fires proposal_signed with platform: client', () => {
    proposalClientEvents.signed({ proposalId: 'p1', signedByName: 'Jane Doe' });
    expect(captureMock).toHaveBeenCalledWith('proposal_signed', {
      proposal_id: 'p1',
      signed_by_name: 'Jane Doe',
      platform: 'client',
    });
  });
});
