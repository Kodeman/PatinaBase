import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveAudience, estimateAudienceSize, snapshotAudience } from '../audience';
import type { AudienceRecipient } from '../audience';
import type { SegmentRules } from '@patina/shared/types';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK SUPABASE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a chainable mock that supports the full PostgREST builder API.
 * Each filter method returns the same builder so calls can be chained,
 * and the terminal `then` resolves to the configured data.
 */
function createChainableMock(resolvedData: { data: unknown; count?: number; error: null }) {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {};

  const chainMethods = [
    'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'ilike', 'in', 'is', 'not', 'single', 'order', 'limit',
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

interface MockSupabaseConfig {
  /** Profile rows returned by the main profiles query */
  profiles?: Array<{
    id: string;
    email?: string;
    auth_email?: string;
    first_name?: string | null;
    role?: string | null;
    primary_role?: string | null;
  }>;
  /** Count returned by count queries */
  profileCount?: number;
  /** Users who have opted out of email */
  emailOptOuts?: Array<{ user_id: string }>;
  /** Users with hard bounces */
  bounced?: Array<{ user_id: string }>;
  /** Recent notification sends for frequency capping */
  recentSends?: Array<{ user_id: string }>;
}

function createMockSupabase(config: MockSupabaseConfig = {}) {
  const {
    profiles = [],
    profileCount = profiles.length,
    emailOptOuts = [],
    bounced = [],
    recentSends = [],
  } = config;

  // Track which table is being queried so we return appropriate data
  const fromMock = vi.fn().mockImplementation((table: string) => {
    switch (table) {
      case 'profiles': {
        return createChainableMock({ data: profiles, count: profileCount, error: null });
      }
      case 'notification_preferences': {
        return createChainableMock({ data: emailOptOuts, error: null });
      }
      case 'notification_log': {
        // The suppression logic calls notification_log twice:
        // once for bounces (filtered by status='bounced'), once for recent sends.
        // We return bounced data first, then recent sends.
        // Since both calls use .eq/.in/.gte chain, we use a counter.
        const callData = bounceOrSendToggle ? recentSends : bounced;
        bounceOrSendToggle = !bounceOrSendToggle;
        return createChainableMock({ data: callData, error: null });
      }
      default:
        return createChainableMock({ data: [], error: null });
    }
  });

  // Toggle between bounce and frequency cap queries
  let bounceOrSendToggle = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: fromMock } as any;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveAudience', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves audience with AND logic and two simple conditions', async () => {
    const profiles = [
      { id: 'u1', email: 'alice@test.com', first_name: 'Alice', role: 'designer' },
      { id: 'u2', email: 'bob@test.com', first_name: 'Bob', role: 'designer' },
    ];

    const supabase = createMockSupabase({ profiles });

    const rules: SegmentRules = {
      logic: 'and',
      conditions: [
        { field: 'engagement_tier', operator: 'eq', value: 'high' },
        { field: 'country', operator: 'eq', value: 'US' },
      ],
    };

    const result = await resolveAudience(supabase, rules);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      user_id: 'u1',
      email: 'alice@test.com',
      first_name: 'Alice',
      role: 'designer',
    });
    expect(result[1]).toEqual({
      user_id: 'u2',
      email: 'bob@test.com',
      first_name: 'Bob',
      role: 'designer',
    });

    // Verify from() was called for profiles, notification_preferences, and notification_log
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(supabase.from).toHaveBeenCalledWith('notification_preferences');
    expect(supabase.from).toHaveBeenCalledWith('notification_log');
  });

  it('resolves audience with OR logic by running separate queries and deduplicating', async () => {
    // For OR logic, each condition runs a separate query.
    // We set up the mock so each profiles query returns overlapping users.
    const profilesA = [
      { id: 'u1', email: 'alice@test.com', first_name: 'Alice', role: 'designer' },
      { id: 'u2', email: 'bob@test.com', first_name: 'Bob', role: 'consumer' },
    ];

    // The second condition query returns u2 again (overlap) plus u3
    const profilesB = [
      { id: 'u2', email: 'bob@test.com', first_name: 'Bob', role: 'consumer' },
      { id: 'u3', email: 'carol@test.com', first_name: 'Carol', role: 'designer' },
    ];

    let queryCount = 0;
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        const data = queryCount === 0 ? profilesA : profilesB;
        queryCount++;
        return createChainableMock({ data, count: data.length, error: null });
      }
      if (table === 'notification_preferences') {
        return createChainableMock({ data: [], error: null });
      }
      // notification_log — return empty for no suppression
      return createChainableMock({ data: [], error: null });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: fromMock } as any;

    const rules: SegmentRules = {
      logic: 'or',
      conditions: [
        { field: 'city', operator: 'eq', value: 'New York' },
        { field: 'city', operator: 'eq', value: 'Los Angeles' },
      ],
    };

    const result = await resolveAudience(supabase, rules);

    // u1, u2, u3 — u2 should be deduplicated
    expect(result).toHaveLength(3);
    const ids = result.map((r) => r.user_id);
    expect(ids).toContain('u1');
    expect(ids).toContain('u2');
    expect(ids).toContain('u3');
  });

  it('excludes suppressed users (opted out of email)', async () => {
    const profiles = [
      { id: 'u1', email: 'alice@test.com', first_name: 'Alice', role: 'designer' },
      { id: 'u2', email: 'bob@test.com', first_name: 'Bob', role: 'consumer' },
    ];

    const supabase = createMockSupabase({
      profiles,
      emailOptOuts: [{ user_id: 'u2' }],
    });

    const rules: SegmentRules = {
      logic: 'and',
      conditions: [
        { field: 'engagement_tier', operator: 'eq', value: 'high' },
      ],
    };

    const result = await resolveAudience(supabase, rules);

    expect(result).toHaveLength(1);
    expect(result[0].user_id).toBe('u1');
  });

  it('excludes users with hard bounces in the last 30 days', async () => {
    const profiles = [
      { id: 'u1', email: 'alice@test.com', first_name: 'Alice', role: 'designer' },
      { id: 'u2', email: 'bob@test.com', first_name: 'Bob', role: 'consumer' },
    ];

    const supabase = createMockSupabase({
      profiles,
      bounced: [{ user_id: 'u1' }],
    });

    const rules: SegmentRules = {
      logic: 'and',
      conditions: [
        { field: 'country', operator: 'eq', value: 'US' },
      ],
    };

    const result = await resolveAudience(supabase, rules);

    expect(result).toHaveLength(1);
    expect(result[0].user_id).toBe('u2');
  });

  it('excludes users who hit the frequency cap (3+ emails in 7 days)', async () => {
    const profiles = [
      { id: 'u1', email: 'alice@test.com', first_name: 'Alice', role: 'designer' },
      { id: 'u2', email: 'bob@test.com', first_name: 'Bob', role: 'consumer' },
    ];

    // u1 has 4 recent sends — exceeds the 3 cap
    const recentSends = [
      { user_id: 'u1' },
      { user_id: 'u1' },
      { user_id: 'u1' },
      { user_id: 'u1' },
      { user_id: 'u2' },
    ];

    const supabase = createMockSupabase({
      profiles,
      recentSends,
    });

    const rules: SegmentRules = {
      logic: 'and',
      conditions: [
        { field: 'country', operator: 'eq', value: 'US' },
      ],
    };

    const result = await resolveAudience(supabase, rules);

    expect(result).toHaveLength(1);
    expect(result[0].user_id).toBe('u2');
  });

  it('returns all email-subscribed users when conditions array is empty', async () => {
    const profiles = [
      { id: 'u1', email: 'alice@test.com', first_name: 'Alice', role: 'designer' },
      { id: 'u2', email: 'bob@test.com', first_name: 'Bob', role: 'consumer' },
      { id: 'u3', email: 'carol@test.com', first_name: 'Carol', role: null },
    ];

    const supabase = createMockSupabase({ profiles });

    const rules: SegmentRules = {
      logic: 'and',
      conditions: [],
    };

    const result = await resolveAudience(supabase, rules);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.user_id)).toEqual(['u1', 'u2', 'u3']);
  });

  it('filters out recipients without an email address', async () => {
    const profiles = [
      { id: 'u1', email: 'alice@test.com', first_name: 'Alice', role: 'designer' },
      { id: 'u2', email: '', first_name: 'NoEmail', role: 'consumer' },
    ];

    const supabase = createMockSupabase({ profiles });

    const rules: SegmentRules = {
      logic: 'and',
      conditions: [],
    };

    const result = await resolveAudience(supabase, rules);

    expect(result).toHaveLength(1);
    expect(result[0].user_id).toBe('u1');
  });
});

describe('estimateAudienceSize', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a count for AND logic', async () => {
    const supabase = createMockSupabase({ profileCount: 42 });

    const rules: SegmentRules = {
      logic: 'and',
      conditions: [
        { field: 'engagement_score', operator: 'gte', value: 50 },
        { field: 'country', operator: 'eq', value: 'US' },
      ],
    };

    const count = await estimateAudienceSize(supabase, rules);

    expect(count).toBe(42);
  });

  it('returns a count for empty conditions', async () => {
    const supabase = createMockSupabase({ profileCount: 100 });

    const rules: SegmentRules = {
      logic: 'and',
      conditions: [],
    };

    const count = await estimateAudienceSize(supabase, rules);

    expect(count).toBe(100);
  });

  it('returns deduplicated count for OR logic', async () => {
    // For OR logic, estimateAudienceSize fetches IDs and deduplicates
    const profilesA = [{ id: 'u1' }, { id: 'u2' }];
    const profilesB = [{ id: 'u2' }, { id: 'u3' }];

    let queryCount = 0;
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        const data = queryCount === 0 ? profilesA : profilesB;
        queryCount++;
        return createChainableMock({ data, count: data.length, error: null });
      }
      return createChainableMock({ data: [], error: null });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: fromMock } as any;

    const rules: SegmentRules = {
      logic: 'or',
      conditions: [
        { field: 'city', operator: 'eq', value: 'NYC' },
        { field: 'city', operator: 'eq', value: 'LA' },
      ],
    };

    const count = await estimateAudienceSize(supabase, rules);

    // u1, u2, u3 — deduplicated
    expect(count).toBe(3);
  });
});

describe('snapshotAudience', () => {
  it('freezes recipients with correct breakdown', () => {
    const recipients: AudienceRecipient[] = [
      { user_id: 'u1', email: 'a@test.com', first_name: 'Alice', role: 'designer' },
      { user_id: 'u2', email: 'b@test.com', first_name: 'Bob', role: 'designer' },
      { user_id: 'u3', email: 'c@test.com', first_name: 'Carol', role: 'consumer' },
      { user_id: 'u4', email: 'd@test.com', first_name: 'Dan', role: null },
      { user_id: 'u5', email: 'e@test.com', first_name: 'Eve', role: 'admin' },
    ];

    const snapshot = snapshotAudience(recipients);

    expect(snapshot.total).toBe(5);
    expect(snapshot.recipients).toHaveLength(5);
    expect(snapshot.breakdown).toEqual({
      designers: 2,
      consumers: 1,
      other: 2, // null role + admin
    });
    expect(snapshot.snapshot_at).toBeTruthy();
    // Verify it's a valid ISO date
    expect(new Date(snapshot.snapshot_at).toISOString()).toBe(snapshot.snapshot_at);
  });

  it('returns a copy of recipients, not a reference', () => {
    const recipients: AudienceRecipient[] = [
      { user_id: 'u1', email: 'a@test.com', first_name: 'Alice', role: 'designer' },
    ];

    const snapshot = snapshotAudience(recipients);

    // Mutating the original should not affect the snapshot
    recipients.push({
      user_id: 'u2', email: 'b@test.com', first_name: 'Bob', role: 'consumer',
    });

    expect(snapshot.recipients).toHaveLength(1);
    expect(snapshot.total).toBe(1);
  });

  it('handles empty recipient list', () => {
    const snapshot = snapshotAudience([]);

    expect(snapshot.total).toBe(0);
    expect(snapshot.recipients).toHaveLength(0);
    expect(snapshot.breakdown).toEqual({
      designers: 0,
      consumers: 0,
      other: 0,
    });
  });
});
