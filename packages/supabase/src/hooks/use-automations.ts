import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@supabase/ssr';
import type {
  AutomatedSequence,
  SequenceEnrollment,
  SequenceTriggerConfig,
  SequenceStep,
  SequenceStatus,
} from '@patina/shared/types';

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

/**
 * List all automated sequences with status, step counts, and performance.
 */
export function useAutomations() {
  return useQuery<AutomatedSequence[]>({
    queryKey: ['automations'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/comms/automations', { headers });
      if (!res.ok) throw new Error('Failed to fetch automations');
      return res.json();
    },
  });
}

/**
 * Get a single automation sequence detail.
 */
export function useAutomation(id: string | null) {
  return useQuery<AutomatedSequence>({
    queryKey: ['automation', id],
    queryFn: async () => {
      if (!id) throw new Error('No automation ID');
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/automations/${id}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch automation');
      return res.json();
    },
    enabled: !!id,
  });
}

/**
 * Create a new automation sequence.
 */
export function useCreateAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      trigger_config: SequenceTriggerConfig;
      steps_json?: SequenceStep[];
    }) => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/comms/automations', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create automation');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    },
  });
}

/**
 * Update an existing automation sequence.
 */
export function useUpdateAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      description?: string | null;
      trigger_config?: SequenceTriggerConfig;
      steps_json?: SequenceStep[];
      status?: SequenceStatus;
    }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/automations/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update automation');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['automation', variables.id] });
    },
  });
}

/**
 * Delete an automation sequence.
 */
export function useDeleteAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/automations/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete automation');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    },
  });
}

/**
 * Activate an automation (set status to 'active').
 */
export function useActivateAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/automations/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to activate automation');
      }
      return res.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['automation', id] });
    },
  });
}

/**
 * Pause an automation (set status to 'paused').
 */
export function usePauseAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/automations/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to pause automation');
      }
      return res.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['automation', id] });
    },
  });
}

/**
 * List enrollments for a specific sequence.
 */
export function useSequenceEnrollments(sequenceId: string | null) {
  return useQuery<SequenceEnrollment[]>({
    queryKey: ['sequence-enrollments', sequenceId],
    queryFn: async () => {
      if (!sequenceId) throw new Error('No sequence ID');
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/automations/${sequenceId}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch automation');
      const data = await res.json();
      return data.enrollments || [];
    },
    enabled: !!sequenceId,
  });
}
