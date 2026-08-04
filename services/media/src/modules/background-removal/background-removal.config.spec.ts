import { ConfigService } from '@nestjs/config';
import { BackgroundRemovalConfig } from './background-removal.config';

function config(values: Record<string, string> = {}): BackgroundRemovalConfig {
  return new BackgroundRemovalConfig({
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService);
}

describe('BackgroundRemovalConfig', () => {
  it('uses the approved durable quota defaults', () => {
    const policy = config();

    expect(policy.studioMonthlyLimit).toBe(25);
    expect(policy.globalDailyLimit).toBe(100);
    expect(policy.minimumReservationTtlMs).toBe(170_000);
    expect(policy.reservationTtlMs).toBe(300_000);
  });

  it('reads only the approved cap names', () => {
    const policy = config({
      BACKGROUND_REMOVAL_STUDIO_MONTHLY_CAP: '12',
      BACKGROUND_REMOVAL_GLOBAL_DAILY_CAP: '34',
    });

    expect(policy.studioMonthlyLimit).toBe(12);
    expect(policy.globalDailyLimit).toBe(34);
  });

  it('derives the minimum TTL from every bounded external stage', () => {
    const policy = config({
      BACKGROUND_REMOVAL_SOURCE_TIMEOUT_MS: '1000',
      BACKGROUND_REMOVAL_VENDOR_TIMEOUT_MS: '2000',
      BACKGROUND_REMOVAL_STORAGE_TIMEOUT_MS: '3000',
      BACKGROUND_REMOVAL_RESERVATION_TTL_MS: '46000',
    });

    expect(policy.minimumReservationTtlMs).toBe(46_000);
    expect(policy.reservationTtlMs).toBe(46_000);
  });

  it('rejects a reservation TTL shorter than the maximum processing path', () => {
    expect(() =>
      config({
        BACKGROUND_REMOVAL_RESERVATION_TTL_MS: '169999',
      }),
    ).toThrow(/must cover the maximum processing path/);
  });

  it('rejects invalid timeout and cap values instead of silently using defaults', () => {
    expect(() =>
      config({
        BACKGROUND_REMOVAL_VENDOR_TIMEOUT_MS: '0',
      }),
    ).toThrow(/must be a positive safe integer/);
  });
});
