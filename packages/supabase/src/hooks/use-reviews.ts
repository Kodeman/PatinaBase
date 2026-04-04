import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ClientReview {
  id: string;
  designer_client_id: string;
  project_id: string | null;
  rating: number | null;
  review_text: string | null;
  tags: string[];
  published_to_portfolio: boolean;
  referral_count: number;
  request_status: 'not_sent' | 'queued' | 'sent' | 'collected';
  request_sent_at: string | null;
  scheduled_for: string | null;
  custom_message: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  designer_client?: {
    id: string;
    client_name: string | null;
    client_email: string | null;
    total_revenue: number;
    status: string;
    client?: {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
    } | null;
  } | null;
  project?: {
    id: string;
    name: string | null;
  } | null;
}

export interface ReviewFilters {
  requestStatus?: string | string[];
  published?: boolean;
}

export interface ReviewStats {
  totalCollected: number;
  averageRating: number;
  pendingCount: number;
  queuedCount: number;
  publishedCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all reviews for the current designer
 */
export function useClientReviews(filters?: ReviewFilters) {
  return useQuery({
    queryKey: ['client-reviews', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from('client_reviews')
        .select(`
          *,
          designer_client:designer_clients!designer_client_id(
            id,
            client_name,
            client_email,
            total_revenue,
            status,
            client:profiles!client_id(
              id,
              full_name,
              avatar_url
            )
          ),
          project:projects!project_id(
            id,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (filters?.requestStatus) {
        if (Array.isArray(filters.requestStatus)) {
          query = query.in('request_status', filters.requestStatus);
        } else {
          query = query.eq('request_status', filters.requestStatus);
        }
      }

      if (filters?.published !== undefined) {
        query = query.eq('published_to_portfolio', filters.published);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as ClientReview[];
    },
  });
}

/**
 * Get review statistics
 */
export function useReviewStats() {
  return useQuery({
    queryKey: ['review-stats'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_reviews')
        .select('rating, request_status, published_to_portfolio');

      if (error) throw error;

      const reviews = data ?? [];
      const collected = reviews.filter((r: ClientReview) => r.request_status === 'collected');
      const ratings = collected.filter((r: ClientReview) => r.rating != null).map((r: ClientReview) => r.rating!);

      return {
        totalCollected: collected.length,
        averageRating: ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0,
        pendingCount: reviews.filter((r: ClientReview) => r.request_status === 'sent').length,
        queuedCount: reviews.filter((r: ClientReview) => r.request_status === 'queued').length,
        publishedCount: reviews.filter((r: ClientReview) => r.published_to_portfolio).length,
      } as ReviewStats;
    },
  });
}

/**
 * Create a review request for a client
 */
export function useCreateReviewRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      designerClientId,
      projectId,
      customMessage,
      scheduledFor,
    }: {
      designerClientId: string;
      projectId?: string;
      customMessage?: string;
      scheduledFor?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const requestStatus = scheduledFor ? 'queued' : 'sent';

      const { data, error } = await supabase
        .from('client_reviews')
        .insert({
          designer_client_id: designerClientId,
          project_id: projectId || null,
          custom_message: customMessage || null,
          request_status: requestStatus,
          request_sent_at: requestStatus === 'sent' ? new Date().toISOString() : null,
          scheduled_for: scheduledFor || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ClientReview;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
    },
  });
}

/**
 * Submit a review (client submits rating + text)
 */
export function useSubmitReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reviewId,
      rating,
      reviewText,
    }: {
      reviewId: string;
      rating: number;
      reviewText?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_reviews')
        .update({
          rating,
          review_text: reviewText || null,
          request_status: 'collected',
        })
        .eq('id', reviewId)
        .select()
        .single();

      if (error) throw error;
      return data as ClientReview;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
    },
  });
}

/**
 * Toggle whether a review is published to portfolio
 */
export function useTogglePortfolioPublish() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reviewId,
      published,
    }: {
      reviewId: string;
      published: boolean;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_reviews')
        .update({ published_to_portfolio: published })
        .eq('id', reviewId)
        .select()
        .single();

      if (error) throw error;
      return data as ClientReview;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
    },
  });
}
