import 'server-only';

const MOOD_BOARD_SHARE_VIEWED = 'mood_board_share_viewed';
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const CAPTURE_TIMEOUT_MS = 2_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MoodBoardShareViewedProperties {
  boardId: string;
  shareId: string;
}

interface CaptureOptions {
  fetchImpl?: typeof fetch;
  getEnv?: (name: string) => string | undefined;
  now?: () => Date;
}

/**
 * Best-effort, server-only analytics for a successfully resolved guest board.
 *
 * Deliberately accepts only durable board/share ids. The bearer token is not
 * part of this API, the PostHog payload, the distinct id, or any error log.
 */
export async function captureMoodBoardShareViewed(
  { boardId, shareId }: MoodBoardShareViewedProperties,
  options: CaptureOptions = {},
): Promise<void> {
  if (!UUID_PATTERN.test(boardId) || !UUID_PATTERN.test(shareId)) {
    console.warn('[MoodBoard analytics] capture skipped: invalid identifiers');
    return;
  }

  const getEnv = options.getEnv ?? ((name: string) => process.env[name]);
  const apiKey = getEnv('NEXT_PUBLIC_POSTHOG_KEY');
  if (!apiKey) return;

  const host = (getEnv('NEXT_PUBLIC_POSTHOG_HOST') ?? DEFAULT_POSTHOG_HOST).replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), CAPTURE_TIMEOUT_MS);

  try {
    const response = await fetchImpl(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event: MOOD_BOARD_SHARE_VIEWED,
        distinct_id: `mood-board-share:${shareId}`,
        properties: {
          board_id: boardId,
          share_id: shareId,
          surface: 'guest_share',
          $process_person_profile: false,
        },
        timestamp: (options.now?.() ?? new Date()).toISOString(),
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      console.warn('[MoodBoard analytics] capture failed', {
        event: MOOD_BOARD_SHARE_VIEWED,
        status: response.status,
      });
    }
    await response.body?.cancel();
  } catch (error) {
    console.warn('[MoodBoard analytics] capture failed', {
      event: MOOD_BOARD_SHARE_VIEWED,
      error: error instanceof Error ? error.name : 'unknown_error',
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
