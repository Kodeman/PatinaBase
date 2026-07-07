import { Module } from '@nestjs/common';
import { WebSocketProjectsGateway } from './websocket.gateway';
import { EventBridgeService } from './event-bridge.service';
import { MessageQueueService } from './message-queue.service';
import { ConnectionMonitorService } from './connection-monitor.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../common/auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    WebSocketProjectsGateway,
    EventBridgeService,
    MessageQueueService,
    ConnectionMonitorService,
  ],
  exports: [
    WebSocketProjectsGateway,
    EventBridgeService,
    MessageQueueService,
    ConnectionMonitorService,
  ],
})
export class WebSocketModule {}
