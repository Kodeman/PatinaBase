import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

const MAX_CALLBACK_AGE_MS = 5 * 60 * 1000;
const SIGNATURE_PATTERN = /^v1=[0-9a-f]{64}$/;

@Injectable()
export class WorkerCallbackAuthService {
  constructor(private readonly config: ConfigService) {}

  verify(
    rawBody: Buffer | undefined,
    timestamp: string | undefined,
    signature: string | undefined,
  ) {
    const secret = this.config.get<string>('COMPLETE_CALLBACK_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException({ code: 'worker_callback_unavailable' });
    }
    if (!rawBody || !timestamp || !signature || !SIGNATURE_PATTERN.test(signature)) {
      throw new UnauthorizedException('Invalid worker callback');
    }

    const timestampSeconds = Number(timestamp);
    if (
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(Date.now() - timestampSeconds * 1000) > MAX_CALLBACK_AGE_MS
    ) {
      throw new UnauthorizedException('Invalid worker callback');
    }

    const expected = `v1=${createHmac('sha256', secret)
      .update(timestamp)
      .update('.')
      .update(rawBody)
      .digest('hex')}`;
    const expectedBytes = Buffer.from(expected, 'utf8');
    const providedBytes = Buffer.from(signature, 'utf8');
    if (
      expectedBytes.length !== providedBytes.length ||
      !timingSafeEqual(expectedBytes, providedBytes)
    ) {
      throw new UnauthorizedException('Invalid worker callback');
    }
  }
}
