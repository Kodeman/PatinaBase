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
  });

  it('reads only the approved cap names', () => {
    const policy = config({
      BACKGROUND_REMOVAL_STUDIO_MONTHLY_CAP: '12',
      BACKGROUND_REMOVAL_GLOBAL_DAILY_CAP: '34',
    });

    expect(policy.studioMonthlyLimit).toBe(12);
    expect(policy.globalDailyLimit).toBe(34);
  });
});
