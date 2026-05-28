type Awaitable<T> = T | Promise<T>;

const DATA_MODE = process.env.NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE ?? 'auto';
const FORCE_MOCK = DATA_MODE === 'mock';
const FORCE_LIVE = DATA_MODE === 'live';

/**
 * Helper that prefers live API data but falls back to mock data automatically.
 * The default mode is `auto`, which tries live first and silently switches
 * to mock data when the request fails (e.g., service not running locally).
 * Set NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=mock to always use mocks or
 * NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live to disable the fallback.
 */
export async function withMockData<T>(
  liveCall: () => Awaitable<T>,
  mockCall: () => Awaitable<T>
): Promise<T> {
  if (FORCE_MOCK) {
    return mockCall();
  }

  try {
    return await liveCall();
  } catch (error) {
    if (FORCE_LIVE) {
      throw error;
    }

    if (process.env.NODE_ENV !== 'production') {
      // Log only the error message — never the full error object. A failed
      // fetch can carry the entire HTML response body (e.g. a 404 page),
      // and serializing that to the console repeatedly freezes the renderer.
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Designer Portal] Falling back to mock data: ${message}`);
    }

    return mockCall();
  }
}

export const isMockDataMode = FORCE_MOCK || (!FORCE_LIVE && DATA_MODE !== 'live');
