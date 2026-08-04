import 'server-only';

const MOOD_BOARD_SHARE_VIEWED = 'mood_board_share_viewed';
const MOOD_BOARD_PROPOSAL_ACTIVATED = 'mood_board_proposal_activated';
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

async function captureMoodBoardServerEvent(
  event: string,
  distinctId: string,
  properties: Record<string, unknown>,
  options: CaptureOptions,
): Promise<void> {
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
        event,
        distinct_id: distinctId,
        properties,
        timestamp: (options.now?.() ?? new Date()).toISOString(),
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      console.warn('[MoodBoard analytics] capture failed', {
        event,
        status: response.status,
      });
    }
    await response.body?.cancel();
  } catch (error) {
    console.warn('[MoodBoard analytics] capture failed', {
      event,
      error: error instanceof Error ? error.name : 'unknown_error',
    });
  } finally {
    clearTimeout(timeoutId);
  }
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

  await captureMoodBoardServerEvent(
    MOOD_BOARD_SHARE_VIEWED,
    `mood-board-share:${shareId}`,
    {
      board_id: boardId,
      share_id: shareId,
      surface: 'guest_share',
      $process_person_profile: false,
    },
    options,
  );
}

export interface MoodBoardProposalActivatedProperties {
  proposalId: string;
  projectId: string;
  boardCount: number;
}

/**
 * Server-owned M5 denominator emitted only after canonical signature activation.
 * The caller supplies the service-role count of active proposal boards; the
 * count never crosses back into the browser (important for curated proposals).
 */
export async function captureMoodBoardProposalActivated(
  { proposalId, projectId, boardCount }: MoodBoardProposalActivatedProperties,
  options: CaptureOptions = {},
): Promise<void> {
  if (
    !UUID_PATTERN.test(proposalId) ||
    !UUID_PATTERN.test(projectId) ||
    !Number.isSafeInteger(boardCount) ||
    boardCount < 0
  ) {
    console.warn('[MoodBoard analytics] capture skipped: invalid activation properties');
    return;
  }

  await captureMoodBoardServerEvent(
    MOOD_BOARD_PROPOSAL_ACTIVATED,
    `mood-board-proposal:${proposalId}`,
    {
      proposal_id: proposalId,
      source_proposal_id: proposalId,
      project_id: projectId,
      board_count: boardCount,
      has_board: boardCount > 0,
      activation_source: 'client_signature',
      $insert_id: `mood-board-proposal-activated:${proposalId}`,
      $process_person_profile: false,
    },
    options,
  );
}
