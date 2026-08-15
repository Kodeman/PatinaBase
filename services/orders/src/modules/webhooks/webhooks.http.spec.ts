import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '@patina/auth';
import request from 'supertest';
import Stripe from 'stripe';
import { PrismaClient } from '../../generated/prisma-client';
import { NotificationDispatchClient } from '../../infrastructure/notification-dispatch.client';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Injectable()
class PublicRouteGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    return this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) === true;
  }
}

describe('Stripe webhook HTTP boundary', () => {
  const secret = 'whsec_http_boundary_test';
  const stripe = new Stripe('sk_test_http_boundary', { apiVersion: '2023-10-16' });
  const prisma = {
    auditLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  let app: any;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        WebhooksService,
        Reflector,
        { provide: APP_GUARD, useClass: PublicRouteGuard },
        { provide: PrismaClient, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'STRIPE_WEBHOOK_SECRET' ? secret : undefined } },
        { provide: 'STRIPE_CLIENT', useValue: stripe },
        { provide: 'EVENTS_SERVICE', useValue: { publish: jest.fn() } },
        { provide: NotificationDispatchClient, useValue: { enqueue: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => app.close());

  it('accepts an unauthenticated request only when its raw bytes match the Stripe signature', async () => {
    const payload = JSON.stringify({
      id: 'evt_http_valid',
      object: 'event',
      type: 'customer.created',
      data: { object: {} },
    });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });

    await request(app.getHttpServer())
      .post('/v1/webhooks/stripe')
      .set('content-type', 'application/json')
      .set('stripe-signature', signature)
      .send(payload)
      .expect(201)
      .expect(({ body }) => expect(body).toEqual(expect.objectContaining({ received: true })));

    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('rejects an invalid signature before processing or audit insertion', async () => {
    prisma.auditLog.create.mockClear();
    await request(app.getHttpServer())
      .post('/v1/webhooks/stripe')
      .set('content-type', 'application/json')
      .set('stripe-signature', 'invalid')
      .send('{"id":"evt_tampered","type":"customer.created","data":{"object":{}}}')
      .expect(400);

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
