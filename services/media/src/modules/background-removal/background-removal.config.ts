import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const BACKGROUND_REMOVAL_MAX_REDIRECTS = 3;

const DEFAULT_STUDIO_MONTHLY_LIMIT = 25;
const DEFAULT_GLOBAL_DAILY_LIMIT = 100;
const DEFAULT_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const DEFAULT_SOURCE_TIMEOUT_MS = 10_000;
const DEFAULT_VENDOR_TIMEOUT_MS = 30_000;
const DEFAULT_STORAGE_TIMEOUT_MS = 15_000;
const DEFAULT_RESERVATION_TTL_MS = 5 * 60_000;
const RESERVATION_SAFETY_MARGIN_MS = 30_000;

function positiveInteger(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`[BackgroundRemovalConfig] ${key} must be a positive safe integer.`);
  }
  return parsed;
}

@Injectable()
export class BackgroundRemovalConfig {
  readonly studioMonthlyLimit: number;
  readonly globalDailyLimit: number;
  readonly maxSourceBytes: number;
  readonly sourceTimeoutMs: number;
  readonly vendorTimeoutMs: number;
  readonly storageTimeoutMs: number;
  readonly minimumReservationTtlMs: number;
  readonly reservationTtlMs: number;

  constructor(config: ConfigService) {
    this.studioMonthlyLimit = positiveInteger(
      config,
      'BACKGROUND_REMOVAL_STUDIO_MONTHLY_CAP',
      DEFAULT_STUDIO_MONTHLY_LIMIT,
    );
    this.globalDailyLimit = positiveInteger(
      config,
      'BACKGROUND_REMOVAL_GLOBAL_DAILY_CAP',
      DEFAULT_GLOBAL_DAILY_LIMIT,
    );
    this.maxSourceBytes = positiveInteger(
      config,
      'BACKGROUND_REMOVAL_MAX_SOURCE_BYTES',
      DEFAULT_MAX_SOURCE_BYTES,
    );
    this.sourceTimeoutMs = positiveInteger(
      config,
      'BACKGROUND_REMOVAL_SOURCE_TIMEOUT_MS',
      DEFAULT_SOURCE_TIMEOUT_MS,
    );
    this.vendorTimeoutMs = positiveInteger(
      config,
      'BACKGROUND_REMOVAL_VENDOR_TIMEOUT_MS',
      DEFAULT_VENDOR_TIMEOUT_MS,
    );
    this.storageTimeoutMs = positiveInteger(
      config,
      'BACKGROUND_REMOVAL_STORAGE_TIMEOUT_MS',
      DEFAULT_STORAGE_TIMEOUT_MS,
    );

    // Each external-source hop can spend one DNS timeout and one HTTPS
    // timeout. The path may follow three redirects, then upload the canonical
    // original, call the vendor, and upload the cutout. Keep a fixed margin for
    // authorization/ledger latency so a live request cannot age out underneath
    // its own terminal write.
    const sourceStages = (BACKGROUND_REMOVAL_MAX_REDIRECTS + 1) * 2;
    const maximumEndToEndMs =
      this.sourceTimeoutMs * sourceStages + this.storageTimeoutMs * 2 + this.vendorTimeoutMs;
    this.minimumReservationTtlMs = maximumEndToEndMs + RESERVATION_SAFETY_MARGIN_MS;
    if (!Number.isSafeInteger(this.minimumReservationTtlMs)) {
      throw new Error('[BackgroundRemovalConfig] Timeout policy exceeds the safe integer range.');
    }

    this.reservationTtlMs = positiveInteger(
      config,
      'BACKGROUND_REMOVAL_RESERVATION_TTL_MS',
      DEFAULT_RESERVATION_TTL_MS,
    );
    if (this.reservationTtlMs < this.minimumReservationTtlMs) {
      throw new Error(
        '[BackgroundRemovalConfig] BACKGROUND_REMOVAL_RESERVATION_TTL_MS must cover ' +
          `the maximum processing path (${this.minimumReservationTtlMs}ms).`,
      );
    }
  }
}
