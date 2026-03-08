import { Module } from '@nestjs/common';
import { ChangeOrdersService } from './change-orders.service';
import { ChangeOrdersController } from './change-orders.controller';

@Module({
  controllers: [ChangeOrdersController],
  providers: [ChangeOrdersService],
  exports: [ChangeOrdersService],
})
export class ChangeOrdersModule {}
