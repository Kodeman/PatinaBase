import type { SupabaseClient } from '@supabase/supabase-js';
import type { SegmentRules, SegmentRule, SegmentField, SegmentOperator } from '@patina/shared/types';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AudienceRecipient {
  user_id: string;
  email: string;
  first_name: string | null;
  role: string | null;
}

export interface AudienceSnapshot {
  recipients: AudienceRecipient[];
  total: number;
  snapshot_at: string;
  breakdown: {
    designers: number;
    consumers: number;
    other: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FIELD MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps segment fields to their source table and column name.
 * Fields without a `table` default to the `profiles` table.
 */
interface FieldMapping {
  table?: 'notification_preferences' | 'user_roles' | 'roles';
  column: string;
}

const FIELD_MAP: Record<SegmentField, FieldMapping> = {
  role:                { table: 'user_roles', column: 'role_domain' },
  founding_circle:     { column: 'is_founding_circle' },
  engagement_score:    { column: 'engagement_score' },
  engagement_tier:     { column: 'engagement_tier' },
  last_active_at:      { column: 'last_active_at' },
  created_at:          { column: 'created_at' },
  channels_email:      { table: 'notification_preferences', column: 'channels_email' },
  city:                { column: 'city' },
  state:               { column: 'state' },
  country:             { column: 'country' },
  has_completed_quiz:  { column: 'has_completed_quiz' },
  has_active_project:  { column: 'has_active_project' },
  total_orders:        { column: 'total_orders' },
  total_spent:         { column: 'total_spent' },
  last_purchase_at:    { column: 'last_purchase_at' },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute an ISO date string for "N days ago" relative to now.
 */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

/**
 * Returns the set of segment fields that require JOINing to external tables
 * (i.e. not directly on `profiles`).
 */
function getJoinFields(conditions: SegmentRule[]): {
  needsRoles: boolean;
  needsPreferences: boolean;
} {
  let needsRoles = false;
  let needsPreferences = false;
  for (const condition of conditions) {
    const mapping = FIELD_MAP[condition.field];
    if (mapping.table === 'user_roles' || mapping.table === 'roles') {
      needsRoles = true;
    }
    if (mapping.table === 'notification_preferences') {
      needsPreferences = true;
    }
  }
  return { needsRoles, needsPreferences };
}

/**
 * Build the select string for the profiles query.
 * Includes JOINed columns when needed.
 */
function buildSelectString(conditions: SegmentRule[]): string {
  const { needsRoles, needsPreferences } = getJoinFields(conditions);

  const parts = ['id', 'email:auth_email', 'first_name', 'role:primary_role'];

  if (needsRoles) {
    parts.push('user_roles!inner(role_id, roles!inner(domain))');
  }

  if (needsPreferences) {
    parts.push('notification_preferences(channels_email)');
  }

  return parts.join(', ');
}

/**
 * Apply a single segment rule as a Supabase PostgREST filter.
 * For fields that live on JOINed tables (role, channels_email), we apply
 * nested filters using the PostgREST relationship syntax.
 */
function applyFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  rule: SegmentRule,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const mapping = FIELD_MAP[rule.field];
  const { operator, value } = rule;

  // Determine the column reference with table prefix for joined tables.
  let column: string;
  if (rule.field === 'role') {
    column = 'user_roles.roles.domain';
  } else if (rule.field === 'channels_email') {
    column = 'notification_preferences.channels_email';
  } else {
    column = mapping.column;
  }

  return applyOperator(query, column, operator, value);
}

/**
 * Apply a single operator filter to a query builder.
 */
function applyOperator(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  column: string,
  operator: SegmentOperator,
  value: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  switch (operator) {
    case 'eq':
      return query.eq(column, value);
    case 'neq':
      return query.neq(column, value);
    case 'gt':
      return query.gt(column, value);
    case 'gte':
      return query.gte(column, value);
    case 'lt':
      return query.lt(column, value);
    case 'lte':
      return query.lte(column, value);
    case 'contains':
      return query.ilike(column, `%${value}%`);
    case 'not_contains':
      return query.not(column, 'ilike', `%${value}%`);
    case 'in':
      return query.in(column, value as unknown[]);
    case 'not_in':
      return query.not(column, 'in', `(${(value as unknown[]).join(',')})`);
    case 'is_set':
      return query.not(column, 'is', null);
    case 'is_not_set':
      return query.is(column, null);
    case 'older_than': {
      // "older_than N days" means the date is before N days ago.
      const cutoff = daysAgo(value as number);
      return query.lt(column, cutoff);
    }
    case 'newer_than': {
      // "newer_than N days" means the date is within the last N days.
      const cutoff = daysAgo(value as number);
      return query.gte(column, cutoff);
    }
    default:
      return query;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPRESSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch user IDs that should be suppressed from audience:
 * 1. Users with channels_email = false in notification_preferences
 * 2. Users with hard bounces in the last 30 days
 * 3. Users who received 3+ marketing emails in the last 7 days (frequency cap)
 *
 * Returns a Set of user_ids to exclude.
 */
async function getSuppressedUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const suppressedIds = new Set<string>();

  // 1. Email opt-outs — users who explicitly set channels_email = false
  const { data: optedOut } = await supabase
    .from('notification_preferences')
    .select('user_id')
    .eq('channels_email', false);

  if (optedOut) {
    for (const row of optedOut) {
      suppressedIds.add(row.user_id);
    }
  }

  // 2. Hard bounces in last 30 days
  const thirtyDaysAgo = daysAgo(30);
  const { data: bounced } = await supabase
    .from('notification_log')
    .select('user_id')
    .eq('status', 'bounced')
    .gte('created_at', thirtyDaysAgo);

  if (bounced) {
    for (const row of bounced) {
      suppressedIds.add(row.user_id);
    }
  }

  // 3. Frequency cap — 3+ marketing emails in last 7 days
  const sevenDaysAgo = daysAgo(7);
  const { data: recentSends } = await supabase
    .from('notification_log')
    .select('user_id')
    .eq('channel', 'email')
    .in('status', ['delivered', 'sent', 'sending', 'opened', 'clicked'])
    .gte('created_at', sevenDaysAgo);

  if (recentSends) {
    // Count sends per user
    const sendCounts = new Map<string, number>();
    for (const row of recentSends) {
      const count = sendCounts.get(row.user_id) ?? 0;
      sendCounts.set(row.user_id, count + 1);
    }
    for (const [userId, count] of sendCounts) {
      if (count >= 3) {
        suppressedIds.add(userId);
      }
    }
  }

  return suppressedIds;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE: QUERY BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build and execute a single filtered query for a set of AND conditions.
 * Returns raw profile rows.
 */
async function executeFilteredQuery(
  supabase: SupabaseClient,
  conditions: SegmentRule[],
  countOnly: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: any[] | null; count: number | null }> {
  if (countOnly) {
    let query = supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    for (const condition of conditions) {
      const mapping = FIELD_MAP[condition.field];
      // Skip joined-table fields for count queries — handled separately
      if (mapping.table) continue;
      query = applyOperator(query, mapping.column, condition.operator, condition.value);
    }

    const result = await query;
    return { data: null, count: result.count ?? 0 };
  }

  // Full select with JOINs
  const selectStr = buildSelectString(conditions);
  let query = supabase.from('profiles').select(selectStr);

  for (const condition of conditions) {
    query = applyFilter(query, condition);
  }

  const result = await query;
  return { data: result.data ?? [], count: null };
}

/**
 * Map raw profile rows from Supabase into AudienceRecipient format.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToRecipients(rows: any[]): AudienceRecipient[] {
  return rows.map((row) => ({
    user_id: row.id,
    email: row.email ?? row.auth_email ?? '',
    first_name: row.first_name ?? null,
    role: row.role ?? row.primary_role ?? null,
  }));
}

/**
 * Deduplicate recipients by user_id.
 */
function deduplicateRecipients(recipients: AudienceRecipient[]): AudienceRecipient[] {
  const seen = new Set<string>();
  const unique: AudienceRecipient[] = [];
  for (const r of recipients) {
    if (!seen.has(r.user_id)) {
      seen.add(r.user_id);
      unique.push(r);
    }
  }
  return unique;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve a full audience from segment rules.
 *
 * For 'and' logic: chains all conditions as filters on a single query.
 * For 'or' logic: runs separate queries per condition and unions results.
 *
 * Always applies suppression filters (email opt-out, bounces, frequency cap).
 */
export async function resolveAudience(
  supabase: SupabaseClient,
  rules: SegmentRules,
): Promise<AudienceRecipient[]> {
  const { logic, conditions } = rules;

  let recipients: AudienceRecipient[];

  if (conditions.length === 0) {
    // No conditions — select all users with an email
    const { data } = await supabase
      .from('profiles')
      .select('id, email:auth_email, first_name, role:primary_role')
      .not('auth_email', 'is', null);

    recipients = mapToRecipients(data ?? []);
  } else if (logic === 'and') {
    // AND: single query with all filters chained
    const { data } = await executeFilteredQuery(supabase, conditions, false);
    recipients = mapToRecipients(data ?? []);
  } else {
    // OR: one query per condition, union results
    const allResults = await Promise.all(
      conditions.map((condition) =>
        executeFilteredQuery(supabase, [condition], false)
      )
    );

    const allRows = allResults.flatMap((result) => result.data ?? []);
    recipients = deduplicateRecipients(mapToRecipients(allRows));
  }

  // Apply suppression filters
  const suppressed = await getSuppressedUserIds(supabase);

  const filtered = recipients.filter((r) => {
    // Must have a valid email
    if (!r.email) return false;

    // Exclude suppressed users
    if (suppressed.has(r.user_id)) return false;

    return true;
  });

  return filtered;
}

/**
 * Fast count estimate of audience size using the same rule compilation logic.
 * Uses Supabase count queries instead of fetching all rows.
 *
 * Note: For 'or' logic, this is an approximation because we cannot
 * easily deduplicate across separate count queries. We run the full
 * query and deduplicate for accuracy.
 */
export async function estimateAudienceSize(
  supabase: SupabaseClient,
  rules: SegmentRules,
): Promise<number> {
  const { logic, conditions } = rules;

  if (conditions.length === 0) {
    // Count all profiles with an email
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .not('auth_email', 'is', null);

    return count ?? 0;
  }

  if (logic === 'and') {
    // AND: single count query with all profile-level filters
    const { count } = await executeFilteredQuery(supabase, conditions, true);
    return count ?? 0;
  }

  // OR: for accurate counts with deduplication, we fetch IDs and deduplicate
  const allResults = await Promise.all(
    conditions.map(async (condition) => {
      const mapping = FIELD_MAP[condition.field];
      if (mapping.table) {
        // For joined fields, fall back to full query
        const { data } = await executeFilteredQuery(supabase, [condition], false);
        return (data ?? []).map((row: { id: string }) => row.id);
      }

      // For profile-level fields, select just IDs
      let query = supabase.from('profiles').select('id');
      query = applyOperator(query, mapping.column, condition.operator, condition.value);
      const { data } = await query;
      return (data ?? []).map((row: { id: string }) => row.id);
    })
  );

  const uniqueIds = new Set(allResults.flat());
  return uniqueIds.size;
}

/**
 * Freeze a resolved audience into an immutable snapshot.
 *
 * Captures the recipient list with metadata at the time of snapshot.
 * Used to lock in the audience before a campaign send begins, preventing
 * drift between audience resolution and actual delivery.
 */
export function snapshotAudience(recipients: AudienceRecipient[]): AudienceSnapshot {
  let designers = 0;
  let consumers = 0;
  let other = 0;

  for (const recipient of recipients) {
    const role = (recipient.role ?? '').toLowerCase();
    if (role === 'designer') {
      designers++;
    } else if (role === 'consumer') {
      consumers++;
    } else {
      other++;
    }
  }

  return {
    recipients: [...recipients],
    total: recipients.length,
    snapshot_at: new Date().toISOString(),
    breakdown: {
      designers,
      consumers,
      other,
    },
  };
}
