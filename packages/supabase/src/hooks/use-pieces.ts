/**
 * The pieces primitives (US-21 W2, CONTRACT §3.2): room placements (00734),
 * batch needs and build fields (00730), restore (00731) and labor lines
 * (00732). Every write is a SECURITY DEFINER RPC; each one invalidates the
 * FF&E caches (invalidateFfeCaches) plus its own key.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddLaborLineRequest,
  BatchCreateNamedProjectNeedsRequest,
  FfeRoomPlacement,
  SetFfeLineBuildFieldsRequest,
  SetLinePlacementsResult,
} from '@patina/types';
import { createBrowserClient } from '../client';
import type { Database } from '../database.types';
import { invalidateFfeCaches } from './use-procurement';

const getSupabase = () => createBrowserClient();

type ProjectFfeItemRow = Database['public']['Tables']['project_ffe_items']['Row'];

export const projectRoomPlacementsKey = (projectId: string | null) =>
  ['project-room-placements', projectId] as const;

export const projectFfeRemovedKey = (projectId: string) =>
  ['project-ffe-removed', projectId] as const;

// ─── Room placements (00734) ─────────────────────────────────────────────────

interface ProjectFfePlacementRow {
  id: string;
  ffe_item_id: string;
  project_room_id: string;
  quantity: number;
  area_note: string | null;
  sort_order: number;
}

/** Every room placement on the project's lines, in each line's sort order. */
export function useProjectRoomPlacements(projectId: string | null) {
  return useQuery({
    queryKey: projectRoomPlacementsKey(projectId),
    queryFn: async (): Promise<FfeRoomPlacement[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any)
        .from('project_ffe_placements')
        .select('id, ffe_item_id, project_room_id, quantity, area_note, sort_order')
        .eq('project_id', projectId)
        .order('ffe_item_id', { ascending: true })
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as ProjectFfePlacementRow[]).map((row) => ({
        id: row.id,
        ffeItemId: row.ffe_item_id,
        projectRoomId: row.project_room_id,
        quantity: row.quantity,
        areaNote: row.area_note,
        sortOrder: row.sort_order,
      }));
    },
    enabled: !!projectId,
  });
}

export interface SetLinePlacementsInput {
  projectId: string;
  itemId: string;
  /** Replaces the line's set; the first room becomes the primary. */
  placements: Array<{ roomId: string; quantity: number; areaNote?: string | null }>;
}

interface SetLinePlacementsRpcResult {
  placements: Array<{
    placementId: string;
    roomId: string;
    quantity: number;
    areaNote: string | null;
    sortOrder: number;
  }>;
  wasteQuantity: number;
}

export function useSetLinePlacements() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, placements }: SetLinePlacementsInput): Promise<SetLinePlacementsResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('set_line_placements', {
        p_ffe_item_id: itemId,
        p_placements: placements,
      });
      if (error) throw error;
      const result = data as SetLinePlacementsRpcResult;
      return {
        placements: (result.placements ?? []).map((p) => ({
          id: p.placementId,
          ffeItemId: itemId,
          projectRoomId: p.roomId,
          quantity: p.quantity,
          areaNote: p.areaNote,
          sortOrder: p.sortOrder,
        })),
        wasteQuantity: result.wasteQuantity,
      };
    },
    onSuccess: (_result, { projectId }) => {
      invalidateFfeCaches(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: projectRoomPlacementsKey(projectId) });
    },
  });
}

// ─── Needs and build fields (00730) ──────────────────────────────────────────

export function useBatchCreateNamedProjectNeeds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: BatchCreateNamedProjectNeedsRequest): Promise<{ selectionIds: string[] }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('batch_create_named_project_needs', {
        p_request: request,
      });
      if (error) throw error;
      return data as { selectionIds: string[] };
    },
    onSuccess: (_result, { projectId }) => invalidateFfeCaches(queryClient, projectId),
  });
}

export type SetFfeLineBuildFieldsInput = { projectId: string; itemId: string } & SetFfeLineBuildFieldsRequest;

export function useSetFfeLineBuildFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId: _projectId, itemId, ...fields }: SetFfeLineBuildFieldsInput): Promise<ProjectFfeItemRow> => {
      // The RPC writes only the keys present. JSON drops an undefined field;
      // `roughCents: null` is sent and clears the rough.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('set_project_ffe_line_build_fields', {
        p_item_id: itemId,
        p_request: fields,
      });
      if (error) throw error;
      return data as ProjectFfeItemRow;
    },
    onSuccess: (_result, { projectId }) => invalidateFfeCaches(queryClient, projectId),
  });
}

// ─── Removed lines and restore (00731) ───────────────────────────────────────

/** The project's removed lines, most recently removed first. */
export function useRemovedProjectLines(projectId: string) {
  return useQuery({
    queryKey: projectFfeRemovedKey(projectId),
    queryFn: async (): Promise<ProjectFfeItemRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any)
        .from('project_ffe_items')
        .select('*')
        .eq('project_id', projectId)
        .not('removed_at', 'is', null)
        .order('removed_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectFfeItemRow[];
    },
    enabled: !!projectId,
  });
}

export function useRestoreProjectSelection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ selectionId }: { projectId: string; selectionId: string }): Promise<{ selectionId: string; restored: true }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('restore_project_selection', {
        p_ffe_item_id: selectionId,
      });
      if (error) throw error;
      return data as { selectionId: string; restored: true };
    },
    onSuccess: (_result, { projectId }) => {
      invalidateFfeCaches(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: projectFfeRemovedKey(projectId) });
    },
  });
}

// ─── Labor lines (00732) ─────────────────────────────────────────────────────

export type AddLaborLineInput = { projectId: string; parentItemId: string } & AddLaborLineRequest;

export function useAddLaborLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId: _projectId, parentItemId, ...request }: AddLaborLineInput): Promise<{ selectionId: string }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('add_labor_line', {
        p_parent_ffe_item_id: parentItemId,
        p_request: request,
      });
      if (error) throw error;
      return data as { selectionId: string };
    },
    onSuccess: (_result, { projectId }) => invalidateFfeCaches(queryClient, projectId),
  });
}
