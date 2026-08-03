import { captureMoodBoardShareViewed } from '../mood-board-server';

const RAW_TOKEN = 'a'.repeat(64);
const BOARD_ID = 'c4061000-0000-4000-8000-000000000001';
const SHARE_ID = 'd4061000-0000-4000-8000-000000000001';

function response(ok = true, status = 200): Response {
  return {
    ok,
    status,
    body: { cancel: jest.fn().mockResolvedValue(undefined) },
  } as unknown as Response;
}

describe('captureMoodBoardShareViewed', () => {
  it('sends only safe board/share identifiers and never the raw token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response());

    await captureMoodBoardShareViewed(
      { boardId: BOARD_ID, shareId: SHARE_ID },
      {
        fetchImpl,
        getEnv: (name) =>
          name === 'NEXT_PUBLIC_POSTHOG_KEY'
            ? 'phc_test'
            : name === 'NEXT_PUBLIC_POSTHOG_HOST'
              ? 'https://analytics.example/'
              : undefined,
        now: () => new Date('2026-08-03T12:00:00.000Z'),
      },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));

    expect(url).toBe('https://analytics.example/i/v0/e/');
    expect(body).toEqual({
      api_key: 'phc_test',
      event: 'mood_board_share_viewed',
      distinct_id: `mood-board-share:${SHARE_ID}`,
      properties: {
        board_id: BOARD_ID,
        share_id: SHARE_ID,
        surface: 'guest_share',
        $process_person_profile: false,
      },
      timestamp: '2026-08-03T12:00:00.000Z',
    });
    expect(JSON.stringify({ url, init })).not.toContain(RAW_TOKEN);
  });

  it('does not attempt capture when analytics is not configured', async () => {
    const fetchImpl = jest.fn();

    await captureMoodBoardShareViewed(
      { boardId: BOARD_ID, shareId: SHARE_ID },
      { fetchImpl, getEnv: () => undefined },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never lets an analytics failure break the guest render', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network unavailable'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      captureMoodBoardShareViewed(
        { boardId: BOARD_ID, shareId: SHARE_ID },
        {
          fetchImpl,
          getEnv: (name) => (name === 'NEXT_PUBLIC_POSTHOG_KEY' ? 'phc_test' : undefined),
        },
      ),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('[MoodBoard analytics] capture failed', {
      event: 'mood_board_share_viewed',
      error: 'Error',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(RAW_TOKEN);
  });

  it('rejects a bearer token passed in place of an identifier without logging it', async () => {
    const fetchImpl = jest.fn();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await captureMoodBoardShareViewed(
      { boardId: BOARD_ID, shareId: RAW_TOKEN },
      {
        fetchImpl,
        getEnv: (name) => (name === 'NEXT_PUBLIC_POSTHOG_KEY' ? 'phc_test' : undefined),
      },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[MoodBoard analytics] capture skipped: invalid identifiers',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(RAW_TOKEN);
  });
});
