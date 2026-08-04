'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardOwnerRef, MoodBoardItemSnapshot, MoodBoardSection } from '@patina/types';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

export interface BoardTemplate {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  kind: 'seeded' | 'studio';
  studio_id: string | null;
  canvas_width: number;
  canvas_height: number;
  background_color: string;
  sections: MoodBoardSection[];
  items: MoodBoardItemSnapshot[];
  cover_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Patina starters plus templates belonging to the selected design studio. */
export function useBoardTemplates(studioId: string | null | undefined) {
  return useQuery({
    queryKey: ['board-templates', studioId ?? null],
    enabled: studioId !== undefined,
    queryFn: async (): Promise<BoardTemplate[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      let query = supabase
        .from('board_templates')
        .select(
          'id, template_key, name, description, kind, studio_id, canvas_width, canvas_height, background_color, sections, items, cover_url, created_by, created_at, updated_at',
        );
      query = studioId
        ? query.or(`kind.eq.seeded,studio_id.eq.${studioId}`)
        : query.eq('kind', 'seeded');
      const { data, error } = await query
        .order('kind', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BoardTemplate[];
    },
  });
}

export function useSaveBoardAsTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      boardId: string;
      studioId: string;
      name: string;
      description?: string | null;
    }): Promise<BoardTemplate> => {
      if (!input.name.trim()) throw new Error('Template name is required.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('save_board_as_template', {
        p_board_id: input.boardId,
        p_studio_id: input.studioId,
        p_name: input.name.trim(),
        p_description: input.description?.trim() || null,
      });
      if (error) throw error;
      return data as BoardTemplate;
    },
    onSuccess: (_template, input) => {
      queryClient.invalidateQueries({ queryKey: ['board-templates', input.studioId] });
    },
  });
}

export function useMaterializeBoardTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      templateId: string;
      owner: BoardOwnerRef;
      name?: string | null;
      scopeRoomId?: string | null;
    }): Promise<string> => {
      if (input.owner.kind === 'project' && input.scopeRoomId) {
        throw new Error('Project boards cannot target a proposal room.');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('materialize_board_template', {
        p_template_id: input.templateId,
        p_proposal_id: input.owner.kind === 'proposal' ? input.owner.id : null,
        p_project_id: input.owner.kind === 'project' ? input.owner.id : null,
        p_name: input.name?.trim() || null,
        p_scope_room_id: input.scopeRoomId ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (boardId, input) => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      if (input.owner.kind === 'proposal') {
        queryClient.invalidateQueries({ queryKey: ['boards', input.owner.id] });
        queryClient.invalidateQueries({ queryKey: ['boards-with-items', input.owner.id] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['project-owned-boards', input.owner.id] });
      }
    },
  });
}

export function useRenameBoardTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      templateId: string;
      studioId: string;
      name: string;
      description?: string | null;
    }): Promise<void> => {
      if (!input.name.trim()) throw new Error('Template name is required.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('board_templates')
        .update({
          name: input.name.trim(),
          description: input.description?.trim() || null,
        })
        .eq('id', input.templateId)
        .eq('kind', 'studio');
      if (error) throw error;
    },
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: ['board-templates', input.studioId] });
    },
  });
}

export function useDeleteBoardTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { templateId: string; studioId: string }): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('board_templates')
        .delete()
        .eq('id', input.templateId)
        .eq('kind', 'studio');
      if (error) throw error;
    },
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: ['board-templates', input.studioId] });
    },
  });
}
