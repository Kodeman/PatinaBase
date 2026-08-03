import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class BackgroundRemovalConfig {
  constructor(private readonly config: ConfigService) {}

  get studioMonthlyLimit(): number {
    return positiveInteger(this.config.get<string>('BACKGROUND_REMOVAL_STUDIO_MONTHLY_LIMIT'), 25);
  }

  get globalDailyLimit(): number {
    return positiveInteger(this.config.get<string>('BACKGROUND_REMOVAL_GLOBAL_DAILY_LIMIT'), 100);
  }

  get maxSourceBytes(): number {
    return positiveInteger(
      this.config.get<string>('BACKGROUND_REMOVAL_MAX_SOURCE_BYTES'),
      20 * 1024 * 1024,
    );
  }

  get sourceTimeoutMs(): number {
    return positiveInteger(this.config.get<string>('BACKGROUND_REMOVAL_SOURCE_TIMEOUT_MS'), 10_000);
  }

  get vendorTimeoutMs(): number {
    return positiveInteger(this.config.get<string>('BACKGROUND_REMOVAL_VENDOR_TIMEOUT_MS'), 30_000);
  }

  get reservationTtlMs(): number {
    return positiveInteger(
      this.config.get<string>('BACKGROUND_REMOVAL_RESERVATION_TTL_MS'),
      5 * 60_000,
    );
  }
}
