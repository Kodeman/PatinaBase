import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notify } from '../notify';
import type { NotificationQueue } from '../queue';
import type { NotificationPreferences } from '../types';
import { DEFAULT_PREFERENCES } from '../preferences';

// Mock Supabase client
function createMockSupabase(preferences?: Partial<NotificationPreferences>) {
  const prefs = {
    id: 'pref-1',
    user_id: 'user-1',
    ...DEFAULT_PREFERENCES,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...preferences,
  };

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: prefs, error: null }),
        }),
      }),
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function createMockQueue(): NotificationQueue {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
    enqueueBatch: vi.fn().mockResolvedValue(undefined),
  };
}

describe('notify', () => {
  let queue: NotificationQueue;

  beforeEach(() => {
    queue = createMockQueue();
  });

  it('enqueues email for a basic notification', async () => {
    const supabase = createMockSupabase();
    const results = await notify(
      { supabase, queue },
      'user-1',
      'new_lead_designer',
      { clientName: 'Test Client' }
    );

    // new_lead_designer defaults to email + push + in_app
    expect(results.length).toBe(3);
    expect(results.filter((r) => r.success)).toHaveLength(3);
    expect(queue.enqueue).toHaveBeenCalledTimes(3);
  });

  it('skips notification when user has opted out of type', async () => {
    const supabase = createMockSupabase({ type_new_lead: false });
    const results = await notify(
      { supabase, queue },
      'user-1',
      'new_lead_designer',
      { clientName: 'Test Client' }
    );

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('opted out');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('always sends transactional types even if opted out', async () => {
    const supabase = createMockSupabase({ type_account_security: false });
    const results = await notify(
      { supabase, queue },
      'user-1',
      'account_verification',
      { verificationUrl: 'https://example.com/verify' }
    );

    expect(results.some((r) => r.success)).toBe(true);
    expect(queue.enqueue).toHaveBeenCalled();
  });

  it('skips disabled channels', async () => {
    const supabase = createMockSupabase({ channels_push: false });
    const results = await notify(
      { supabase, queue },
      'user-1',
      'new_lead_designer',
      { clientName: 'Test' }
    );

    // new_lead_designer uses email + push + in_app, push is disabled
    const pushResult = results.find((r) => r.channel === 'push');
    expect(pushResult?.success).toBe(false);
    expect(pushResult?.error).toContain('disabled');
  });

  it('defers non-critical notifications during quiet hours', async () => {
    const supabase = createMockSupabase({
      quiet_hours_enabled: true,
      quiet_hours_start: '00:00',
      quiet_hours_end: '23:59',
      timezone: 'UTC',
    });

    const results = await notify(
      { supabase, queue },
      'user-1',
      'price_drop',
      { productName: 'Test Chair' }
    );

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('quiet hours');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('sends critical notifications during quiet hours', async () => {
    const supabase = createMockSupabase({
      quiet_hours_enabled: true,
      quiet_hours_start: '00:00',
      quiet_hours_end: '23:59',
      timezone: 'UTC',
    });

    const results = await notify(
      { supabase, queue },
      'user-1',
      'security_alert',
      { alertType: 'new_device' },
      { priority: 'critical' }
    );

    expect(results.some((r) => r.success)).toBe(true);
    expect(queue.enqueue).toHaveBeenCalled();
  });

  it('respects explicit channel override in options', async () => {
    const supabase = createMockSupabase();
    const results = await notify(
      { supabase, queue },
      'user-1',
      'weekly_inspiration',
      {},
      { channels: ['email', 'push'] }
    );

    expect(queue.enqueue).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
  });

  it('handles queue errors gracefully', async () => {
    const failingQueue: NotificationQueue = {
      enqueue: vi.fn().mockRejectedValue(new Error('Queue down')),
      enqueueBatch: vi.fn().mockRejectedValue(new Error('Queue down')),
    };

    const supabase = createMockSupabase();
    const results = await notify(
      { supabase, queue: failingQueue },
      'user-1',
      'account_verification',
      { verificationUrl: 'https://example.com' }
    );

    expect(results.every((r) => !r.success)).toBe(true);
    expect(results[0].error).toContain('Queue down');
  });
});
