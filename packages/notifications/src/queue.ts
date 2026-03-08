import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationJob } from './types';

/**
 * Queue abstraction for notification delivery.
 *
 * Current implementation: direct Supabase Edge Function invocation.
 * Future: upgrade to Redis/BullMQ for better rate limiting, retries, and concurrency.
 */
export interface NotificationQueue {
  enqueue(job: NotificationJob): Promise<void>;
  enqueueBatch(jobs: NotificationJob[]): Promise<void>;
}

/**
 * Edge Function-based queue.
 * Invokes the `notification-dispatch` Edge Function for each job.
 */
export function createEdgeFunctionQueue(supabase: SupabaseClient): NotificationQueue {
  return {
    async enqueue(job: NotificationJob): Promise<void> {
      const { error } = await supabase.functions.invoke('notification-dispatch', {
        body: job,
      });

      if (error) {
        console.error('[notification-queue] Failed to enqueue job:', error);
        throw new Error(`Failed to enqueue notification: ${error.message}`);
      }
    },

    async enqueueBatch(jobs: NotificationJob[]): Promise<void> {
      // Process batch sequentially for now to respect rate limits.
      // Future: use Redis bulk enqueue or Resend Batch API.
      const results = await Promise.allSettled(
        jobs.map((job) =>
          supabase.functions.invoke('notification-dispatch', {
            body: job,
          })
        )
      );

      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        console.error(`[notification-queue] ${failures.length}/${jobs.length} jobs failed`);
      }
    },
  };
}
