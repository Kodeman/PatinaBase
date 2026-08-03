import { Inject, Injectable } from '@nestjs/common';
import { promises as dns } from 'dns';
import { request as httpsRequest } from 'https';
import { BlockList, isIP, type LookupFunction } from 'net';
import { BackgroundRemovalConfig } from './background-removal.config';
import { BackgroundRemovalSourceError } from './background-removal.errors';
import {
  BACKGROUND_REMOVAL_DNS,
  BACKGROUND_REMOVAL_HTTPS_TRANSPORT,
  BackgroundRemovalDns,
  BackgroundRemovalHttpsTransport,
  DnsAddress,
  HttpsTransportResponse,
  ValidatedImage,
} from './background-removal.types';
import { ImagePayloadValidatorService } from './image-payload-validator.service';

const PRIVATE_NETWORKS = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as Array<[string, number]>) {
  PRIVATE_NETWORKS.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as Array<[string, number]>) {
  PRIVATE_NETWORKS.addSubnet(network, prefix, 'ipv6');
}

export function isPublicAddress(address: string, family: 4 | 6): boolean {
  if (address.includes('%')) return false;
  if (family === 4) {
    return isIP(address) === 4 && !PRIVATE_NETWORKS.check(address, 'ipv4');
  }
  return (
    isIP(address) === 6 &&
    !address.toLowerCase().startsWith('::') &&
    !PRIVATE_NETWORKS.check(address, 'ipv6')
  );
}

@Injectable()
export class NodeBackgroundRemovalDns implements BackgroundRemovalDns {
  async lookup(hostname: string): Promise<DnsAddress[]> {
    const rows = await dns.lookup(hostname, { all: true, verbatim: true });
    return rows.map((row) => ({ address: row.address, family: row.family as 4 | 6 }));
  }
}

@Injectable()
export class NodePinnedHttpsTransport implements BackgroundRemovalHttpsTransport {
  get(
    url: URL,
    addresses: DnsAddress[],
    options: { timeoutMs: number; maxBytes: number },
  ): Promise<HttpsTransportResponse> {
    const selected = addresses[0];
    if (!selected) return Promise.reject(new BackgroundRemovalSourceError());
    const pinnedLookup: LookupFunction = (_hostname, _options, callback) => {
      callback(null, selected.address, selected.family);
    };

    return new Promise((resolve, reject) => {
      let settled = false;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const fail = () => {
        if (settled) return;
        settled = true;
        if (deadline) clearTimeout(deadline);
        reject(new BackgroundRemovalSourceError());
      };
      const succeed = (value: HttpsTransportResponse) => {
        if (settled) return;
        settled = true;
        if (deadline) clearTimeout(deadline);
        resolve(value);
      };
      const request = httpsRequest(
        url,
        {
          method: 'GET',
          agent: false,
          headers: {
            accept: 'image/avif,image/webp,image/png,image/jpeg',
            'accept-encoding': 'identity',
            'user-agent': 'Patina-Media/1.0',
          },
          // Pin the connection to an address from the validated lookup. TLS
          // still verifies `url.hostname` through the request's SNI/Host.
          lookup: pinnedLookup,
        },
        (response) => {
          const headers: Record<string, string | undefined> = {};
          for (const [name, value] of Object.entries(response.headers)) {
            headers[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
          }
          const status = response.statusCode ?? 0;
          if (status !== 200) {
            response.destroy();
            succeed({ status, headers, body: Buffer.alloc(0) });
            return;
          }

          const contentLength = Number(response.headers['content-length'] ?? '0');
          if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
            response.destroy();
            fail();
            return;
          }

          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer | string) => {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += bytes.length;
            if (size > options.maxBytes) {
              response.destroy(new BackgroundRemovalSourceError());
              fail();
              return;
            }
            chunks.push(bytes);
          });
          response.on('end', () => {
            succeed({
              status,
              headers,
              body: Buffer.concat(chunks, size),
            });
          });
          response.on('error', fail);
        },
      );
      // Node's request timeout is an inactivity timer. Keep an absolute
      // deadline too so a slow-drip response cannot hold a quota reservation.
      deadline = setTimeout(() => {
        request.destroy(new BackgroundRemovalSourceError());
        fail();
      }, options.timeoutMs);
      request.setTimeout(options.timeoutMs, () => {
        request.destroy(new BackgroundRemovalSourceError());
        fail();
      });
      request.on('error', fail);
      request.end();
    });
  }
}

@Injectable()
export class SafeExternalImageFetcherService {
  constructor(
    @Inject(BACKGROUND_REMOVAL_DNS)
    private readonly resolver: BackgroundRemovalDns,
    @Inject(BACKGROUND_REMOVAL_HTTPS_TRANSPORT)
    private readonly transport: BackgroundRemovalHttpsTransport,
    private readonly policy: BackgroundRemovalConfig,
    private readonly validator: ImagePayloadValidatorService,
  ) {}

  async fetch(source: string): Promise<ValidatedImage> {
    let current = this.parseUrl(source);
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const addresses = await this.resolvePublic(current.hostname);
      const response = await this.transport.get(current, addresses, {
        timeoutMs: this.policy.sourceTimeoutMs,
        maxBytes: this.policy.maxSourceBytes,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.location;
        if (!location || redirects === 3) throw new BackgroundRemovalSourceError();
        current = this.parseUrl(new URL(location, current).toString());
        continue;
      }
      if (response.status !== 200) throw new BackgroundRemovalSourceError();
      return this.validator.validateSource(
        response.body,
        this.policy.maxSourceBytes,
        response.headers['content-type'],
        true,
      );
    }
    throw new BackgroundRemovalSourceError();
  }

  private parseUrl(source: string): URL {
    try {
      const url = new URL(source);
      const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        (url.port && url.port !== '443') ||
        !hostname ||
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal')
      ) {
        throw new BackgroundRemovalSourceError();
      }
      return url;
    } catch (error) {
      if (error instanceof BackgroundRemovalSourceError) throw error;
      throw new BackgroundRemovalSourceError();
    }
  }

  private async resolvePublic(hostname: string): Promise<DnsAddress[]> {
    let addresses: DnsAddress[];
    try {
      if (isIP(hostname)) {
        addresses = [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
      } else {
        addresses = await this.withTimeout(
          this.resolver.lookup(hostname),
          this.policy.sourceTimeoutMs,
        );
      }
    } catch {
      throw new BackgroundRemovalSourceError();
    }
    if (
      addresses.length === 0 ||
      addresses.some((entry) => !isPublicAddress(entry.address, entry.family))
    ) {
      throw new BackgroundRemovalSourceError();
    }
    return addresses;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new BackgroundRemovalSourceError()), timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        () => {
          clearTimeout(timeout);
          reject(new BackgroundRemovalSourceError());
        },
      );
    });
  }
}
