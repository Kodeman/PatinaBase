/**
 * @jest-environment node
 */
import {
  BackgroundRemovalClientError,
  getBackgroundRemovalCapability,
  removeBoardItemBackground,
} from '../background-removal-client';

const fetchMock = jest.fn();

describe('background-removal client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('unwraps the authenticated portal capability response', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { available: false, code: 'background_removal_not_configured' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(getBackgroundRemovalCapability('board/a')).resolves.toEqual({
      available: false,
      code: 'background_removal_not_configured',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/media/boards/board%2Fa/background-removal-capability',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });

  it('sends only route identity and Idempotency-Key for a mutation', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            originalUrl: 'https://project.supabase.co/original.webp',
            cutoutUrl: 'https://project.supabase.co/cutout.png',
            idempotentReplay: false,
            quota: {
              studioMonthly: { limit: 25, used: 1, remaining: 24, resetAt: 'monthly-reset' },
              globalDaily: { limit: 100, used: 1, remaining: 99, resetAt: 'daily-reset' },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await removeBoardItemBackground({
      boardId: 'board-id',
      itemId: 'item-id',
      idempotencyKey: 'background-removal:request-1',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/media/boards/board-id/items/item-id/remove-background');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe(
      'background-removal:request-1',
    );
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('normalizes a structured limit error and never exposes upstream details', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'background_removal_limit_reached',
            message: 'Background removal limit reached.',
            details: {
              scope: 'global_daily',
              limit: 100,
              resetAt: '2026-08-04T00:00:00.000Z',
              vendor: 'remove.bg',
            },
          },
        }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ),
    );

    const error = await removeBoardItemBackground({
      boardId: 'board-id',
      itemId: 'item-id',
      idempotencyKey: 'background-removal:request-2',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BackgroundRemovalClientError);
    expect(error).toMatchObject({
      code: 'background_removal_limit_reached',
      status: 429,
      details: {
        scope: 'global_daily',
        limit: 100,
        resetAt: '2026-08-04T00:00:00.000Z',
      },
    });
    expect(JSON.stringify(error)).not.toMatch(/remove\.bg|vendor/i);
  });

  it('normalizes network exceptions without exposing an upstream hostname', async () => {
    fetchMock.mockRejectedValue(new Error('remove.bg DNS lookup failed'));

    const error = await getBackgroundRemovalCapability('board-id').catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(BackgroundRemovalClientError);
    expect(error).toMatchObject({
      code: 'background_removal_unavailable',
      status: 0,
      message: 'Background removal is temporarily unavailable.',
    });
    expect(JSON.stringify(error)).not.toMatch(/remove\.bg|vendor/i);
  });
});
