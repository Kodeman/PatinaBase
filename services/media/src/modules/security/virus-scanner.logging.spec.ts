import { Logger } from '@nestjs/common';
import { VirusScannerService } from './virus-scanner.service';

jest.mock('clamav.js', () => ({
  createScanner: jest.fn(() => {
    throw new Error('sentinel-provider-secret at sentinel-host:3310');
  }),
}));

describe('VirusScannerService startup logging', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not log provider errors, stacks, or endpoint details', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const config = {
      get: jest.fn((key: string, fallback: unknown) => {
        if (key === 'VIRUS_SCAN_ENABLED') return 'true';
        if (key === 'CLAMAV_HOST') return 'sentinel-host';
        return fallback;
      }),
    };

    new VirusScannerService(config as any, {} as any);
    await new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));

    const logged = JSON.stringify([...log.mock.calls, ...warn.mock.calls, ...error.mock.calls]);
    expect(logged).not.toContain('sentinel-provider-secret');
    expect(logged).not.toContain('sentinel-host');
    expect(logged).not.toContain('3310');
    expect(warn).toHaveBeenCalledWith('ClamAV initialization failed');
  });
});
