import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';
import { StripeModule, assertStripeConfigured } from './stripe.module';

describe('StripeModule', () => {
  const originalEnv = process.env.STRIPE_SECRET_KEY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalEnv;
    }
  });

  async function buildModule() {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StripeModule,
      ],
    }).compile();
  }

  it('boots without throwing when STRIPE_SECRET_KEY is unset', async () => {
    delete process.env.STRIPE_SECRET_KEY;

    let module: TestingModule;
    await expect((async () => {
      module = await buildModule();
    })()).resolves.not.toThrow();

    expect(module!.get('STRIPE_CLIENT')).toBeNull();
  });

  it('boots without throwing when STRIPE_SECRET_KEY is an empty string', async () => {
    process.env.STRIPE_SECRET_KEY = '';

    const module = await buildModule();

    expect(module.get('STRIPE_CLIENT')).toBeNull();
  });

  it('constructs a real Stripe client when STRIPE_SECRET_KEY is set', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    const module = await buildModule();

    expect(module.get('STRIPE_CLIENT')).toBeInstanceOf(Stripe);
  });
});

describe('assertStripeConfigured', () => {
  it('throws a 503 ServiceUnavailableException with a stripe_not_configured body when the client is null', () => {
    expect(() => assertStripeConfigured(null)).toThrow(ServiceUnavailableException);

    try {
      assertStripeConfigured(null);
      fail('expected assertStripeConfigured to throw');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getStatus()).toBe(503);
      expect(JSON.stringify(error.getResponse())).toContain('stripe_not_configured');
    }
  });

  it('does not throw when given a configured Stripe client', () => {
    const fakeStripe = { checkout: {} } as unknown as Stripe;
    expect(() => assertStripeConfigured(fakeStripe)).not.toThrow();
  });
});
