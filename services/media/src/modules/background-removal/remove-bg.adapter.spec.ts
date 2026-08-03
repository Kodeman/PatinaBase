import { ConfigService } from '@nestjs/config';
import { BackgroundRemovalConfig } from './background-removal.config';
import { BackgroundRemovalVendorError } from './background-removal.errors';
import { RemoveBgAdapter } from './remove-bg.adapter';

function adapter(): RemoveBgAdapter {
  const values: Record<string, string> = {
    BACKGROUND_REMOVAL_API_KEY: 'vendor-key',
  };
  const config = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
  return new RemoveBgAdapter(config, new BackgroundRemovalConfig(config));
}

describe('RemoveBgAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('makes exactly one paid request and never retries a transport failure', async () => {
    const request = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));

    await expect(
      adapter().removeBackground({ bytes: Buffer.from('source'), mimeType: 'image/png' }),
    ).rejects.toBeInstanceOf(BackgroundRemovalVendorError);

    expect(request).toHaveBeenCalledTimes(1);
  });
});
