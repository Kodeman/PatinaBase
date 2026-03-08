import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// WAITLIST HOOKS
// Admin-facing queries for waitlist management + public insert
// ═══════════════════════════════════════════════════════════════════════════

// Lazy client getter
const getSupabase = () => createBrowserClient();

// Type-safe table accessor for waitlist
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getWaitlistTable = () => (getSupabase() as any).from('waitlist');

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface WaitlistEntry {
  id: string;
  email: string;
  source: string;
  role: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrer: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  signupPage: string | null;
  ctaText: string | null;
  posthogDistinctId: string | null;
  firstTouchAttribution: Record<string, unknown> | null;
  lastTouchAttribution: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  convertedAt: string | null;
  authUserId: string | null;
}

export interface WaitlistFilters {
  source?: string;
  role?: string;
  converted?: boolean;
  limit?: number;
}

export interface WaitlistStats {
  total: number;
  bySource: Record<string, number>;
  byRole: Record<string, number>;
  converted: number;
  unconverted: number;
}

export interface WaitlistInsertInput {
  email: string;
  source: string;
  role?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
  signupPage?: string;
  ctaText?: string;
  posthogDistinctId?: string;
  firstTouchAttribution?: Record<string, unknown>;
  lastTouchAttribution?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Map snake_case DB row to camelCase
// ═══════════════════════════════════════════════════════════════════════════

function mapWaitlistRow(row: Record<string, unknown>): WaitlistEntry {
  return {
    id: row.id as string,
    email: row.email as string,
    source: row.source as string,
    role: row.role as string,
    utmSource: row.utm_source as string | null,
    utmMedium: row.utm_medium as string | null,
    utmCampaign: row.utm_campaign as string | null,
    utmContent: row.utm_content as string | null,
    utmTerm: row.utm_term as string | null,
    referrer: row.referrer as string | null,
    userAgent: row.user_agent as string | null,
    ipAddress: row.ip_address as string | null,
    signupPage: row.signup_page as string | null,
    ctaText: row.cta_text as string | null,
    posthogDistinctId: row.posthog_distinct_id as string | null,
    firstTouchAttribution: row.first_touch_attribution as Record<string, unknown> | null,
    lastTouchAttribution: row.last_touch_attribution as Record<string, unknown> | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    convertedAt: row.converted_at as string | null,
    authUserId: row.auth_user_id as string | null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS (admin-facing)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List waitlist entries with optional filters (admin only)
 */
export function useWaitlistEntries(filters?: WaitlistFilters) {
  return useQuery({
    queryKey: ['waitlist-entries', filters],
    queryFn: async () => {
      let query = getWaitlistTable()
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.source) {
        query = query.eq('source', filters.source);
      }
      if (filters?.role) {
        query = query.eq('role', filters.role);
      }
      if (filters?.converted === true) {
        query = query.not('converted_at', 'is', null);
      } else if (filters?.converted === false) {
        query = query.is('converted_at', null);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      } else {
        query = query.limit(100);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(mapWaitlistRow);
    },
  });
}

/**
 * Get aggregated waitlist stats (admin only)
 */
export function useWaitlistStats() {
  return useQuery({
    queryKey: ['waitlist-stats'],
    queryFn: async () => {
      const { data, error } = await getWaitlistTable().select('source, role, converted_at');

      if (error) throw error;

      const rows = data || [];
      const stats: WaitlistStats = {
        total: rows.length,
        bySource: {},
        byRole: {},
        converted: 0,
        unconverted: 0,
      };

      for (const row of rows) {
        const source = (row as Record<string, unknown>).source as string;
        const role = (row as Record<string, unknown>).role as string;
        const converted = (row as Record<string, unknown>).converted_at !== null;

        stats.bySource[source] = (stats.bySource[source] || 0) + 1;
        stats.byRole[role] = (stats.byRole[role] || 0) + 1;

        if (converted) {
          stats.converted++;
        } else {
          stats.unconverted++;
        }
      }

      return stats;
    },
  });
}

/**
 * Look up a single waitlist entry by email
 */
export function useWaitlistEntry(email: string | undefined) {
  return useQuery({
    queryKey: ['waitlist-entry', email],
    queryFn: async () => {
      if (!email) throw new Error('Email required');

      const { data, error } = await getWaitlistTable()
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return mapWaitlistRow(data as Record<string, unknown>);
    },
    enabled: !!email,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Insert a new waitlist entry (for signup forms)
 */
export function useInsertWaitlistEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: WaitlistInsertInput) => {
      const { data, error } = await getWaitlistTable()
        .insert({
          email: input.email,
          source: input.source,
          role: input.role || 'unknown',
          utm_source: input.utmSource,
          utm_medium: input.utmMedium,
          utm_campaign: input.utmCampaign,
          utm_content: input.utmContent,
          utm_term: input.utmTerm,
          referrer: input.referrer,
          user_agent: input.userAgent,
          ip_address: input.ipAddress,
          signup_page: input.signupPage,
          cta_text: input.ctaText,
          posthog_distinct_id: input.posthogDistinctId,
          first_touch_attribution: input.firstTouchAttribution,
          last_touch_attribution: input.lastTouchAttribution,
        })
        .select()
        .single();

      if (error) throw error;

      return mapWaitlistRow(data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist-entries'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist-stats'] });
    },
  });
}
