/** @jest-environment node */

import { proxyToBackend } from '@patina/api-routes';
import { POST } from '../route';
import { GET } from '../[id]/download/route';

jest.mock('@patina/api-routes', () => ({
  createRouteHandler: (handler: unknown) => handler,
  proxyToBackend: jest.fn(),
  ApiErrorCode: { BAD_REQUEST: 'BAD_REQUEST', SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE' },
  createApiError: (code: string, message: string) => ({ code, message }),
  apiError: (error: { message: string }, status: number) =>
    new Response(JSON.stringify({ success: false, error }), { status }),
  apiSuccess: (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 }),
}));

const proxy = proxyToBackend as jest.MockedFunction<typeof proxyToBackend>;
const context = { requestId: 'r-1', custom: {} } as any;
const PROJECT = '11111111-1111-4111-8111-111111111111';
const ASSET = '22222222-2222-4222-8222-222222222222';
const realFetch = global.fetch;
const storagePut = jest.fn();

const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function uploadRequest(file?: Blob, projectId?: string) {
  const form = new FormData();
  if (file) form.append('file', file, 'carton.jpg');
  if (projectId) form.append('projectId', projectId);
  return new Request('https://portal.test/api/media/assets', {
    method: 'POST',
    headers: { authorization: 'Bearer verified-token' },
    body: form,
  });
}

beforeEach(() => {
  proxy.mockReset();
  storagePut.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
  global.fetch = storagePut as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = realFetch;
});

describe('POST /api/media/assets — server-side relay', () => {
  it('creates the intent, PUTs the bytes to the signed URL, confirms, and returns the asset id', async () => {
    proxy
      .mockResolvedValueOnce(
        ok({
          assetId: ASSET,
          uploadSessionId: 'session-1',
          parUrl: 'https://r2.test/put?sig=1',
          headers: { 'x-amz-meta-asset': ASSET },
        }),
      )
      .mockResolvedValueOnce(ok({ assetId: ASSET }));
    const jpeg = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });

    const res = await (POST as any)(uploadRequest(jpeg, PROJECT), context);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: { assetId: ASSET } });

    const [intentReq, , intentCfg] = proxy.mock.calls[0];
    expect(intentCfg).toEqual(
      expect.objectContaining({
        requireAuth: true,
        service: expect.objectContaining({ name: 'media', path: '/v1/media/upload' }),
      }),
    );
    expect(intentReq.headers.get('authorization')).toBe('Bearer verified-token');
    await expect(intentReq.json()).resolves.toEqual({
      kind: 'IMAGE',
      filename: 'carton.jpg',
      fileSize: jpeg.size,
      mimeType: 'image/jpeg',
      projectId: PROJECT,
    });

    expect(storagePut).toHaveBeenCalledWith('https://r2.test/put?sig=1', {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg', 'x-amz-meta-asset': ASSET },
      body: expect.any(ArrayBuffer),
    });
    expect(proxy.mock.calls[1][2].service.path).toBe('/v1/media/upload/session-1/confirm');
  });

  it('refuses a non-image before calling the media service', async () => {
    const res = await (POST as any)(
      uploadRequest(new Blob(['%PDF'], { type: 'application/pdf' })),
      context,
    );
    expect(res.status).toBe(400);
    expect(proxy).not.toHaveBeenCalled();
  });

  it('refuses a declared oversized body with 413 before buffering it', async () => {
    const formData = jest.fn();
    const oversized = {
      url: 'https://portal.test/api/media/assets',
      headers: new Headers({ 'content-length': String(50 * 1024 * 1024 + 64 * 1024 + 1) }),
      formData,
    };
    const res = await (POST as any)(oversized, context);
    expect(res.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
    expect(proxy).not.toHaveBeenCalled();
  });

  it('lets a 50 MB photo with its multipart framing through the pre-check', async () => {
    const formData = jest.fn().mockRejectedValue(new Error('not multipart'));
    const atCap = {
      url: 'https://portal.test/api/media/assets',
      headers: new Headers({ 'content-length': String(50 * 1024 * 1024 + 1024) }),
      formData,
    };
    const res = await (POST as any)(atCap, context);
    expect(formData).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(400);
  });

  it('refuses a malformed projectId', async () => {
    const res = await (POST as any)(
      uploadRequest(new Blob(['jpeg'], { type: 'image/jpeg' }), 'not-a-uuid'),
      context,
    );
    expect(res.status).toBe(400);
    expect(proxy).not.toHaveBeenCalled();
  });

  it('does not confirm when the storage PUT fails', async () => {
    proxy.mockResolvedValueOnce(
      ok({ assetId: ASSET, uploadSessionId: 'session-1', parUrl: 'https://r2.test/put', headers: {} }),
    );
    storagePut.mockResolvedValue(new Response(null, { status: 403 }));

    const res = await (POST as any)(
      uploadRequest(new Blob(['jpeg'], { type: 'image/jpeg' })),
      context,
    );
    expect(res.status).toBe(502);
    expect(proxy).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/media/assets/:id/download', () => {
  it('proxies to the media service signed-download route', async () => {
    proxy.mockResolvedValue(ok({ downloadUrl: 'https://r2.test/get?sig=1' }));
    const request = new Request(`https://portal.test/api/media/assets/${ASSET}/download`);

    await (GET as any)(request, { ...context, custom: { params: { id: ASSET } } });

    expect(proxy).toHaveBeenCalledWith(
      request,
      expect.anything(),
      expect.objectContaining({
        requireAuth: true,
        service: expect.objectContaining({ name: 'media', path: `/v1/media/${ASSET}/download` }),
      }),
    );
  });

  it('refuses a non-UUID id without calling the service', async () => {
    const res = await (GET as any)(new Request('https://portal.test/x'), {
      ...context,
      custom: { params: { id: '../stats/overview' } },
    });
    expect(res.status).toBe(400);
    expect(proxy).not.toHaveBeenCalled();
  });
});
