import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WorkerCallbackAuthService } from './worker-callback-auth.service';

describe('WorkerCallbackAuthService', () => {
  const secret = 'test-callback-secret';
  const body = Buffer.from('{"jobId":"sentinel-job","state":"SUCCEEDED"}');

  function service(configuredSecret: string | undefined) {
    return new WorkerCallbackAuthService({
      get: jest.fn().mockReturnValue(configuredSecret),
    } as unknown as ConfigService);
  }

  function signature(timestamp: string, payload = body) {
    return `v1=${createHmac('sha256', secret)
      .update(timestamp)
      .update('.')
      .update(payload)
      .digest('hex')}`;
  }

  it('accepts only a current signature over the exact raw body', () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    expect(() => service(secret).verify(body, timestamp, signature(timestamp))).not.toThrow();
    expect(() =>
      service(secret).verify(Buffer.from(`${body.toString()} `), timestamp, signature(timestamp)),
    ).toThrow(UnauthorizedException);
  });

  it('rejects stale, malformed, and missing signatures without exposing details', () => {
    const stale = Math.floor((Date.now() - 6 * 60 * 1000) / 1000).toString();
    expect(() => service(secret).verify(body, stale, signature(stale))).toThrow(
      UnauthorizedException,
    );
    expect(() => service(secret).verify(body, 'not-a-time', 'v1=bad')).toThrow(
      UnauthorizedException,
    );
    expect(() => service(secret).verify(body, undefined, undefined)).toThrow(
      UnauthorizedException,
    );
  });

  it('fails closed when the callback secret is not configured', () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    expect(() => service(undefined).verify(body, timestamp, signature(timestamp))).toThrow(
      ServiceUnavailableException,
    );
  });
});
