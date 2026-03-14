import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@supabase/ssr';
import type { Campaign, CampaignAnalytics } from '@patina/shared/types';

const getSupabase = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

type CampaignWithAnalytics = Campaign & {
  campaign_analytics: CampaignAnalytics | null;
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * List campaigns, optionally filtered by status.
 */
export function useCampaigns(status?: string) {
  return useQuery<CampaignWithAnalytics[]>({
    queryKey: ['campaigns', status],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const url = status
        ? `/api/campaigns?status=${status}`
        : '/api/campaigns';
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
  });
}

/**
 * Get a single campaign with analytics.
 */
export function useCampaign(id: string | null) {
  return useQuery<CampaignWithAnalytics>({
    queryKey: ['campaigns', id],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/campaigns/${id}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch campaign');
      return res.json();
    },
    enabled: !!id,
  });
}

/**
 * Create a new campaign.
 */
export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      subject: string;
      template_id: string;
      audience_type: string;
      preview_text?: string;
      template_data?: Record<string, unknown>;
      audience_segment?: Record<string, unknown>;
      scheduled_for?: string;
    }) => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create campaign');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

/**
 * Update a campaign.
 */
export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update campaign');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', variables.id] });
    },
  });
}

/**
 * Send a campaign (trigger dispatch).
 */
export function useSendCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/campaigns/${id}/send`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to send campaign');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

/**
 * Archive a campaign (sent, cancelled, or draft).
 */
export function useArchiveCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to archive campaign');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

/**
 * Delete a draft campaign (hard delete).
 */
export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete campaign');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

/**
 * Cancel a scheduled campaign.
 */
export function useCancelCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to cancel campaign');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}
