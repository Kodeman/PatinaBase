import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { NotificationDispatchClient } from '../../infrastructure/notification-dispatch.client';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, NotificationDispatchClient],
})
export class WebhooksModule {}
