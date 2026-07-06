import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Publishes realtime events to Supabase Realtime broadcast channels.
 *
 * Replaces the former Socket.io gateway: instead of holding WebSocket
 * connections, the service POSTs to Supabase Realtime's server-side broadcast
 * endpoint (`/realtime/v1/api/broadcast`) with the service-role key. Portals
 * subscribe to the matching private channels (`project:<id>`, `user:<id>`) and
 * receive the same event names + payloads they did over Socket.io.
 *
 * Delivery is fire-and-forget: a broadcast failure is logged, never thrown, so
 * a realtime outage can never fail the domain operation that triggered it.
 */
@Injectable()
export class RealtimeBroadcasterService {
  private readonly logger = new Logger(RealtimeBroadcasterService.name);
  private readonly endpoint: string | null;
  private readonly serviceRoleKey: string | null;

  constructor(private readonly config: ConfigService) {
    const url =
      this.config.get<string>('supabase.url') ?? process.env.SUPABASE_URL ?? null;
    this.serviceRoleKey =
      this.config.get<string>('supabase.serviceRoleKey') ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      null;
    this.endpoint = url
      ? `${url.replace(/\/$/, '')}/realtime/v1/api/broadcast`
      : null;

    if (!this.endpoint || !this.serviceRoleKey) {
      this.logger.warn(
        'Supabase realtime broadcast is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing) — realtime events will be dropped.',
      );
    }
  }

  /** Broadcast a project-scoped event to everyone viewing the project. */
  broadcastToProject(projectId: string, event: string, payload: Record<string, unknown>) {
    return this.send(`project:${projectId}`, event, payload);
  }

  /** Send a direct event to a single user's private channel. */
  broadcastToUser(userId: string, event: string, payload: Record<string, unknown>) {
    return this.send(`user:${userId}`, event, payload);
  }

  private async send(topic: string, event: string, payload: Record<string, unknown>) {
    if (!this.endpoint || !this.serviceRoleKey) return;

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
        },
        body: JSON.stringify({
          messages: [{ topic, event, payload, private: true }],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(
          `Realtime broadcast ${event} → ${topic} failed: ${res.status} ${body}`,
        );
      }
    } catch (err) {
      this.logger.error(`Realtime broadcast ${event} → ${topic} errored`, err as Error);
    }
  }
}
