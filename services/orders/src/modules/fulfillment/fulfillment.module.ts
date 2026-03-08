/**
 * Fulfillment Module
 *
 * Provides shipment, label, and tracking functionality with carrier integration.
 * Automatically uses mock carrier in development when EasyPost is not configured.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  FulfillmentController,
  ShipmentsController,
} from './fulfillment.controller';
import { CarrierWebhooksController } from './webhooks.controller';
import { FulfillmentService } from './fulfillment.service';
import { EasyPostCarrier } from './carriers/easypost.carrier';
import { MockCarrier } from './carriers/mock.carrier';
import { CarrierFactory } from './carriers/carrier.factory';

@Module({
  imports: [ConfigModule],
  controllers: [
    FulfillmentController,
    ShipmentsController,
    CarrierWebhooksController,
  ],
  providers: [
    FulfillmentService,
    EasyPostCarrier,
    MockCarrier,
    CarrierFactory,
  ],
  exports: [FulfillmentService, CarrierFactory],
})
export class FulfillmentModule {}
