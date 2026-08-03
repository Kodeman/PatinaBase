/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

const mockProxyToBackend = jest.fn();

jest.mock('@patina/api-routes', () => ({
  createRouteHandler:
    (handler: (request: NextRequest, context: Record<string, unknown>) => Promise<Response>) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<Record<string, string>> },
    ) =>
      handler(request, {
        requestId: 'portal-request-id',
        ip: '127.0.0.1',
        custom: { params: (await routeContext?.params) ?? {} },
      }),
  proxyToBackend: (...args: unknown[]) => mockProxyToBackend(...args),
}));

import { GET as getCapability } from '../[boardId]/background-removal-capability/route';
import { POST as removeBackground } from '../[boardId]/items/[itemId]/remove-background/route';

const BOARD_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

function proxyResponse(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('designer background-removal proxies', () => {
  beforeEach(() => {
    mockProxyToBackend.mockReset();
  });

  it('authenticates the capability route and forwards route/query parameters', async () => {
    mockProxyToBackend.mockResolvedValue(
      proxyResponse({
        success: true,
        data: { available: false, code: 'background_removal_not_configured' },
      }),
    );

    const request = new NextRequest(
      `http://localhost:3000/api/media/boards/${BOARD_ID}/background-removal-capability?refresh=1`,
    );
    const response = await getCapability(request, {
      params: Promise.resolve({ boardId: BOARD_ID }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { available: false, code: 'background_removal_not_configured' },
    });
    expect(mockProxyToBackend).toHaveBeenCalledTimes(1);
    const [, , config] = mockProxyToBackend.mock.calls[0];
    expect(config).toMatchObject({
      service: {
        name: 'media',
        path: `/boards/${BOARD_ID}/background-removal-capability?refresh=1`,
      },
      requireAuth: true,
    });
  });

  it('forwards Idempotency-Key with an empty body and explicitly disables mutation retry', async () => {
    let forwardedBodyBytes = -1;
    mockProxyToBackend.mockImplementation(async (request: NextRequest) => {
      forwardedBodyBytes = (await request.clone().arrayBuffer()).byteLength;
      return proxyResponse({
        success: true,
        data: {
          originalUrl: 'https://project.supabase.co/original.webp',
          cutoutUrl: 'https://project.supabase.co/cutout.png',
          idempotentReplay: false,
          quota: {
            studioMonthly: { limit: 25, used: 1, remaining: 24, resetAt: '2026-09-01T00:00:00Z' },
            globalDaily: { limit: 100, used: 1, remaining: 99, resetAt: '2026-08-04T00:00:00Z' },
          },
        },
      });
    });

    const request = new NextRequest(
      `http://localhost:3000/api/media/boards/${BOARD_ID}/items/${ITEM_ID}/remove-background`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': 'remove-background-request-1' },
      },
    );
    const response = await removeBackground(request, {
      params: Promise.resolve({ boardId: BOARD_ID, itemId: ITEM_ID }),
    });

    expect(response.status).toBe(200);
    expect(forwardedBodyBytes).toBe(0);
    const [, , config] = mockProxyToBackend.mock.calls[0];
    expect(config).toMatchObject({
      service: {
        name: 'media',
        path: `/boards/${BOARD_ID}/items/${ITEM_ID}/remove-background`,
      },
      requireAuth: true,
      forwardHeaders: ['idempotency-key'],
      retry: { maxRetries: 0, shouldRetryMutation: false },
    });
  });

  it('rejects a client body instead of forwarding a source URL', async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/media/boards/${BOARD_ID}/items/${ITEM_ID}/remove-background`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'remove-background-request-2',
        },
        body: JSON.stringify({ sourceUrl: 'https://attacker.example/source.png' }),
      },
    );
    const response = await removeBackground(request, {
      params: Promise.resolve({ boardId: BOARD_ID, itemId: ITEM_ID }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'background_removal_invalid_request' },
    });
    expect(mockProxyToBackend).not.toHaveBeenCalled();
  });

  it('preserves a foreign-board 404 while stripping vendor details and headers', async () => {
    mockProxyToBackend.mockResolvedValue(
      proxyResponse(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'remove.bg says the item is missing',
            details: {
              backendDetails: {
                code: 'board_item_not_found',
                message: 'Board item not found.',
                vendor: 'remove.bg',
              },
            },
          },
        },
        404,
        { 'x-background-removal-vendor': 'remove.bg' },
      ),
    );

    const request = new NextRequest(
      `http://localhost:3000/api/media/boards/${BOARD_ID}/background-removal-capability`,
    );
    const response = await getCapability(request, {
      params: Promise.resolve({ boardId: BOARD_ID }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('x-background-removal-vendor')).toBeNull();
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: 'board_item_not_found',
        message: 'Board item not found.',
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/remove\.bg|vendor/i);
  });

  it('keeps structured quota details without returning upstream implementation details', async () => {
    mockProxyToBackend.mockResolvedValue(
      proxyResponse(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'upstream quota error',
            details: {
              backendDetails: {
                code: 'background_removal_limit_reached',
                scope: 'studio_monthly',
                limit: 25,
                resetAt: '2026-09-01T00:00:00.000Z',
                upstreamAccount: 'secret-account',
              },
            },
          },
        },
        429,
      ),
    );

    const request = new NextRequest(
      `http://localhost:3000/api/media/boards/${BOARD_ID}/items/${ITEM_ID}/remove-background`,
      { method: 'POST', headers: { 'Idempotency-Key': 'remove-background-request-3' } },
    );
    const response = await removeBackground(request, {
      params: Promise.resolve({ boardId: BOARD_ID, itemId: ITEM_ID }),
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: 'background_removal_limit_reached',
        message: 'Background removal limit reached.',
        details: {
          scope: 'studio_monthly',
          limit: 25,
          resetAt: '2026-09-01T00:00:00.000Z',
        },
      },
    });
  });
});
