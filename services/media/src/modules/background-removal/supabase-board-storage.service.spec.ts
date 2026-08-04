import { ConfigService } from '@nestjs/config';
import { BackgroundRemovalConfig } from './background-removal.config';
import { SupabaseBoardStorageService } from './supabase-board-storage.service';

const BASE_URL = 'https://project.supabase.co';
const PUBLIC_PREFIX = `${BASE_URL}/storage/v1/object/public/proposal-mood-boards/`;

function service(): SupabaseBoardStorageService {
  const values: Record<string, string> = {
    SUPABASE_URL: BASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-service-role',
  };
  const config = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
  return new SupabaseBoardStorageService(config, new BackgroundRemovalConfig(config));
}

describe('SupabaseBoardStorageService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('accepts only canonical proposal-mood-boards public URLs', () => {
    const storage = service();

    expect(storage.parseCanonicalPublicUrl(`${PUBLIC_PREFIX}owner/boards/board/source.png`)).toBe(
      'owner/boards/board/source.png',
    );
    expect(
      storage.parseCanonicalPublicUrl(
        'https://attacker.example/storage/v1/object/public/proposal-mood-boards/source.png',
      ),
    ).toBeNull();
    expect(
      storage.parseCanonicalPublicUrl(`${PUBLIC_PREFIX}owner%2F..%2Fanother/source.png`),
    ).toBeNull();
  });

  it('uses the service role only for an authorized server-side storage write', async () => {
    const request = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const storage = service();

    await expect(
      storage.upload('owner/boards/board/cutout.png', Buffer.from('png'), 'image/png'),
    ).resolves.toBe(`${PUBLIC_PREFIX}owner/boards/board/cutout.png`);

    expect(String(request.mock.calls[0][0])).toBe(
      `${BASE_URL}/storage/v1/object/proposal-mood-boards/owner/boards/board/cutout.png`,
    );
    expect(request.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: {
        apikey: 'server-only-service-role',
        authorization: 'Bearer server-only-service-role',
        'content-type': 'image/png',
        'x-upsert': 'false',
      },
    });
  });

  it('aborts a stalled storage write before the reservation can expire', async () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    const upload = expect(
      service().upload('owner/boards/board/cutout.png', Buffer.from('png'), 'image/png'),
    ).rejects.toThrow('Background removal storage request failed');

    await jest.advanceTimersByTimeAsync(15_000);
    await upload;
  });
});
