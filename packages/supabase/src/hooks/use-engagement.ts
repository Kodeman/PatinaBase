import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// ENGAGEMENT TRACKING HOOKS
// Queries for engagement scores and events, plus event insertion
// ═══════════════════════════════════════════════════════════════════════════

// Lazy client getter
const getSupabase = () => createBrowserClient();

// Type-safe table accessors for tables not yet in generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getEngagementEventsTable = () => (getSupabase() as any).from('engagement_events');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getEngagementScoresView = () => (getSupabase() as any).from('user_engagement_scores');

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type AnalyticsPlatform = 'website' | 'extension' | 'portal' | 'ios' | 'planning';
export type EngagementTier = 'minimal' | 'low' | 'medium' | 'high';

export interface EngagementScore {
  id: string;
  email: string;
  role: string;
  currentScore: number;
  lastActiveAt: string | null;
  engagementTier: EngagementTier;
}

export interface EngagementEvent {
  id: string;
  userId: string;
  posthogEventId: string | null;
  eventName: string;
  eventProperties: Record<string, unknown> | null;
  platform: AnalyticsPlatform;
  createdAt: string;
}

export interface EngagementEventFilters {
  platform?: AnalyticsPlatform;
  eventName?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGAGEMENT SCORE HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get engagement score for a specific user
 */
export function useEngagementScore(userId: string | undefined) {
  return useQuery({
    queryKey: ['engagement-score', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User ID required');

      const { data, error } = await getEngagementScoresView()
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      return {
        id: data.id,
        email: data.email,
        role: data.role,
        currentScore: data.current_score,
        lastActiveAt: data.last_active_at,
        engagementTier: data.engagement_tier,
      } as EngagementScore;
    },
    enabled: !!userId,
  });
}

/**
 * Get engagement score for the current authenticated user
 */
export function useMyEngagementScore() {
  return useQuery({
    queryKey: ['my-engagement-score'],
    queryFn: async () => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await getEngagementScoresView()
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      return {
        id: data.id,
        email: data.email,
        role: data.role,
        currentScore: data.current_score,
        lastActiveAt: data.last_active_at,
        engagementTier: data.engagement_tier,
      } as EngagementScore;
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGAGEMENT EVENT HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get recent engagement events with optional filters
 */
export function useRecentEngagementEvents(filters?: EngagementEventFilters) {
  return useQuery({
    queryKey: ['engagement-events', filters],
    queryFn: async () => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let query = getEngagementEventsTable()
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (filters?.platform) {
        query = query.eq('platform', filters.platform);
      }
      if (filters?.eventName) {
        query = query.eq('event_name', filters.eventName);
      }
      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      } else {
        query = query.limit(50);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((event: Record<string, unknown>) => ({
        id: event.id,
        userId: event.user_id,
        posthogEventId: event.posthog_event_id,
        eventName: event.event_name,
        eventProperties: event.event_properties,
        platform: event.platform,
        createdAt: event.created_at,
      })) as EngagementEvent[];
    },
  });
}

/**
 * Track an engagement event (insert into engagement_events)
 */
export function useTrackEngagementEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      eventName: string;
      platform: AnalyticsPlatform;
      eventProperties?: Record<string, unknown>;
      posthogEventId?: string;
    }) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await getEngagementEventsTable()
        .insert({
          user_id: user.id,
          event_name: input.eventName,
          platform: input.platform,
          event_properties: input.eventProperties || null,
          posthog_event_id: input.posthogEventId || null,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        userId: data.user_id,
        posthogEventId: data.posthog_event_id,
        eventName: data.event_name,
        eventProperties: data.event_properties,
        platform: data.platform,
        createdAt: data.created_at,
      } as EngagementEvent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement-events'] });
      queryClient.invalidateQueries({ queryKey: ['my-engagement-score'] });
    },
  });
}
