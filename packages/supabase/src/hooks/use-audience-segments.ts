import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@supabase/ssr';
import type { AudienceSegment, SegmentRules } from '@patina/shared/types';

const getSupabase = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export function useAudienceSegments() {
  return useQuery<AudienceSegment[]>({
    queryKey: ['audience-segments'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('audience_segments')
        .select('*')
        .order('is_preset', { ascending: false })
        .order('name');
      if (error) throw error;
      return data as AudienceSegment[];
    },
  });
}

export function useAudienceSegment(id: string | null) {
  return useQuery<AudienceSegment>({
    queryKey: ['audience-segment', id],
    queryFn: async () => {
      if (!id) throw new Error('No segment ID');
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('audience_segments')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as AudienceSegment;
    },
    enabled: !!id,
  });
}

export function useCreateAudienceSegment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; description?: string; rules: SegmentRules }) => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/comms/audiences', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to create segment');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audience-segments'] });
    },
  });
}

export function useUpdateAudienceSegment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name?: string; description?: string; rules?: SegmentRules }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/audiences/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to update segment');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['audience-segments'] });
      queryClient.invalidateQueries({ queryKey: ['audience-segment', variables.id] });
    },
  });
}

export function useDeleteAudienceSegment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/audiences/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error('Failed to delete segment');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audience-segments'] });
    },
  });
}

export function useEstimateAudienceSize(rules: SegmentRules | null) {
  return useQuery<number>({
    queryKey: ['audience-estimate', rules],
    queryFn: async () => {
      if (!rules) return 0;
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/comms/audiences/estimate', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
      if (!res.ok) throw new Error('Failed to estimate audience');
      const data = await res.json();
      return data.count;
    },
    enabled: !!rules && (rules.conditions?.length ?? 0) > 0,
    staleTime: 10_000,
  });
}
