jest.mock('posthog-js', () => ({
  __esModule: true,
  default: { capture: jest.fn(), captureException: jest.fn() },
}));
const mockIsAnalyticsEnabled = jest.fn();
jest.mock('../posthog', () => ({
  isAnalyticsEnabled: () => mockIsAnalyticsEnabled(),
}));

import posthog from 'posthog-js';
import { moodBoardEvents } from '../events';

const client = posthog as unknown as {
  capture: jest.Mock;
  captureException: jest.Mock;
};

describe('client MoodBoard render analytics', () => {
  beforeEach(() => {
    client.capture.mockClear();
    client.captureException.mockClear();
    mockIsAnalyticsEnabled.mockReset();
    mockIsAnalyticsEnabled.mockReturnValue(true);
  });

  afterEach(() => jest.useRealTimers());

  it('records a queryable renderer success without board content', () => {
    moodBoardEvents.renderSucceeded({
      proposalId: 'proposal-1',
      boardCount: 2,
      surface: 'client_proposal',
    });

    expect(client.capture).toHaveBeenCalledWith('mood_board_client_render_succeeded', {
      proposal_id: 'proposal-1',
      board_count: 2,
      surface: 'client_proposal',
      renderer: 'boards_block',
    });
  });

  it('records a failure and captures only a privacy-safe exception', () => {
    moodBoardEvents.renderFailed(
      new Error('private board content https://example.test/share/raw-token'),
      {
        proposalId: null,
        boardCount: 1,
        surface: 'guest_share',
      },
    );

    expect(client.capture).toHaveBeenCalledWith('mood_board_client_render_failed', {
      proposal_id: null,
      board_count: 1,
      surface: 'guest_share',
      renderer: 'boards_block',
    });
    expect(client.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Error',
        message: 'MoodBoard client renderer failed',
      }),
      {
        proposal_id: null,
        board_count: 1,
        surface: 'guest_share',
        renderer: 'boards_block',
        feature: 'mood_board',
      },
    );
    expect(JSON.stringify(client.captureException.mock.calls)).not.toContain('raw-token');
    expect(JSON.stringify(client.captureException.mock.calls)).not.toContain('private board content');
  });

  it('retries first-paint render telemetry once after the provider initializes', () => {
    jest.useFakeTimers();
    mockIsAnalyticsEnabled.mockReturnValue(false);

    moodBoardEvents.renderSucceeded({
      proposalId: 'proposal-1',
      boardCount: 1,
      surface: 'client_proposal',
    });
    expect(client.capture).not.toHaveBeenCalled();

    mockIsAnalyticsEnabled.mockReturnValue(true);
    jest.runOnlyPendingTimers();

    expect(client.capture).toHaveBeenCalledWith('mood_board_client_render_succeeded', {
      proposal_id: 'proposal-1',
      board_count: 1,
      surface: 'client_proposal',
      renderer: 'boards_block',
    });
  });
});
