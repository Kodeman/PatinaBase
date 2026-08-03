import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { BackgroundRemovalConfig } from './background-removal.config';
import { BackgroundRemovalVendorError } from './background-removal.errors';
import { BackgroundRemovalService } from './background-removal.service';
import { BackgroundRemovalQuota } from './background-removal.types';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ID = '44444444-4444-4444-8444-444444444444';
const STUDIO_ID = '55555555-5555-4555-8555-555555555555';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

const quota: BackgroundRemovalQuota = {
  studioMonthly: {
    limit: 25,
    used: 1,
    remaining: 24,
    resetAt: '2026-09-01T00:00:00.000Z',
  },
  globalDaily: {
    limit: 100,
    used: 1,
    remaining: 99,
    resetAt: '2026-08-04T00:00:00.000Z',
  },
};

function context(sourceUrl = 'https://images.example/chair.png') {
  return {
    boardId: BOARD_ID,
    owner: { kind: 'proposal' as const, id: OWNER_ID },
    designerId: USER_ID,
    studioId: STUDIO_ID,
    quotaOwnerId: STUDIO_ID,
    item: {
      id: ITEM_ID,
      boardId: BOARD_ID,
      type: 'image' as const,
      sourceUrl,
    },
  };
}

function setup() {
  const access = {
    authorizeBoard: jest.fn().mockResolvedValue(context()),
    authorizeBoardItem: jest.fn().mockResolvedValue(context()),
  };
  const ledger = {
    reserve: jest.fn().mockResolvedValue({ kind: 'reserved', requestId: REQUEST_ID, quota }),
    getQuota: jest.fn().mockResolvedValue(quota),
    markSucceeded: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
  const storage = {
    parseCanonicalPublicUrl: jest.fn().mockReturnValue(null),
    readCanonicalPublicUrl: jest.fn(),
    upload: jest
      .fn()
      .mockResolvedValueOnce(
        `https://supabase.example/storage/v1/object/public/proposal-mood-boards/${OWNER_ID}/boards/${BOARD_ID}/${REQUEST_ID}-original.png`,
      )
      .mockResolvedValueOnce(
        `https://supabase.example/storage/v1/object/public/proposal-mood-boards/${OWNER_ID}/boards/${BOARD_ID}/${REQUEST_ID}-cutout.png`,
      ),
  };
  const external = {
    fetch: jest.fn().mockResolvedValue({
      bytes: PNG,
      mimeType: 'image/png',
      extension: 'png',
    }),
  };
  const validator = {
    validateSource: jest.fn().mockResolvedValue({
      bytes: PNG,
      mimeType: 'image/png',
      extension: 'png',
    }),
    validateVendorOutput: jest.fn().mockResolvedValue(PNG),
  };
  const policy = { maxSourceBytes: 20 * 1024 * 1024 } as BackgroundRemovalConfig;
  const vendor = {
    isConfigured: jest.fn().mockReturnValue(true),
    removeBackground: jest.fn().mockResolvedValue({
      bytes: PNG,
      mimeType: 'image/png',
      creditsUsed: 1,
    }),
  };
  const service = new BackgroundRemovalService(
    access as any,
    ledger as any,
    storage as any,
    external as any,
    validator as any,
    policy,
    vendor,
  );
  return { service, access, ledger, storage, external, validator, vendor };
}

describe('BackgroundRemovalService', () => {
  it('reports unconfigured capability after authorization without requiring the ledger', async () => {
    const { service, access, ledger, vendor } = setup();
    vendor.isConfigured.mockReturnValue(false);

    await expect(service.capability('forwarded-jwt', BOARD_ID)).resolves.toEqual({
      available: false,
      code: 'background_removal_not_configured',
    });
    expect(access.authorizeBoard).toHaveBeenCalledWith('forwarded-jwt', BOARD_ID);
    expect(ledger.getQuota).not.toHaveBeenCalled();
  });

  it('copies an external item source into canonical board storage, stores the cutout, and returns URLs/quota', async () => {
    const { service, ledger, storage, external, vendor } = setup();

    const result = await service.removeBackground(
      'forwarded-jwt',
      USER_ID,
      BOARD_ID,
      ITEM_ID,
      'request-key-1',
    );

    expect(external.fetch).toHaveBeenCalledWith('https://images.example/chair.png');
    expect(storage.upload).toHaveBeenNthCalledWith(
      1,
      `${OWNER_ID}/boards/${BOARD_ID}/${REQUEST_ID}-original.png`,
      PNG,
      'image/png',
    );
    expect(storage.upload).toHaveBeenNthCalledWith(
      2,
      `${OWNER_ID}/boards/${BOARD_ID}/${REQUEST_ID}-cutout.png`,
      PNG,
      'image/png',
    );
    expect(vendor.removeBackground).toHaveBeenCalledTimes(1);
    expect(ledger.markSucceeded).toHaveBeenCalledWith(
      REQUEST_ID,
      expect.stringContaining('-original.png'),
      expect.stringContaining('-cutout.png'),
      1,
    );
    expect(result).toEqual({
      originalUrl: expect.stringContaining('-original.png'),
      cutoutUrl: expect.stringContaining('-cutout.png'),
      quota,
      idempotentReplay: false,
    });
  });

  it('reads canonical proposal-mood-boards objects directly instead of making an external request', async () => {
    const { service, access, storage, external } = setup();
    const canonical =
      'https://supabase.example/storage/v1/object/public/proposal-mood-boards/owner/boards/board/source.png';
    access.authorizeBoardItem.mockResolvedValue(context(canonical));
    storage.parseCanonicalPublicUrl.mockReturnValue('owner/boards/board/source.png');
    storage.readCanonicalPublicUrl.mockResolvedValue({
      objectPath: 'owner/boards/board/source.png',
      publicUrl: canonical,
      bytes: PNG,
      declaredMime: 'image/png',
    });

    await service.removeBackground('forwarded-jwt', USER_ID, BOARD_ID, ITEM_ID, 'request-key-2');

    expect(storage.readCanonicalPublicUrl).toHaveBeenCalledWith(canonical);
    expect(external.fetch).not.toHaveBeenCalled();
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it('rolls back the durable reservation on vendor failure and returns a generic error', async () => {
    const { service, ledger, vendor, storage } = setup();
    vendor.removeBackground.mockRejectedValue(new BackgroundRemovalVendorError());

    let caught: BadGatewayException | undefined;
    try {
      await service.removeBackground('forwarded-jwt', USER_ID, BOARD_ID, ITEM_ID, 'request-key-3');
    } catch (error) {
      caught = error as BadGatewayException;
    }

    expect(caught).toBeInstanceOf(BadGatewayException);
    expect(vendor.removeBackground).toHaveBeenCalledTimes(1);
    expect(storage.upload).toHaveBeenCalledTimes(1); // external original only
    expect(ledger.markFailed).toHaveBeenCalledWith(REQUEST_ID, 'VENDOR_FAILED', 0);
    expect(JSON.stringify(caught!.getResponse())).not.toMatch(/remove\.bg|vendor|api/i);
  });

  it('replays a completed idempotency key without another vendor or storage call', async () => {
    const { service, ledger, storage, vendor } = setup();
    ledger.reserve.mockResolvedValue({
      kind: 'succeeded',
      requestId: REQUEST_ID,
      originalUrl: 'https://storage.example/original.png',
      cutoutUrl: 'https://storage.example/cutout.png',
      quota,
    });

    await expect(
      service.removeBackground('forwarded-jwt', USER_ID, BOARD_ID, ITEM_ID, 'request-key-4'),
    ).resolves.toEqual({
      originalUrl: 'https://storage.example/original.png',
      cutoutUrl: 'https://storage.example/cutout.png',
      quota,
      idempotentReplay: true,
    });
    expect(vendor.removeBackground).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('fails closed as not configured after authorization and before reservation', async () => {
    const { service, access, ledger, vendor } = setup();
    vendor.isConfigured.mockReturnValue(false);

    await expect(
      service.removeBackground('forwarded-jwt', USER_ID, BOARD_ID, ITEM_ID, 'request-key-5'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(access.authorizeBoardItem).toHaveBeenCalled();
    expect(ledger.reserve).not.toHaveBeenCalled();
  });
});
