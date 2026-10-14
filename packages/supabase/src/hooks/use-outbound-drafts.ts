import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { docKeys } from '../query-keys';
import { useOptimisticMutation } from './optimistic';
import type { Database } from '../database.types';
import type { Json } from '../database.types';

type OutboundDraft = Database['public']['Tables']['outbound_drafts']['Row'];
type OutboundMode = Database['public']['Tables']['studio_outbound_modes']['Row'];
export const outboundDraftKeys = {
  all: ['outbound-drafts'] as const,
  list: (projectId?: string, organizationId?: string) => ['outbound-drafts', projectId ?? 'all', organizationId ?? 'all'] as const,
  modes: (studioId?: string) => ['outbound-drafts', 'modes', studioId ?? 'all'] as const,
};
const invalidate = (client: ReturnType<typeof useQueryClient>) => {
  client.invalidateQueries({ queryKey: outboundDraftKeys.all });
};

export function useOutboundDrafts(options: { projectId?: string | null; organizationId?: string | null } = {}) {
  const projectId = options.projectId ?? undefined;
  const organizationId = options.organizationId ?? undefined;
  return useQuery({
    queryKey: outboundDraftKeys.list(projectId, organizationId),
    queryFn: async (): Promise<OutboundDraft[]> => {
      let query = createBrowserClient().from('outbound_drafts').select('*');
      if (projectId) query = query.eq('project_id', projectId);
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OutboundDraft[];
    },
  });
}

type DraftText = { id: string; subject: string; body: string };
const NO_DRAFT_EDITS: DraftText[] = [];
const isDraftList = (key: readonly unknown[]) => key[0] === outboundDraftKeys.all[0] && key[1] !== 'modes';

/**
 * Saves a draft's TEXT only (never a send or a discard, plan §5.2). With
 * `optimistic` (US-34 N3, flag `optimistic-ink`) every cached drafts list
 * shows the new text at once; the RPC's row is the receipt, and a refusal puts
 * back only this draft's old text, unless a later edit has replaced it.
 */
export function useUpdateOutboundDraft(options: { optimistic?: boolean } = {}) {
  const client = useQueryClient();
  const plain = useMutation({
    mutationFn: async (input: DraftText): Promise<OutboundDraft> => {
      const { data, error } = await createBrowserClient().rpc('update_outbound_draft', {
        p_id: input.id, p_subject: input.subject, p_body: input.body,
      });
      if (error) throw error;
      return data as OutboundDraft;
    },
    onSuccess: () => invalidate(client),
  });
  const keys = options.optimistic
    ? client.getQueryCache().findAll({ queryKey: outboundDraftKeys.all }).map((q) => q.queryKey).filter(isDraftList)
    : [];
  const ink = useOptimisticMutation<DraftText, OutboundDraft | null, OutboundDraft[]>({
    honesty: 'internal',
    scopeId: 'outbound-draft-text',
    keys,
    meta: { errorSurface: 'inline' },
    mutationFn: async (input) => {
      const { data, error } = await createBrowserClient().rpc('update_outbound_draft', {
        p_id: input.id, p_subject: input.subject, p_body: input.body,
      });
      if (error) throw error;
      return (data ?? null) as OutboundDraft | null;
    },
    apply: (drafts, input) =>
      drafts.map((d) => (d.id === input.id ? { ...d, subject: input.subject, body: input.body } : d)),
    invert: (drafts, input, { previous }) => {
      const before = previous.find((d) => d.id === input.id);
      if (!before) return drafts;
      return drafts.map((d) =>
        d.id === input.id && d.subject === input.subject && d.body === input.body
          ? { ...d, subject: before.subject, body: before.body }
          : d,
      );
    },
    merge: (drafts, row) => drafts.map((d) => (d.id === row.id ? row : d)),
    // The receipt is merged; the lists are only marked stale, so a refetch
    // never lands over another draft's edit still in flight.
    onSuccess: () => client.invalidateQueries({ queryKey: outboundDraftKeys.all, refetchType: 'none' }),
  });
  return options.optimistic ? ink : { ...plain, pending: NO_DRAFT_EDITS };
}

export function useDiscardOutboundDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<OutboundDraft> => {
      const { data, error } = await createBrowserClient().rpc('discard_outbound_draft', { p_id: id });
      if (error) throw error;
      return data as OutboundDraft;
    },
    onSuccess: () => {
      invalidate(client);
      client.invalidateQueries({ queryKey: docKeys.desk() });
    },
  });
}

export function useSendOutboundDrafts() {
  const client = useQueryClient();
  return useMutation({
    meta: { act: 'send' },
    retry: false,
    mutationFn: async (draftIds: string[]): Promise<{ results: Array<{ id: string; ok: boolean; error?: string }> }> => {
      const { data, error } = await createBrowserClient().functions.invoke('outbound-draft-send', { body: { draftIds } });
      if (error) throw error;
      return data as { results: Array<{ id: string; ok: boolean; error?: string }> };
    },
    onSettled: () => {
      invalidate(client);
      client.invalidateQueries({ queryKey: docKeys.desk() });
    },
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
