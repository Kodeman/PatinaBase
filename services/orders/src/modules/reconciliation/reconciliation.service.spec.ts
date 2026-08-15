import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReconciliationService } from './reconciliation.service';
import { PrismaClient } from '../../generated/prisma-client';
import { OrdersAuthorizationResolver } from '../../common/authorization/orders-authorization.resolver';

describe('ReconciliationService - Stripe unconfigured (parked payment rail)', () => {
  let service: ReconciliationService;
  const mockPrisma = {
    reconciliation: { create: jest.fn() },
  } as unknown as PrismaClient;
  const mockEvents = { publish: jest.fn() };
  const mockAuthorization = { authorize: jest.fn() };
  const config = { get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue) } as unknown as ConfigService;

  async function buildService(stripe: unknown) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: ConfigService, useValue: config },
        { provide: 'STRIPE_CLIENT', useValue: stripe },
        { provide: 'EVENTS_SERVICE', useValue: mockEvents },
        { provide: OrdersAuthorizationResolver, useValue: mockAuthorization },
      ],
    }).compile();

    return module.get<ReconciliationService>(ReconciliationService);
  }

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('runReconciliation (manual / HTTP trigger)', () => {
    it('fails fast with 503 stripe_not_configured, before touching the database', async () => {
      service = await buildService(null);

      const promise = service.runReconciliation();
      await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(promise.catch(e => JSON.stringify(e.getResponse()))).resolves.toContain(
        'stripe_not_configured',
      );
      expect((mockPrisma as any).reconciliation.create).not.toHaveBeenCalled();
    });
  });

  describe('scheduledReconciliation (@Cron trigger)', () => {
    it('skips silently with a log line instead of throwing when Stripe is unconfigured', async () => {
      service = await buildService(null);
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(service.scheduledReconciliation()).resolves.not.toThrow();

      expect(warnSpy).toHaveBeenCalled();
      expect((mockPrisma as any).reconciliation.create).not.toHaveBeenCalled();
    });

    it('delegates to runReconciliation when Stripe is configured', async () => {
      service = await buildService({} as any);
      const runSpy = jest.spyOn(service, 'runReconciliation').mockResolvedValue(undefined as any);

      await service.scheduledReconciliation();

      expect(runSpy).toHaveBeenCalledTimes(1);
    });
  });
});
