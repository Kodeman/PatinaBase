import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '@patina/auth';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { METHOD_METADATA } from '@nestjs/common/constants';
import '../../app.module';
import { HealthController } from './health.controller';
import { VersionController } from './version.controller';
import { WebhooksController } from '../webhooks/webhooks.controller';
import { CarrierWebhooksController } from '../fulfillment/webhooks.controller';
import { CartsController } from '../carts/carts.controller';
import { CheckoutController } from '../checkout/checkout.controller';
import { OrdersController } from '../orders/orders.controller';
import { PaymentsController } from '../payments/payments.controller';
import { RefundsController } from '../refunds/refunds.controller';
import { ReconciliationController } from '../reconciliation/reconciliation.controller';
import { FulfillmentController, ShipmentsController } from '../fulfillment/fulfillment.controller';

describe('Orders public route contract', () => {
  it('keeps health public and protects version and provider handlers', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, VersionController)).not.toBe(true);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, VersionController.prototype.version)).toEqual(
      expect.arrayContaining(['order.read.own', 'order.admin.all']),
    );
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, WebhooksController.prototype.handleStripeWebhook),
    ).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CarrierWebhooksController)).not.toBe(true);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PrometheusController)).toEqual([
      'order.admin.all',
    ]);
  });

  it('assigns every registered route either a reviewed public exception or canonical permissions', () => {
    const controllers = [
      HealthController,
      VersionController,
      WebhooksController,
      CarrierWebhooksController,
      CartsController,
      CheckoutController,
      OrdersController,
      PaymentsController,
      RefundsController,
      ReconciliationController,
      FulfillmentController,
      ShipmentsController,
      PrometheusController,
    ];
    const publicRoutes: string[] = [];

    for (const controller of controllers) {
      const prototype = controller.prototype as Record<string, any>;
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[methodName];
        if (typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) {
          continue;
        }
        const isPublic =
          Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true ||
          Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
        const permissions =
          Reflect.getMetadata(PERMISSIONS_KEY, handler) ??
          Reflect.getMetadata(PERMISSIONS_KEY, controller);
        expect(isPublic || (Array.isArray(permissions) && permissions.length > 0)).toBe(true);
        if (isPublic) publicRoutes.push(`${controller.name}.${methodName}`);
      }
    }

    expect(publicRoutes.sort()).toEqual([
      'HealthController.check',
      'WebhooksController.handleStripeWebhook',
    ]);
  });

  it('reserves merchant state, money, and fulfillment operations for staff scopes', () => {
    const staffHandlers = [
      OrdersController.prototype.update,
      OrdersController.prototype.updateStatus,
      PaymentsController.prototype.capturePayment,
      PaymentsController.prototype.cancelPayment,
      RefundsController.prototype.create,
      FulfillmentController.prototype.create,
      FulfillmentController.prototype.updateForOrder,
      ShipmentsController.prototype.update,
      ShipmentsController.prototype.updateStatus,
      ShipmentsController.prototype.refund,
    ];

    for (const handler of staffHandlers) {
      const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler);
      expect(permissions).toEqual(
        expect.arrayContaining(['order.manage.org', 'order.admin.all']),
      );
      expect(permissions).not.toContain('order.manage.own');
    }
    expect(Reflect.getMetadata(PERMISSIONS_KEY, OrdersController.prototype.cancel)).toContain(
      'order.manage.own',
    );
  });
});
