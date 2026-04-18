import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NotificationJob {
  user_id: string;
  type: string;
  channel: 'email' | 'push' | 'in_app' | 'sms';
  template_id: string;
  data: Record<string, unknown>;
  priority?: 'critical' | 'high' | 'normal' | 'low';
}

export interface NotificationDispatchResult {
  success: boolean;
  notification_id?: string;
  provider_id?: string;
  reason?: string;
  error?: string;
}

/**
 * Thin client for the Supabase notification-dispatch edge function. Fires
 * transactional emails via Resend with retry + logging handled server-side.
 *
 * Configuration (set in services/orders/.env):
 *   SUPABASE_URL              (required)
 *   SUPABASE_SERVICE_ROLE_KEY (required — bearer)
 */
@Injectable()
export class NotificationDispatchClient {
  private readonly logger = new Logger(NotificationDispatchClient.name);
  private readonly endpoint: string | null;
  private readonly serviceKey: string | null;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('SUPABASE_URL');
    this.serviceKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY') ?? null;
    this.endpoint = url ? `${url.replace(/\/$/, '')}/functions/v1/notification-dispatch` : null;
  }

  async enqueue(job: NotificationJob): Promise<NotificationDispatchResult> {
    if (!this.endpoint || !this.serviceKey) {
      this.logger.warn(
        `notification-dispatch not configured (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing); skipping ${job.type} for user ${job.user_id}`,
      );
      return { success: false, error: 'not_configured' };
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.serviceKey}`,
          apikey: this.serviceKey,
        },
        body: JSON.stringify(job),
      });

      const text = await response.text();
      const body = text ? safeParseJson(text) : {};

      if (!response.ok) {
        this.logger.error(
          `notification-dispatch failed (${response.status}) for ${job.type}: ${text}`,
        );
        return {
          success: false,
          error: body?.error || `HTTP ${response.status}`,
        };
      }

      return body as NotificationDispatchResult;
    } catch (err: any) {
      this.logger.error(
        `notification-dispatch threw for ${job.type}: ${err.message}`,
      );
      return { success: false, error: err.message };
    }
  }
}

function safeParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
