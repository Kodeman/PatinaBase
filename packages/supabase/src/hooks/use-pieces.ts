/**
 * The pieces primitives (US-21 W2, CONTRACT §3.2): room placements (00734),
 * batch needs and build fields (00730), restore (00731) and labor lines
 * (00732; client price 00737). Also line groups (00751, W5) and catalog
 * merge (00753, W5). Every write is a SECURITY DEFINER RPC; each one
 * invalidates the FF&E caches (invalidateFfeCaches) plus its own key.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddLaborLineRequest,
  BatchCreateNamedProjectNeedsRequest,
  FfeRoomPlacement,
  MergeStudioProductResult,
  ProjectLineGroup,
  RoomFinish,
  RoomHandback,
  SetFfeLineBuildFieldsRequest,
  SetLineGroupResult,
  SetLinePlacementsResult,
} from '@patina/types';
import { createBrowserClient } from '../client';
import type { Database } from '../database.types';
import { invalidateFfeCaches } from './use-procurement';
import type { ProjectPalette } from './use-project-v2';

const getSupabase = () => createBrowserClient();

type ProjectFfeItemRow = Database['public']['Tables']['project_ffe_items']['Row'];

export const projectRoomPlacementsKey = (projectId: string | null) =>
  ['project-room-placements', projectId] as const;

export const projectFfeRemovedKey = (projectId: string) =>
  ['project-ffe-removed', projectId] as const;

export const projectRoomHandbacksKey = (projectId: string) =>
  ['project-room-handbacks', projectId] as const;

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
    mutationFn: async ({
      projectId: _projectId,
      parentItemId,
      unitPriceCents,
      ...request
    }: AddLaborLineInput): Promise<{ selectionId: string }> => {
      // The client price is its own argument (00737); p_request refuses unknown keys.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('add_labor_line', {
        p_parent_ffe_item_id: parentItemId,
        p_request: request,
        ...(unitPriceCents !== undefined ? { p_unit_price_cents: unitPriceCents } : {}),
      });
      if (error) throw error;
      return data as { selectionId: string };
    },
    onSuccess: (_result, { projectId }) => invalidateFfeCaches(queryClient, projectId),
  });
}

// ─── Line groups (00751, D6, Q9, W5) ─────────────────────────────────────────

export const projectLineGroupsKey = (projectId: string) =>
  ['project-line-groups', projectId] as const;

interface ProjectLineGroupRow {
  id: string;
  project_id: string;
  project_room_id: string | null;
  name: string;
  sort_order: number;
}

/** Group headings inside a room — the shower's components (00751, D6, Q9). */
export function useProjectLineGroups(projectId: string) {
  return useQuery({
    queryKey: projectLineGroupsKey(projectId),
    queryFn: async (): Promise<ProjectLineGroup[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any)
        .from('project_line_groups')
        .select('id, project_id, project_room_id, name, sort_order')
        .eq('project_id', projectId)
        .order('project_room_id', { ascending: true })
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as ProjectLineGroupRow[]).map((row) => ({
        id: row.id,
        projectId: row.project_id,
        projectRoomId: row.project_room_id,
        name: row.name,
        sortOrder: row.sort_order,
      }));
    },
    enabled: !!projectId,
  });
}

export type SetLineGroupInput = {
  projectId: string;
  itemIds: string[];
  /** `{groupId}` moves into an existing group; `{name, roomId}` creates one; `null` ungroups. */
  group: { groupId: string } | { name: string; roomId: string | null } | null;
};

/** Groups or ungroups lines under a heading inside one room (00751). */
export function useSetLineGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemIds, group }: SetLineGroupInput): Promise<SetLineGroupResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('set_line_group', {
        p_ffe_item_ids: itemIds,
        p_group: group,
      });
      if (error) throw error;
      return data as SetLineGroupResult;
    },
    onSuccess: (_result, { projectId }) => {
      invalidateFfeCaches(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: projectLineGroupsKey(projectId) });
    },
  });
}

// ─── Catalog merge (00753, D11, Q11, S5, W5) ─────────────────────────────────

/**
 * Merges a duplicate studio product into the one to keep (00753): re-points
 * schedule lines, boards and project product lists, never hard-deletes.
 * The lines a merge rewrites can span many projects, so there is no single
 * projectId to scope invalidateFfeCaches to — this sweeps the same prefixes
 * it targets, plus the products cache.
 */
export function useMergeStudioProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fromProductId,
      intoProductId,
    }: {
      fromProductId: string;
      intoProductId: string;
    }): Promise<MergeStudioProductResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('merge_studio_product', {
        p_from: fromProductId,
        p_into: intoProductId,
      });
      if (error) throw error;
      return data as MergeStudioProductResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['project-ffe-items'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-items'] });
      queryClient.invalidateQueries({ queryKey: ['project-ffe-readiness'] });
    },
  });
}

export interface SetLaborLinePriceInput {
  projectId: string;
  itemId: string;
  /** The client price per unit, whole cents; the line total follows quantity × price. */
  unitPriceCents: number;
}

export interface SetLaborLinePriceResult {
  selectionId: string;
  unitPriceCents: number;
  lineTotalCents: number;
}

/** Prices a labor line for the client (00737). Refused once the line is released. */
export function useSetLaborLinePrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, unitPriceCents }: SetLaborLinePriceInput): Promise<SetLaborLinePriceResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('set_labor_line_price', {
        p_ffe_item_id: itemId,
        p_unit_price_cents: unitPriceCents,
      });
      if (error) throw error;
      return data as SetLaborLinePriceResult;
    },
    onSuccess: (_result, { projectId }) => invalidateFfeCaches(queryClient, projectId),
  });
}

// ─── Room hand-backs (00742, W4) ─────────────────────────────────────────────

interface ProjectRoomHandbackRow {
  id: string;
  project_room_id: string;
  handed_back_by: string;
  handed_back_at: string;
}

/** READY FOR LEAH acts for the project's rooms, most recent first. */
export function useRoomHandbacks(projectId: string) {
  return useQuery({
    queryKey: projectRoomHandbacksKey(projectId),
    queryFn: async (): Promise<RoomHandback[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any)
        .from('project_room_handbacks')
        .select('id, project_room_id, handed_back_by, handed_back_at')
        .eq('project_id', projectId)
        .order('handed_back_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as ProjectRoomHandbackRow[]).map((row) => ({
        id: row.id,
        projectRoomId: row.project_room_id,
        handedBackBy: row.handed_back_by,
        handedBackAt: row.handed_back_at,
      }));
    },
    enabled: !!projectId,
  });
}

/**
 * READY FOR LEAH (00742, D18, Q13): records a hand-back act. Never touches
 * project_ffe_items — no disposition, no select, no release — so it
 * invalidates only its own key, never the ffe caches.
 */
export function useHandBackRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomId }: { projectId: string; roomId: string }): Promise<{ handedBackAt: string }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('hand_back_project_room', {
        p_project_room_id: roomId,
      });
      if (error) throw error;
      return data as { handedBackAt: string };
    },
    onSuccess: (_result, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectRoomHandbacksKey(projectId) });
    },
  });
}

// ─── Drafted release (00755, W4 review F-B1) ─────────────────────────────────

export const projectDraftReleaseKey = (projectId: string) =>
  ['project-draft-release', projectId] as const;

/** A furnishing authorization drafted and never sent. Its lines cannot be
 *  released again: send it, or void it with `void_furnishings_authorization`
 *  (which takes the proposal id). */
export interface DraftRelease {
  documentId: string;
  proposalId: string;
  itemIds: string[];
}

/** The job's newest unsent draft release (00755), or null when there is none. */
export function useDraftRelease(projectId: string) {
  return useQuery({
    queryKey: projectDraftReleaseKey(projectId),
    queryFn: async (): Promise<DraftRelease | null> => {
      const { data, error } = await getSupabase().rpc('draft_release_for_project', {
        p_project_id: projectId,
      });
      if (error) throw error;
      if (data == null) return null;
      const draft = data as unknown as Partial<DraftRelease>;
      return {
        documentId: String(draft.documentId),
        proposalId: String(draft.proposalId),
        itemIds: draft.itemIds ?? [],
      };
    },
    enabled: !!projectId,
  });
}

// ─── Allowance (00743, W4)───────────────────────────────────────────────────

/** Makes the line an allowance with a ceiling (00743); refused once released. */
export function useMakeFfeLineAllowance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      budgetMaxCents,
    }: {
      projectId: string;
      itemId: string;
      budgetMaxCents: number;
    }): Promise<ProjectFfeItemRow> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('make_ffe_line_allowance', {
        p_item_id: itemId,
        p_budget_max_cents: budgetMaxCents,
      });
      if (error) throw error;
      return data as ProjectFfeItemRow;
    },
    onSuccess: (_result, { projectId }) => invalidateFfeCaches(queryClient, projectId),
  });
}

// ─── Room finishes (00760, D16, Q10, W6) ─────────────────────────────────────

// Each write carries a room's whole list, so two in flight could land out of
// order and the older list would win. Writes go one after another instead.
// (A mutation `scope` would queue them too, but TanStack holds a queued
// mutation while the tab is hidden, so a write could wait unseen.)
let finishesWrite: Promise<unknown> = Promise.resolve();

/** A finish as the lens holds it, with the stored swatch it was read from. */
export interface RoomFinishEdit extends RoomFinish {
  /** The swatch as stored. Its keys the lens does not own (an older row's
   *  `role`, `name`, `paint_color_id`, anything else) are written back. */
  stored?: Readonly<Record<string, unknown>> | null;
}

export interface SetRoomFinishesVars {
  projectId: string;
  roomId: string;
  finishes: RoomFinishEdit[];
  /** Swatches the lens does not show (an older non-paint role): written back unchanged, after the finishes. */
  kept?: readonly unknown[];
  /** The room palette's name. A palette the lens creates is named `Finishes`. */
  name?: string | null;
}

async function writeRoomFinishes({
  projectId,
  roomId,
  finishes,
  kept = [],
  name,
}: SetRoomFinishesVars): Promise<ProjectPalette> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabase() as any)
    .from('project_palettes')
    .upsert(
      {
        project_id: projectId,
        scope_room_id: roomId,
        name: name || 'Finishes',
        swatches: [
          ...finishes.map((f, index) => ({
            ...f.stored,
            surface: f.surface,
            product: f.product,
            brand: f.brand,
            brand_code: f.brandCode,
            sheen: f.sheen,
            hex: f.hex,
            sort_order: index,
          })),
          ...kept,
        ],
      },
      { onConflict: 'project_id,scope_room_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as ProjectPalette;
}

/**
 * Writes a room's whole finish list: an upsert of the room's one
 * `project_palettes` row (00760 `project_palettes_one_per_room`) under the
 * studio's RLS. There is no RPC. Each finish is stored as a swatch element
 * `{surface, product, brand, brand_code, sheen, hex, sort_order}` over the
 * swatch it was read from, so an older row keeps its other keys; the
 * swatches the lens does not show follow unchanged. The row keeps its name,
 * or is named `Finishes`. Writes run one at a time, and the saved row goes
 * into the `useProjectPalettes` cache before it is refreshed. The lens shows
 * a failed write itself, so it never toasts (R83).
 */
export function useSetRoomFinishes() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorSurface: 'inline' as const },
    mutationFn: (vars: SetRoomFinishesVars) => {
      const write = () => writeRoomFinishes(vars);
      const run = finishesWrite.then(write, write);
      finishesWrite = run.catch(() => undefined);
      return run;
    },
    onSuccess: async (palette, { projectId }) => {
      const queryKey = ['project-palettes', projectId];
      // The saved row goes into the cache before the write settles, so the
      // lens never re-reads a list from before it (nor an older refetch).
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<ProjectPalette[]>(queryKey, (old) =>
        old
          ? old.some((p) => p.id === palette.id)
            ? old.map((p) => (p.id === palette.id ? palette : p))
            : [...old, palette]
          : old,
      );
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
