/**
 * Rooms on the schedule (R25) — audit-first: project_rooms shipped in 00066
 * (name, budget_cents allocation, sort_order, committed/actual rollups) and
 * project_ffe_items.project_room_id already exists with activation lineage.
 * Nothing additive needed — the paper just starts rendering the truth.
 * Allocations feed the Account Page's by-room variance from the SAME rows.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

const getSupabase = () => createBrowserClient() as any;

export interface DocumentRoom {
  id: string;
  project_id: string;
  name: string;
  budget_cents: number;
  sort_order: number;
}

export function useDocumentRooms(projectId: string | null) {
  return useQuery<DocumentRoom[]>({
    queryKey: ['document-rooms', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('project_rooms')
        .select('id, project_id, name, budget_cents, sort_order')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocumentRoom[];
    },
  });
}

export function useAddDocumentRoom(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; budgetCents?: number | null }) => {
      const supabase = getSupabase();
      const { data: existing } = await supabase
        .from('project_rooms')
        .select('sort_order')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: false })
        .limit(1);
      const nextOrder = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;
      const { data, error } = await supabase
        .from('project_rooms')
        .insert({
          project_id: projectId,
          name: input.name,
          budget_cents: input.budgetCents ?? 0,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data as DocumentRoom;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['document-rooms', projectId] });
    },
  });
}

/** Assign a line to a room (from the unfold; drag lands here too). */
export function useAssignLineRoom(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, roomId }: { itemId: string; roomId: string | null }) => {
      const { error } = await getSupabase()
        .from('project_ffe_items')
        .update({ project_room_id: roomId })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (projectId) void qc.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
      void qc.invalidateQueries({ queryKey: ['document-rooms', projectId] });
    },
  });
}
