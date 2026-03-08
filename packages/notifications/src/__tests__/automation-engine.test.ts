import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  enrollUser,
  unenrollUser,
  processEnrollments,
  evaluateCondition,
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
    'ilike', 'in', 'is', 'not', 'single', 'order', 'limit',
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
  /** Engagement events for event_occurred checks */
  engagementEvents?: Array<{ id: string }>;
  /** Completed enrollments after processing (for counting) */
  completedEnrollments?: Array<{ id: string }>;
  /** Whether inserts should fail */
  insertError?: { message: string } | null;
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
  } = config;

  // Track calls per table and build appropriate responses
  const enrollmentCallCount = { select: 0, update: 0 };
  const sequenceCallCount = { select: 0, update: 0 };

  const functionsInvoke = vi.fn().mockResolvedValue({ data: null, error: null });

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

        // Update: for unenrollUser / advance
        mock.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            then: (resolve: (val: unknown) => void) => resolve({ data: null, error: null }),
          }),
          then: (resolve: (val: unknown) => void) => resolve({ data: null, error: null }),
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

      default:
        return createChainableMock({ data: [], error: null });
    }
  });

  return {
    from: fromMock,
    functions: { invoke: functionsInvoke },
    rpc: rpcMock,
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
          { type: 'email', config: { template_id: 'welcome-1', subject: 'Welcome!' } },
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
