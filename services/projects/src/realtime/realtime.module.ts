import { Module } from '@nestjs/common';
import { RealtimeBroadcasterService } from './realtime-broadcaster.service';
import { EventBridgeService } from './event-bridge.service';

/**
 * Publishes domain events to Supabase Realtime broadcast channels.
 * Replaces the former Socket.io `WebSocketModule` — no gateway, no persistent
 * connections, no Redis/Postgres presence tables. EventEmitter2 is global
 * (registered in AppModule), so this module only needs its two providers.
 */
@Module({
  providers: [RealtimeBroadcasterService, EventBridgeService],
  exports: [RealtimeBroadcasterService],
})
export class RealtimeModule {}
