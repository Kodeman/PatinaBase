import { ConfigService } from '@nestjs/config';
import { BackgroundRemovalConfig } from './background-removal.config';
import { BackgroundRemovalVendorError } from './background-removal.errors';
import { RemoveBgAdapter } from './remove-bg.adapter';

function adapter(
  values: Record<string, string> = {
    BACKGROUND_REMOVAL_PROVIDER: 'remove_bg',
    REMOVE_BG_API_KEY: 'vendor-key',
  },
): RemoveBgAdapter {
  const config = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
  return new RemoveBgAdapter(config, new BackgroundRemovalConfig(config));
}

describe('RemoveBgAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('requires the approved provider and secret names', () => {
    expect(adapter().isConfigured()).toBe(true);
    expect(adapter({ BACKGROUND_REMOVAL_PROVIDER: 'remove_bg' }).isConfigured()).toBe(false);
    expect(
      adapter({
        BACKGROUND_REMOVAL_PROVIDER: 'removebg',
        REMOVE_BG_API_KEY: 'vendor-key',
      }).isConfigured(),
    ).toBe(false);
  });

  it('makes exactly one paid request and never retries a transport failure', async () => {
    const request = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));

    await expect(
      adapter().removeBackground({ bytes: Buffer.from('source'), mimeType: 'image/png' }),
    ).rejects.toBeInstanceOf(BackgroundRemovalVendorError);

    expect(request).toHaveBeenCalledTimes(1);
  });
});
