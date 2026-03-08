import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface StreamEvent {
  id: string;
  type: string;
  timestamp: Date;
  actor?: string;
  resource: string;
  payload: any;
  traceId?: string;
}

@Global()
@Module({
  providers: [
    {
      provide: 'EVENTS_SERVICE',
      useFactory: (configService: ConfigService) => {
        return {
          async publish(topic: string, event: StreamEvent) {
            // TODO: Implement OCI Streaming integration
            // For now, just log events
            console.log(`[EVENT] ${topic}:${event.type}`, {
              id: event.id,
              resource: event.resource,
              timestamp: event.timestamp,
            });
          },
        };
      },
      inject: [ConfigService],
    },
  ],
  exports: ['EVENTS_SERVICE'],
})
export class EventsModule {}
