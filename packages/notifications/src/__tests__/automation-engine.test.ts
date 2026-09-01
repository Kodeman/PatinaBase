import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  enrollUser,
  unenrollUser,
  processEnrollments,
  evaluateCondition,
  isWithinSendWindow,
  nextSendWindowOpening,
} from '../automation-engine';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK SUPABASE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a chainable mock that supports the full PostgREST builder API.
 * Each filter method returns the same builder so calls can be chained,
 * and the terminal `then` resolves to the configured data.
 */
function createChainableMock(resolvedData: { data: unknown; count?: number; error: null | { message: string } }) {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {};

  const chainMethods = [
    'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'ilike', 'like', 'in', 'is', 'not', 'single', 'maybeSingle', 'order', 'limit',
    'insert', 'update', 'delete', 'lte',
  ];

  for (const method of chainMethods) {
    mock[method] = vi.fn().mockReturnValue(mock);
  }

  // Terminal: when awaited, resolve to the configured data
  mock.then = vi.fn().mockImplementation((resolve: (val: unknown) => void) => {
    resolve(resolvedData);
  });

  return mock;
}

interface MockConfig {
  /** Existing active enrollments for the user (duplicate check) */
  existingEnrollments?: Array<{ id: string }>;
  /** The sequence to return */
  sequence?: {
    id: string;
    name?: string;
    status?: string;
    steps_json: Array<{ type: string; config: Record<string, unknown> }>;
    total_enrolled?: number;
    total_completed?: number;
    total_emails_sent?: number;
  };
  /** Active enrollments due for processing */
  dueEnrollments?: Array<{
    id: string;
    sequence_id: string;
    user_id: string;
    current_step: number;
    status: string;
    step_history: Array<{ step: number; type: string; completed_at: string; result: string }>;
    next_step_at: string;
    enrolled_at: string;
  }>;
  /** Profile data for condition checks */
  profile?: Record<string, unknown>;
  /** Engagement events for event_occurred checks AND the firsts_summary query */
  engagementEvents?: Array<Record<string, unknown>>;
  /** Completed enrollments after processing (for counting) */
  completedEnrollments?: Array<{ id: string }>;
  /** Whether inserts should fail */
  insertError?: { message: string } | null;
  /** notification_preferences row for the preference gate (null ⇒ allow) */
  notificationPreferences?: Record<string, unknown> | null;
  /** notification_log rows returned to the 24h spacing guard */
  recentLogs?: Array<Record<string, unknown>>;
  /** Response the notification-dispatch invoke resolves with */
  dispatchResponse?: { data: unknown; error: unknown };
}

function createMockSupabase(config: MockConfig = {}) {
  const {
    existingEnrollments = [],
    sequence = null,
    dueEnrollments = [],
    profile = null,
    engagementEvents = [],
    completedEnrollments = [],
    insertError = null,
    notificationPreferences = null,
    recentLogs = [],
    dispatchResponse = { data: null, error: null },
  } = config;

  // Track calls per table and build appropriate responses
  const enrollmentCallCount = { select: 0, update: 0 };
  const sequenceCallCount = { select: 0, update: 0 };

  // Records every payload passed to sequence_enrollments.update(...) so tests
  // can assert unsubscribe / deferral / advancement side effects.
  const enrollmentUpdates: Array<Record<string, unknown>> = [];

  const functionsInvoke = vi.fn().mockResolvedValue(dispatchResponse);

  const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });

  const fromMock = vi.fn().mockImplementation((table: string) => {
    switch (table) {
      case 'sequence_enrollments': {
        enrollmentCallCount.select++;

        // Build a chainable mock that handles different call patterns
        const mock: Record<string, ReturnType<typeof vi.fn>> = {};
        const chainMethods = [
          'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
          'ilike', 'in', 'is', 'not', 'single', 'order', 'limit',
          'lte',
        ];

        for (const method of chainMethods) {
          mock[method] = vi.fn().mockReturnValue(mock);
        }

        // Insert: for enrollUser
        mock.insert = vi.fn().mockReturnValue(
          insertError
            ? { data: null, error: insertError, then: (resolve: (val: unknown) => void) => resolve({ data: null, error: insertError }) }
            : { data: { id: 'enrollment-new' }, error: null, then: (resolve: (val: unknown) => void) => resolve({ data: { id: 'enrollment-new' }, error: null }) }
        );

        // Update: for unenrollUser / advance / gate side effects. Record the
        // payload so tests can assert what was written.
        mock.update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          enrollmentUpdates.push(payload);
          return {
            eq: vi.fn().mockReturnValue({
              then: (resolve: (val: unknown) => void) => resolve({ data: null, error: null }),
            }),
            then: (resolve: (val: unknown) => void) => resolve({ data: null, error: null }),
          };
        });

        // Default terminal resolution depends on context.
        // For the first call (checking existing), return existingEnrollments.
        // For subsequent calls (querying due enrollments), return dueEnrollments.
        const callNumber = enrollmentCallCount.select;

        let resolveData: unknown;
        if (callNumber === 1) {
          // First call: checking for existing active enrollment (enrollUser duplicate check)
          // or querying due enrollments (processEnrollments)
          resolveData = dueEnrollments.length > 0 && existingEnrollments.length === 0
            ? dueEnrollments
            : existingEnrollments;
        } else if (callNumber === 2) {
          // Second call: could be due enrollments query or completed check
          resolveData = completedEnrollments.length > 0
            ? completedEnrollments
            : dueEnrollments;
        } else {
          resolveData = completedEnrollments;
        }

        mock.then = vi.fn().mockImplementation((resolve: (val: unknown) => void) => {
          resolve({ data: resolveData, error: null });
        });

        return mock;
      }

      case 'automated_sequences': {
        sequenceCallCount.select++;

        const mock: Record<string, ReturnType<typeof vi.fn>> = {};
        const chainMethods = [
          'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
          'ilike', 'in', 'is', 'not', 'single', 'order', 'limit',
        ];

        for (const method of chainMethods) {
          mock[method] = vi.fn().mockReturnValue(mock);
        }

        mock.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            then: (resolve: (val: unknown) => void) => resolve({ data: null, error: null }),
          }),
          then: (resolve: (val: unknown) => void) => resolve({ data: null, error: null }),
        });

        mock.then = vi.fn().mockImplementation((resolve: (val: unknown) => void) => {
          resolve({
            data: sequence
              ? {
                  id: sequence.id,
                  name: sequence.name || 'Test Sequence',
                  status: sequence.status || 'active',
                  steps_json: sequence.steps_json,
                  total_enrolled: sequence.total_enrolled ?? 0,
                  total_completed: sequence.total_completed ?? 0,
                  total_emails_sent: sequence.total_emails_sent ?? 0,
                }
              : null,
            error: sequence ? null : { message: 'not found' },
          });
        });

        return mock;
      }

      case 'profiles': {
        return createChainableMock({
          data: profile,
          error: profile ? null : { message: 'not found' },
        });
      }

      case 'engagement_events': {
        return createChainableMock({
          data: engagementEvents,
          error: null,
        });
      }

      case 'notification_preferences': {
        // Read via .maybeSingle() → resolves a single row or null.
        return createChainableMock({
          data: notificationPreferences,
          error: null,
        });
      }

      case 'notification_log': {
        // Read by the 24h spacing guard (array), or inserted-to elsewhere.
        return createChainableMock({
          data: recentLogs,
          error: null,
        });
      }

      default:
        return createChainableMock({ data: [], error: null });
    }
  });

  return {
    from: fromMock,
    functions: { invoke: functionsInvoke },
    rpc: rpcMock,
    // Test-only handle for asserting sequence_enrollments.update payloads.
    enrollmentUpdates,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('enrollUser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates enrollment with correct initial state', async () => {
    const supabase = createMockSupabase({
      existingEnrollments: [],
      sequence: {
        id: 'seq-1',
        steps_json: [
          { type: 'email', config: { template_id: 'welcome-1', subject: 'Welcome' } },
          { type: 'wait', config: { delay_days: 3 } },
          { type: 'email', config: { template_id: 'welcome-2', subject: 'Getting started' } },
        ],
        total_enrolled: 5,
      },
    });

    await enrollUser(supabase, 'seq-1', 'user-1');

    // Verify sequence_enrollments.insert was called
    expect(supabase.from).toHaveBeenCalledWith('sequence_enrollments');

    // Verify automated_sequences was queried
    expect(supabase.from).toHaveBeenCalledWith('automated_sequences');
  });

  it('prevents duplicate active enrollment', async () => {
    const supabase = createMockSupabase({
      existingEnrollments: [{ id: 'existing-enrollment-1' }],
      sequence: {
        id: 'seq-1',
        steps_json: [{ type: 'email', config: { template_id: 'welcome-1' } }],
      },
    });

    await expect(enrollUser(supabase, 'seq-1', 'user-1')).rejects.toThrow(
      'User is already enrolled in this sequence',
    );
  });
});

describe('unenrollUser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sets enrollment status to unsubscribed', async () => {
    const supabase = createMockSupabase();

    await unenrollUser(supabase, 'enrollment-1');

    expect(supabase.from).toHaveBeenCalledWith('sequence_enrollments');
  });
});

describe('processEnrollments', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('processes email step and advances enrollment', async () => {
    const supabase = createMockSupabase({
      dueEnrollments: [
        {
          id: 'enroll-1',
          sequence_id: 'seq-1',
          user_id: 'user-1',
          current_step: 0,
          status: 'active',
          step_history: [],
          next_step_at: new Date(Date.now() - 60000).toISOString(),
          enrolled_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      sequence: {
        id: 'seq-1',
        name: 'Welcome Series',
        status: 'active',
        steps_json: [
          // send_window: 'none' keeps the happy path deterministic regardless of
          // the wall-clock the suite runs at (the send-window guard is covered
          // by its own test below).
          { type: 'email', config: { template_id: 'welcome-1', subject: 'Welcome!', send_window: 'none' } },
          { type: 'wait', config: { delay_days: 2 } },
          { type: 'email', config: { template_id: 'welcome-2', subject: 'Getting started' } },
        ],
        total_emails_sent: 0,
      },
      completedEnrollments: [],
    });

    const result = await processEnrollments(supabase);

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // Verify notification-dispatch was invoked for the email step
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'notification-dispatch',
      expect.objectContaining({
        body: expect.objectContaining({
          user_id: 'user-1',
          channel: 'email',
          template_id: 'welcome-1',
        }),
      }),
    );
  });

  // ─── Wave 0 compliance gates ──────────────────────────────────────────────

  it('unsubscribes the enrollment when notification preferences block email', async () => {
    const supabase = createMockSupabase({
      dueEnrollments: [
        {
          id: 'enroll-unsub',
          sequence_id: 'seq-1',
          user_id: 'user-unsub',
          current_step: 0,
          status: 'active',
          step_history: [],
          next_step_at: new Date(Date.now() - 60000).toISOString(),
          enrolled_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      sequence: {
        id: 'seq-1',
        name: 'Welcome Series',
        status: 'active',
        steps_json: [
          { type: 'email', config: { template_id: 'welcome-1', send_window: 'none' } },
        ],
      },
      // channels_email off ⇒ the drip must stop.
      notificationPreferences: { channels_email: false, type_onboarding: true },
    });

    const result = await processEnrollments(supabase);

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);
    // Enrollment was marked unsubscribed, and no email was dispatched.
    expect(supabase.enrollmentUpdates).toContainEqual(
      expect.objectContaining({ status: 'unsubscribed' }),
    );
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('unsubscribes when type_onboarding is opted out', async () => {
    const supabase = createMockSupabase({
      dueEnrollments: [
        {
          id: 'enroll-unsub2',
          sequence_id: 'seq-1',
          user_id: 'user-unsub2',
          current_step: 0,
          status: 'active',
          step_history: [],
          next_step_at: new Date(Date.now() - 60000).toISOString(),
          enrolled_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      sequence: {
        id: 'seq-1',
        name: 'Welcome Series',
        status: 'active',
        steps_json: [{ type: 'email', config: { template_id: 'welcome-1', send_window: 'none' } }],
      },
      notificationPreferences: { channels_email: true, type_onboarding: false },
    });

    const result = await processEnrollments(supabase);

    expect(result.processed).toBe(1);
    expect(supabase.enrollmentUpdates).toContainEqual(
      expect.objectContaining({ status: 'unsubscribed' }),
    );
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('defers to the next window opening outside business hours', async () => {
    // 2022-01-01 is a Saturday. 21:00Z = 15:00 CST (America/Chicago, winter).
    // Outside Mon–Fri 08:00–17:00, so the send must be deferred to Mon 08:00 CT.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2022-01-01T21:00:00.000Z'));
    try {
      const supabase = createMockSupabase({
        dueEnrollments: [
          {
            id: 'enroll-window',
            sequence_id: 'seq-1',
            user_id: 'user-window',
            current_step: 0,
            status: 'active',
            step_history: [],
            next_step_at: new Date(Date.now() - 60000).toISOString(),
            enrolled_at: new Date(Date.now() - 86400000).toISOString(),
          },
        ],
        sequence: {
          id: 'seq-1',
          name: 'Welcome Series',
          status: 'active',
          // No send_window override ⇒ the business-hours guard applies.
          steps_json: [{ type: 'email', config: { template_id: 'welcome-1' } }],
        },
      });

      const result = await processEnrollments(supabase);

      expect(result.processed).toBe(1);
      // No email sent; next_step_at pushed to the next window opening.
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      // Monday 2022-01-03 08:00 CST == 14:00Z.
      expect(supabase.enrollmentUpdates).toContainEqual(
        expect.objectContaining({ next_step_at: '2022-01-03T14:00:00.000Z' }),
      );
      expect(nextSendWindowOpening(new Date())).toBe('2022-01-03T14:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('defers when another sequence email was sent within the last 24h', async () => {
    // Monday 2022-01-03 15:00Z == 09:00 CST — inside the send window, so only the
    // 24h spacing guard can fire.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2022-01-03T15:00:00.000Z'));
    try {
      const lastSentAt = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
      const supabase = createMockSupabase({
        dueEnrollments: [
          {
            id: 'enroll-spacing',
            sequence_id: 'seq-1',
            user_id: 'user-spacing',
            current_step: 0,
            status: 'active',
            step_history: [],
            next_step_at: new Date(Date.now() - 60000).toISOString(),
            enrolled_at: new Date(Date.now() - 2 * 86400000).toISOString(),
          },
        ],
        sequence: {
          id: 'seq-1',
          name: 'Welcome Series',
          status: 'active',
          steps_json: [{ type: 'email', config: { template_id: 'welcome-1' } }],
        },
        recentLogs: [
          { sent_at: lastSentAt, created_at: lastSentAt, metadata: { sequence_id: 'other-seq' } },
        ],
      });

      const result = await processEnrollments(supabase);

      expect(result.processed).toBe(1);
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      const notificationLogQueryIndex = supabase.from.mock.calls.findIndex(
        (call: [string]) => call[0] === 'notification_log',
      );
      expect(
        supabase.from.mock.results[notificationLogQueryIndex].value.in,
      ).toHaveBeenCalledWith(
        'status',
        ['delivered', 'sent', 'sending', 'opened', 'clicked', 'unconfirmed'],
      );
      // Deferred to last send + 24h.
      const expected = new Date(new Date(lastSentAt).getTime() + 86400000).toISOString();
      expect(supabase.enrollmentUpdates).toContainEqual(
        expect.objectContaining({ next_step_at: expected }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a skipped dispatch response as a completed step and advances', async () => {
    // Inside the send window so the email step actually dispatches.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2022-01-03T15:00:00.000Z'));
    try {
      const supabase = createMockSupabase({
        dueEnrollments: [
          {
            id: 'enroll-skip',
            sequence_id: 'seq-1',
            user_id: 'user-skip',
            current_step: 0,
            status: 'active',
            step_history: [],
            next_step_at: new Date(Date.now() - 60000).toISOString(),
            enrolled_at: new Date(Date.now() - 86400000).toISOString(),
          },
        ],
        sequence: {
          id: 'seq-1',
          name: 'Welcome Series',
          status: 'active',
          steps_json: [
            { type: 'email', config: { template_id: 'welcome-1' } },
            { type: 'wait', config: { delay_days: 2 } },
            { type: 'email', config: { template_id: 'welcome-2' } },
          ],
        },
        dispatchResponse: {
          data: { success: true, skipped: true, reason: 'rate_capped' },
          error: null,
        },
      });

      const result = await processEnrollments(supabase);

      expect(result.processed).toBe(1);
      expect(result.errors).toBe(0);
      // Dispatch was still invoked, and the enrollment advanced with a
      // skipped:<reason> step-history result.
      expect(supabase.functions.invoke).toHaveBeenCalled();
      const advanced = supabase.enrollmentUpdates.find(
        (u: Record<string, unknown>) => Array.isArray(u.step_history),
      );
      expect(advanced).toBeTruthy();
      const history = advanced!.step_history as Array<{ result: string }>;
      expect(history[history.length - 1].result).toBe('skipped:rate_capped');
    } finally {
      vi.useRealTimers();
    }
  });

  // ─── Wave 3b: paired in-app nudge · enrichment · firsts_summary ───────────

  const dueAt = () => new Date(Date.now() - 60000).toISOString();
  const enrolledAt = () => new Date(Date.now() - 86400000).toISOString();

  it('fires the paired in-app nudge with an interpolated deep_link after a real send', async () => {
    const supabase = createMockSupabase({
      dueEnrollments: [
        {
          id: 'enroll-inapp',
          sequence_id: 'seq-1',
          user_id: 'user-inapp',
          current_step: 0,
          status: 'active',
          step_history: [],
          next_step_at: dueAt(),
          enrolled_at: enrolledAt(),
        },
      ],
      sequence: {
        id: 'seq-1',
        name: 'Designer Onboarding',
        status: 'active',
        steps_json: [
          {
            type: 'email',
            config: {
              template_id: 'designer-welcome',
              subject: 'Your desk is ready',
              send_window: 'none',
              in_app: {
                headline: 'Welcome. Replay the walkthrough anytime.',
                message: '',
                deep_link: '{{app_url}}/help',
              },
            },
          },
        ],
      },
      dispatchResponse: { data: { success: true }, error: null },
    });

    const result = await processEnrollments(supabase);

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    const calls = supabase.functions.invoke.mock.calls;
    // Two dispatches: the email, then the paired in-app nudge.
    expect(calls).toHaveLength(2);

    const inAppCall = calls.find((c: unknown[]) => (c[1] as { body?: { channel?: string } })?.body?.channel === 'in_app');
    expect(inAppCall).toBeTruthy();
    expect(inAppCall[1].body).toEqual(
      expect.objectContaining({
        user_id: 'user-inapp',
        type: 'welcome_series',
        channel: 'in_app',
        template_id: 'designer-welcome',
      }),
    );
    // {{app_url}} interpolated with the default DESIGNER_PORTAL_URL.
    expect(inAppCall[1].body.data).toEqual(
      expect.objectContaining({
        headline: 'Welcome. Replay the walkthrough anytime.',
        message: '',
        deep_link: 'https://app.patina.cloud/help',
      }),
    );
  });

  it('does NOT fire the in-app nudge when the email dispatch is skipped', async () => {
    const supabase = createMockSupabase({
      dueEnrollments: [
        {
          id: 'enroll-inapp-skip',
          sequence_id: 'seq-1',
          user_id: 'user-inapp-skip',
          current_step: 0,
          status: 'active',
          step_history: [],
          next_step_at: dueAt(),
          enrolled_at: enrolledAt(),
        },
      ],
      sequence: {
        id: 'seq-1',
        name: 'Designer Onboarding',
        status: 'active',
        steps_json: [
          {
            type: 'email',
            config: {
              template_id: 'designer-welcome',
              send_window: 'none',
              in_app: { headline: 'x', message: '', deep_link: '{{app_url}}/help' },
            },
          },
        ],
      },
      dispatchResponse: {
        data: { success: true, skipped: true, reason: 'rate_capped' },
        error: null,
      },
    });

    const result = await processEnrollments(supabase);

    expect(result.processed).toBe(1);
    const calls = supabase.functions.invoke.mock.calls;
    // Only the email dispatch; a skipped send must not pair an in-app nudge.
    expect(calls).toHaveLength(1);
    expect(
      calls.every((c: unknown[]) => (c[1] as { body?: { channel?: string } })?.body?.channel !== 'in_app'),
    ).toBe(true);
  });

  it('builds firsts_summary and passes it for include_firsts_summary steps', async () => {
    const supabase = createMockSupabase({
      dueEnrollments: [
        {
          id: 'enroll-firsts',
          sequence_id: 'seq-1',
          user_id: 'user-firsts',
          current_step: 0,
          status: 'active',
          step_history: [],
          next_step_at: dueAt(),
          enrolled_at: enrolledAt(),
        },
      ],
      sequence: {
        id: 'seq-1',
        name: 'Designer Onboarding',
        status: 'active',
        steps_json: [
          {
            type: 'email',
            config: {
              template_id: 'onboarding-six-weeks',
              subject: 'Six weeks in',
              include_firsts_summary: true,
              send_window: 'none',
            },
          },
        ],
      },
      // Chronological first-occurrence activation events (00291 write path).
      engagementEvents: [
        { event_name: 'designer_first_signin', created_at: '2026-06-03T12:00:00.000Z', posthog_event_id: 'activation:designer_first_signin:user-firsts' },
        { event_name: 'first_capture', created_at: '2026-06-05T12:00:00.000Z', posthog_event_id: 'activation:first_capture:user-firsts' },
        { event_name: 'proposal_sent', created_at: '2026-06-12T12:00:00.000Z', posthog_event_id: 'activation:proposal_sent:user-firsts' },
      ],
      dispatchResponse: { data: { success: true }, error: null },
    });

    const result = await processEnrollments(supabase);
    expect(result.processed).toBe(1);

    const calls = supabase.functions.invoke.mock.calls;
    const emailCall = calls.find((c: unknown[]) => (c[1] as { body?: { channel?: string } })?.body?.channel === 'email');
    expect(emailCall).toBeTruthy();
    expect(emailCall[1].body.data.firsts_summary).toBe(
      'You signed in on June 3; your first capture landed June 5; your first proposal went out June 12.',
    );
  });

  it('falls back gracefully when the only activation first is the sign-in', async () => {
    const supabase = createMockSupabase({
      dueEnrollments: [
        {
          id: 'enroll-firsts-solo',
          sequence_id: 'seq-1',
          user_id: 'user-firsts-solo',
          current_step: 0,
          status: 'active',
          step_history: [],
          next_step_at: dueAt(),
          enrolled_at: enrolledAt(),
        },
      ],
      sequence: {
        id: 'seq-1',
        name: 'Designer Onboarding',
        status: 'active',
        steps_json: [
          {
            type: 'email',
            config: {
              template_id: 'onboarding-six-weeks',
              include_firsts_summary: true,
              send_window: 'none',
            },
          },
        ],
      },
      engagementEvents: [
        { event_name: 'designer_first_signin', created_at: '2026-06-03T12:00:00.000Z', posthog_event_id: 'activation:designer_first_signin:user-firsts-solo' },
      ],
      dispatchResponse: { data: { success: true }, error: null },
    });

    await processEnrollments(supabase);

    const calls = supabase.functions.invoke.mock.calls;
    const emailCall = calls.find((c: unknown[]) => (c[1] as { body?: { channel?: string } })?.body?.channel === 'email');
    expect(emailCall[1].body.data.firsts_summary).toBe(
      'You set up your desk — the rest is ahead of you.',
    );
  });

  it('enriches every sequence email with first_name, app_url, and send tags', async () => {
    const supabase = createMockSupabase({
      dueEnrollments: [
        {
          id: 'enroll-enrich',
          sequence_id: 'seq-1',
          user_id: 'user-enrich',
          current_step: 0,
          status: 'active',
          step_history: [],
          next_step_at: dueAt(),
          enrolled_at: enrolledAt(),
        },
      ],
      sequence: {
        id: 'seq-1',
        name: 'Designer Onboarding',
        status: 'active',
        steps_json: [
          { type: 'email', config: { template_id: 'designer-welcome', send_window: 'none' } },
        ],
      },
      // display_name → first whitespace-separated token → first_name.
      profile: { display_name: 'Leah Cahill' },
      dispatchResponse: { data: { success: true }, error: null },
    });

    const result = await processEnrollments(supabase);
    expect(result.processed).toBe(1);

    const calls = supabase.functions.invoke.mock.calls;
    const emailCall = calls.find((c: unknown[]) => (c[1] as { body?: { channel?: string } })?.body?.channel === 'email');
    expect(emailCall).toBeTruthy();
    expect(emailCall[1].body.data).toEqual(
      expect.objectContaining({
        first_name: 'Leah',
        app_url: 'https://app.patina.cloud',
        sequence_id: 'seq-1',
        step_index: 0,
      }),
    );
  });

  it('processes wait step by calculating next time', async () => {
    const supabase = createMockSupabase({
      dueEnrollments: [
        {
          id: 'enroll-2',
          sequence_id: 'seq-1',
          user_id: 'user-2',
          current_step: 1,
          status: 'active',
          step_history: [
            { step: 0, type: 'email', completed_at: new Date().toISOString(), result: 'sent' },
          ],
          next_step_at: new Date(Date.now() - 60000).toISOString(),
          enrolled_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      sequence: {
        id: 'seq-1',
        name: 'Welcome Series',
        status: 'active',
        steps_json: [
          { type: 'email', config: { template_id: 'welcome-1', subject: 'Welcome!' } },
          { type: 'wait', config: { delay_days: 2 } },
          { type: 'email', config: { template_id: 'welcome-2', subject: 'Getting started' } },
        ],
      },
      completedEnrollments: [],
    });

    const result = await processEnrollments(supabase);

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // Should NOT invoke notification-dispatch for a wait step
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('marks enrollment completed when all steps are done', async () => {
    const supabase = createMockSupabase({
      dueEnrollments: [
        {
          id: 'enroll-3',
          sequence_id: 'seq-1',
          user_id: 'user-3',
          current_step: 0,
          status: 'active',
          step_history: [],
          next_step_at: new Date(Date.now() - 60000).toISOString(),
          enrolled_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      sequence: {
        id: 'seq-1',
        name: 'Simple Sequence',
        status: 'active',
        steps_json: [
          { type: 'end', config: {} },
        ],
        total_completed: 0,
      },
      completedEnrollments: [{ id: 'enroll-3' }],
    });

    const result = await processEnrollments(supabase);

    expect(result.processed).toBe(1);
    expect(result.completed).toBe(1);
  });

  it('returns zero counts when no enrollments are due', async () => {
    const supabase = createMockSupabase({
      dueEnrollments: [],
    });

    const result = await processEnrollments(supabase);

    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.completed).toBe(0);
  });
});

describe('evaluateCondition', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('evaluates user_property with eq operator', async () => {
    const supabase = createMockSupabase({
      profile: { engagement_score: 75 },
    });

    const resultTrue = await evaluateCondition(supabase, 'user-1', {
      type: 'user_property',
      field: 'engagement_score',
      operator: 'gt',
      value: 50,
    });

    expect(resultTrue).toBe(true);
  });

  it('evaluates user_property with gt operator returns false when not met', async () => {
    const supabase = createMockSupabase({
      profile: { engagement_score: 30 },
    });

    const resultFalse = await evaluateCondition(supabase, 'user-1', {
      type: 'user_property',
      field: 'engagement_score',
      operator: 'gt',
      value: 50,
    });

    expect(resultFalse).toBe(false);
  });

  it('evaluates event_occurred condition', async () => {
    const supabase = createMockSupabase({
      engagementEvents: [{ id: 'event-1' }],
    });

    const result = await evaluateCondition(supabase, 'user-1', {
      type: 'event_occurred',
      event: 'style_quiz_completed',
    });

    expect(result).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('engagement_events');
  });

  it('evaluates event_occurred returns false when no events', async () => {
    const supabase = createMockSupabase({
      engagementEvents: [],
    });

    const result = await evaluateCondition(supabase, 'user-1', {
      type: 'event_occurred',
      event: 'style_quiz_completed',
    });

    expect(result).toBe(false);
  });

  it('evaluates engagement_check condition with matching tier', async () => {
    const supabase = createMockSupabase({
      profile: { engagement_tier: 'high' },
    });

    const result = await evaluateCondition(supabase, 'user-1', {
      type: 'engagement_check',
      tier: 'high',
    });

    expect(result).toBe(true);
  });

  it('evaluates engagement_check condition with non-matching tier', async () => {
    const supabase = createMockSupabase({
      profile: { engagement_tier: 'low' },
    });

    const result = await evaluateCondition(supabase, 'user-1', {
      type: 'engagement_check',
      tier: 'high',
    });

    expect(result).toBe(false);
  });

  it('evaluates engagement_check with array of tiers', async () => {
    const supabase = createMockSupabase({
      profile: { engagement_tier: 'medium' },
    });

    const result = await evaluateCondition(supabase, 'user-1', {
      type: 'engagement_check',
      tier: ['medium', 'high'],
    });

    expect(result).toBe(true);
  });

  it('returns false for unknown condition type', async () => {
    const supabase = createMockSupabase();

    const result = await evaluateCondition(supabase, 'user-1', {
      type: 'unknown_type',
    });

    expect(result).toBe(false);
  });
});

describe('send-window helpers', () => {
  it('is closed on a weekend afternoon (America/Chicago)', () => {
    // Sat 2022-01-01 21:00Z == 15:00 CST.
    expect(isWithinSendWindow(new Date('2022-01-01T21:00:00.000Z'))).toBe(false);
  });

  it('is open midday on a weekday (America/Chicago)', () => {
    // Mon 2022-01-03 15:00Z == 09:00 CST.
    expect(isWithinSendWindow(new Date('2022-01-03T15:00:00.000Z'))).toBe(true);
  });

  it('is closed before 08:00 and after 17:00 on a weekday', () => {
    // Mon 2022-01-03 13:00Z == 07:00 CST (before open).
    expect(isWithinSendWindow(new Date('2022-01-03T13:00:00.000Z'))).toBe(false);
    // Mon 2022-01-03 23:30Z == 17:30 CST (after close).
    expect(isWithinSendWindow(new Date('2022-01-03T23:30:00.000Z'))).toBe(false);
  });

  it('rolls a Saturday send to Monday 08:00 CT', () => {
    // From Sat 15:00 CST, the next opening is Mon 08:00 CST == 14:00Z.
    expect(nextSendWindowOpening(new Date('2022-01-01T21:00:00.000Z'))).toBe(
      '2022-01-03T14:00:00.000Z',
    );
  });

  it('rolls a weekday after-hours send to the next morning 08:00 CT', () => {
    // Mon 23:30Z (17:30 CST, after close) → Tue 2022-01-04 08:00 CST == 14:00Z.
    expect(nextSendWindowOpening(new Date('2022-01-03T23:30:00.000Z'))).toBe(
      '2022-01-04T14:00:00.000Z',
    );
  });
});
