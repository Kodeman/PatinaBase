import { Module, Global, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * The Stripe payments rail is intentionally "parked": production runs this
 * service with no Stripe environment variables while Patina consolidates
 * payments on a different rail. STRIPE_CLIENT resolves to `null` in that
 * case instead of a Stripe client constructed with a missing/bogus key —
 * see assertStripeConfigured() below for how callers must guard against it.
 */
function buildStripeClient(configService: ConfigService): Stripe | null {
  const secretKey = configService.get<string>('STRIPE_SECRET_KEY');
  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey, {
    apiVersion: '2023-10-16',
    typescript: true,
  });
}

/**
 * Guard for every request path that touches the Stripe SDK. Throws a 503
 * (body contains "stripe_not_configured") when STRIPE_CLIENT is null,
 * instead of letting a Stripe call fail late with an unclear error.
 *
 * Not for use in @Cron-triggered code paths — a scheduled job must not
 * crash-loop when Stripe is unconfigured; check `!stripe` and skip with a
 * log line there instead (see ReconciliationService).
 */
export function assertStripeConfigured(stripe: Stripe | null): asserts stripe is Stripe {
  if (!stripe) {
    throw new ServiceUnavailableException(
      'stripe_not_configured: Stripe is not configured for this environment (payments rail parked)',
    );
  }
}

@Global()
@Module({
  providers: [
    {
      provide: 'STRIPE_CLIENT',
      useFactory: buildStripeClient,
      inject: [ConfigService],
    },
  ],
  exports: ['STRIPE_CLIENT'],
})
export class StripeModule {}
