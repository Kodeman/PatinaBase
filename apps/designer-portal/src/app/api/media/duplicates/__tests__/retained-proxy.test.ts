/** @jest-environment node */

import { proxyToBackend } from '@patina/api-routes';
import { POST } from '../route';

jest.mock('@patina/api-routes', () => ({
  createRouteHandler: (handler: unknown) => handler,
  proxyToBackend: jest.fn(),
  apiError: jest.fn((error: unknown) => {
    throw error;
  }),
  apiSuccess: jest.fn(),
}));

const proxy = proxyToBackend as jest.MockedFunction<typeof proxyToBackend>;

describe('retained media duplicate proxy', () => {
  it('uses the authenticated proxy and removes the routing action from the body', async () => {
    proxy.mockResolvedValue({ status: 200 } as Response);
    const request = new Request('https://portal.test/api/media/duplicates', {
      method: 'POST',
      headers: {
        authorization: 'Bearer verified-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'merge', assetId: 'asset-1' }),
    });
    const context = {
      requestId: 'request-1',
      ip: '127.0.0.1',
      validatedData: {},
      startTime: Date.now(),
      custom: {},
    } as any;

    await (POST as any)(request, context);

    expect(proxy).toHaveBeenCalledWith(
      expect.any(Request),
      context,
      expect.objectContaining({
        requireAuth: true,
        service: expect.objectContaining({
          name: 'media',
          path: '/v1/media/duplicates/merge',
        }),
      }),
    );
    const proxiedRequest = proxy.mock.calls[0][0];
    expect(proxiedRequest.headers.get('authorization')).toBe('Bearer verified-token');
    await expect(proxiedRequest.json()).resolves.toEqual({
      assetId: 'asset-1',
    });
  });
});
