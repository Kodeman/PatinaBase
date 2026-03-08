/**
 * Orders Refactored Module
 *
 * Configures dependency injection for the Repository Pattern.
 * Registers repository implementations and application services.
 */

import { Module } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository.interface';
import { OrderRepository } from '../../infrastructure/repositories/order.repository';
import { OrderApplicationService } from '../../application/services/order-application.service';
import { OrdersRefactoredController } from './orders-refactored.controller';

@Module({
  controllers: [OrdersRefactoredController],
  providers: [
    // Prisma Client
    {
      provide: PrismaClient,
      useFactory: () => {
        const prisma = new PrismaClient();
        return prisma;
      },
    },

    // Repository Implementation
    {
      provide: ORDER_REPOSITORY,
      useClass: OrderRepository,
    },

    // Application Service
    OrderApplicationService,
  ],
  exports: [OrderApplicationService, ORDER_REPOSITORY],
})
export class OrdersRefactoredModule {}
