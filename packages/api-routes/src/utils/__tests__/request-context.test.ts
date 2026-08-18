import { describe, expect, it } from 'vitest';
import { createContext, extractTrustedIpAddress } from '../request-context';

describe('trusted request context', () => {
  it('prefers Cloudflare client IP and ignores caller-controlled forwarding headers', () => {
    const request = new Request('https://api.patina.cloud/test', {
      headers: {
        'cf-connecting-ip': '203.0.113.42',
        'x-forwarded-for': '10.0.0.1, 192.168.0.1',
        'x-real-ip': '127.0.0.1',
      },
    });

    expect(extractTrustedIpAddress(request)).toBe('203.0.113.42');
    expect(createContext(request).ip).toBe('203.0.113.42');
  });

  it('uses an explicit unknown value when no trusted edge address exists', () => {
    const request = new Request('https://api.patina.cloud/test', {
      headers: { 'x-forwarded-for': '10.0.0.1', 'x-real-ip': '127.0.0.1' },
    });

    expect(extractTrustedIpAddress(request)).toBe('0.0.0.0');
  });
});
