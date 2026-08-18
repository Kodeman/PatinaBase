import { UnauthorizedException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { MediaClientService } from './media-client.service';

describe('MediaClientService delegated authorization contract', () => {
  const http = {
    post: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) =>
      key === 'MEDIA_SERVICE_URL' ? 'http://media.internal' : fallback,
    ),
  };
  const service = new MediaClientService(http as any, config as any);
  const authorization = 'Bearer verified-user-jwt';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the retained upload route, canonical project relationship, and exact delegated bearer', async () => {
    http.post.mockReturnValue(
      of({
        data: {
          assetId: 'asset-a',
          uploadSessionId: 'session-a',
          parUrl: 'https://upload.invalid',
          targetKey: 'raw/documents/asset-a/specification.pdf',
          expiresAt: '2026-08-15T13:00:00.000Z',
          headers: { 'x-content-type': 'application/pdf' },
        },
      }),
    );

    await expect(
      service.getUploadUrl(
        {
          publicProjectId: 'public-project-a',
          category: 'spec',
          filename: 'specification.pdf',
          mimeType: 'application/pdf',
          fileSize: 128,
        },
        authorization,
        'stable-idempotency-key',
      ),
    ).resolves.toMatchObject({
      assetId: 'asset-a',
      uploadSessionId: 'session-a',
      key: 'raw/documents/asset-a/specification.pdf',
    });

    const [url, body, requestConfig] = http.post.mock.calls[0];
    expect(url).toBe('http://media.internal/v1/media/upload');
    expect(body).toEqual({
      kind: 'DOCUMENT',
      filename: 'specification.pdf',
      fileSize: 128,
      mimeType: 'application/pdf',
      projectId: 'public-project-a',
    });
    expect(body).not.toEqual(
      expect.objectContaining({
        userId: expect.anything(),
        actor: expect.anything(),
        role: expect.anything(),
        permission: expect.anything(),
      }),
    );
    expect(requestConfig.headers).toEqual(
      expect.objectContaining({
        Authorization: authorization,
        'Idempotency-Key': 'stable-idempotency-key',
      }),
    );
  });

  it('uses the registered confirm, get, download, and process routes', async () => {
    http.post.mockReturnValue(of({ data: {} }));
    http.get.mockReturnValueOnce(of({ data: { id: 'asset/a' } })).mockReturnValueOnce(
      of({
        data: {
          downloadUrl: 'https://download.invalid',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    );

    await service.confirmUpload('session/a', authorization);
    await service.getAsset('asset/a', authorization);
    await service.getDownloadUrl('asset/a', authorization);
    await service.processAsset('asset/a', authorization, ['metadata']);

    expect(http.post).toHaveBeenNthCalledWith(
      1,
      'http://media.internal/v1/media/upload/session%2Fa/confirm',
      { sessionId: 'session/a' },
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: authorization }),
      }),
    );
    expect(http.get).toHaveBeenNthCalledWith(
      1,
      'http://media.internal/v1/media/asset%2Fa',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: authorization }),
      }),
    );
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      'http://media.internal/v1/media/asset%2Fa/download',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: authorization }),
      }),
    );
    expect(http.post).toHaveBeenNthCalledWith(
      2,
      'http://media.internal/v1/media/asset%2Fa/process',
      { operations: ['metadata'] },
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: authorization }),
      }),
    );
  });

  it('rejects missing delegation before calling Media', async () => {
    await expect(service.getAsset('asset-a', 'caller-controlled-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(http.get).not.toHaveBeenCalled();
  });

  it('propagates protected Media delete failures', async () => {
    const failure = new Error('media unavailable');
    http.delete.mockReturnValue(throwError(() => failure));

    await expect(service.deleteAsset('asset-a', authorization)).rejects.toBe(failure);
    expect(http.delete).toHaveBeenCalledWith(
      'http://media.internal/v1/media/asset-a',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: authorization }),
      }),
    );
  });
});
