import { ConfigService } from '@nestjs/config';
import { BackgroundRemovalConfig } from './background-removal.config';
import { BackgroundRemovalSourceError } from './background-removal.errors';
import { BackgroundRemovalDns, BackgroundRemovalHttpsTransport } from './background-removal.types';
import { ImagePayloadValidatorService } from './image-payload-validator.service';
import {
  isPublicAddress,
  SafeExternalImageFetcherService,
} from './safe-external-image-fetcher.service';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=',
  'base64',
);

function policy() {
  return new BackgroundRemovalConfig({ get: jest.fn(() => undefined) } as unknown as ConfigService);
}

describe('SafeExternalImageFetcherService', () => {
  afterEach(() => jest.useRealTimers());

  it.each([
    ['127.0.0.1', 4],
    ['10.2.3.4', 4],
    ['169.254.169.254', 4],
    ['192.168.1.1', 4],
    ['::1', 6],
    ['::ffff:127.0.0.1', 6],
    ['::c0a8:101', 6],
    ['fc00::1', 6],
    ['fe80::1', 6],
  ] as Array<[string, 4 | 6]>)('rejects private/reserved address %s', (address, family) => {
    expect(isPublicAddress(address, family)).toBe(false);
  });

  it('accepts globally routable IPv4 and IPv6 addresses', () => {
    expect(isPublicAddress('8.8.8.8', 4)).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111', 6)).toBe(true);
  });

  it('rejects a hostname when any DNS answer is private and never opens HTTPS', async () => {
    const resolver: BackgroundRemovalDns = {
      lookup: jest.fn().mockResolvedValue([
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.8', family: 4 },
      ]),
    };
    const transport: BackgroundRemovalHttpsTransport = { get: jest.fn() };
    const service = new SafeExternalImageFetcherService(
      resolver,
      transport,
      policy(),
      new ImagePayloadValidatorService(),
    );

    await expect(service.fetch('https://images.example/chair.jpg')).rejects.toBeInstanceOf(
      BackgroundRemovalSourceError,
    );
    expect(transport.get).not.toHaveBeenCalled();
  });

  it('bounds DNS resolution with the source timeout', async () => {
    jest.useFakeTimers();
    const resolver: BackgroundRemovalDns = {
      lookup: jest.fn(() => new Promise(() => undefined)),
    };
    const transport: BackgroundRemovalHttpsTransport = { get: jest.fn() };
    const service = new SafeExternalImageFetcherService(
      resolver,
      transport,
      policy(),
      new ImagePayloadValidatorService(),
    );

    const rejection = expect(
      service.fetch('https://images.example/chair.jpg'),
    ).rejects.toBeInstanceOf(BackgroundRemovalSourceError);
    await jest.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(transport.get).not.toHaveBeenCalled();
  });

  it('revalidates DNS after redirects and blocks a redirect to a private host', async () => {
    const resolver: BackgroundRemovalDns = {
      lookup: jest
        .fn()
        .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
        .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]),
    };
    const transport: BackgroundRemovalHttpsTransport = {
      get: jest.fn().mockResolvedValue({
        status: 302,
        headers: { location: 'https://internal.example/image.png' },
        body: Buffer.alloc(0),
      }),
    };
    const service = new SafeExternalImageFetcherService(
      resolver,
      transport,
      policy(),
      new ImagePayloadValidatorService(),
    );

    await expect(service.fetch('https://images.example/chair.jpg')).rejects.toBeInstanceOf(
      BackgroundRemovalSourceError,
    );
    expect(transport.get).toHaveBeenCalledTimes(1);
  });

  it('accepts a pinned public HTTPS image with a valid MIME and magic bytes', async () => {
    const resolver: BackgroundRemovalDns = {
      lookup: jest.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
    };
    const transport: BackgroundRemovalHttpsTransport = {
      get: jest.fn().mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': String(PNG.length) },
        body: PNG,
      }),
    };
    const service = new SafeExternalImageFetcherService(
      resolver,
      transport,
      policy(),
      new ImagePayloadValidatorService(),
    );

    await expect(service.fetch('https://images.example/chair.png')).resolves.toMatchObject({
      bytes: PNG,
      mimeType: 'image/png',
      extension: 'png',
    });
  });

  it('rejects a valid image when the server declares a non-image MIME', async () => {
    const resolver: BackgroundRemovalDns = {
      lookup: jest.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
    };
    const transport: BackgroundRemovalHttpsTransport = {
      get: jest.fn().mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: PNG,
      }),
    };
    const service = new SafeExternalImageFetcherService(
      resolver,
      transport,
      policy(),
      new ImagePayloadValidatorService(),
    );

    await expect(service.fetch('https://images.example/chair.png')).rejects.toBeInstanceOf(
      BackgroundRemovalSourceError,
    );
  });
});
