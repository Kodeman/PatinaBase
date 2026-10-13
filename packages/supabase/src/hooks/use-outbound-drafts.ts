import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Database } from '../database.types';
import type { Json } from '../database.types';

type OutboundDraft = Database['public']['Tables']['outbound_drafts']['Row'];
type OutboundMode = Database['public']['Tables']['studio_outbound_modes']['Row'];
export const outboundDraftKeys = {
  all: ['outbound-drafts'] as const,
  list: (projectId?: string) => ['outbound-drafts', projectId ?? 'all'] as const,
  modes: (studioId?: string) => ['outbound-drafts', 'modes', studioId ?? 'all'] as const,
};
const invalidate = (client: ReturnType<typeof useQueryClient>) => {
  client.invalidateQueries({ queryKey: outboundDraftKeys.all });
};

export function useOutboundDrafts(options: { projectId?: string | null } = {}) {
  const projectId = options.projectId ?? undefined;
  return useQuery({
    queryKey: outboundDraftKeys.list(projectId),
    queryFn: async (): Promise<OutboundDraft[]> => {
      let query = createBrowserClient().from('outbound_drafts').select('*');
      if (projectId) query = query.eq('project_id', projectId);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OutboundDraft[];
    },
  });
}

export function useUpdateOutboundDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; subject: string; body: string }): Promise<OutboundDraft> => {
      const { data, error } = await createBrowserClient().rpc('update_outbound_draft', {
        p_id: input.id, p_subject: input.subject, p_body: input.body,
      });
      if (error) throw error;
      return data as OutboundDraft;
    },
    onSuccess: () => invalidate(client),
  });
}

export function useDiscardOutboundDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<OutboundDraft> => {
      const { data, error } = await createBrowserClient().rpc('discard_outbound_draft', { p_id: id });
      if (error) throw error;
      return data as OutboundDraft;
    },
    onSuccess: () => invalidate(client),
  });
}

export function useSendOutboundDrafts() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (draftIds: string[]): Promise<{ results: Array<{ id: string; ok: boolean; error?: string }> }> => {
      const { data, error } = await createBrowserClient().functions.invoke('outbound-draft-send', { body: { draftIds } });
      if (error) throw error;
      return data as { results: Array<{ id: string; ok: boolean; error?: string }> };
    },
    onSettled: () => invalidate(client),
  });
}

export function useStudioOutboundModes(studioId?: string | null) {
  return useQuery({
    queryKey: outboundDraftKeys.modes(studioId ?? undefined),
    queryFn: async (): Promise<OutboundMode[]> => {
      let query = createBrowserClient().from('studio_outbound_modes').select('*');
      if (studioId) query = query.eq('studio_id', studioId);
      const { data, error } = await query.order('kind');
      if (error) throw error;
      return (data ?? []) as OutboundMode[];
    },
    enabled: !!studioId,
  });
}

export function useSetStudioOutboundMode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { studioId: string; kind: OutboundDraft['kind']; mode: 'review' | 'scheduled' }): Promise<Json> => {
      const { data, error } = await createBrowserClient().rpc('set_studio_outbound_mode', {
        p_studio: input.studioId, p_kind: input.kind, p_mode: input.mode,
      });
      if (error) throw error;
      return data as Json;
    },
    onSuccess: (_, input) => {
      invalidate(client);
      client.invalidateQueries({ queryKey: outboundDraftKeys.modes(input.studioId) });
    },
  });
}
