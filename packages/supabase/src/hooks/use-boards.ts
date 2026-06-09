import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

// ─── Types ────────────────────────────────────────────────────────────────────
// NOTE: generated database.types.ts lags migration 00179, so queries below use
// `as any` casts (same pattern as use-palettes.ts).

export type BoardItemType =
  | 'product'
  | 'capture'
  | 'image'
  | 'palette'
  | 'note'
  | 'room_scan';

export interface ProposalBoard {
  id: string;
  proposal_id: string;
  name: string;
  scope_room_id: string | null;
  cover_image_url: string | null;
  canvas_width: number;
  canvas_height: number;
  background_color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProposalBoardSummary extends ProposalBoard {
  item_count: number;
}

export interface ProposalBoardItem {
  id: string;
  board_id: string;
  type: BoardItemType;
  x: number;
  y: number;
  width: number;
  height: number | null;
  z_index: number;
  rotation: number;
  locked: boolean;
  product_id: string | null;
  capture_id: string | null;
  palette_id: string | null;
  image_url: string | null;
  content: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BoardWithItems extends ProposalBoard {
  items: ProposalBoardItem[];
}

/** Snapshot row carried onto an activated project (items embedded as JSONB). */
export interface ProjectBoard {
  id: string;
  project_id: string;
  source_board_id: string | null;
  name: string;
  project_room_id: string | null;
  cover_image_url: string | null;
  canvas_width: number;
  canvas_height: number;
  background_color: string;
  items: Array<Record<string, unknown>>;
  sort_order: number;
  created_at: string;
}

export interface UpsertBoardInput {
  proposalId: string;
  boardId?: string;
  name?: string;
  scopeRoomId?: string | null;
  coverImageUrl?: string | null;
  canvasWidth?: number;
  canvasHeight?: number;
  backgroundColor?: string;
  sortOrder?: number;
}

export interface AddBoardItemInput {
  boardId: string;
  type: BoardItemType;
  x?: number;
  y?: number;
  width?: number;
  height?: number | null;
  zIndex?: number;
  rotation?: number;
  locked?: boolean;
  productId?: string | null;
  captureId?: string | null;
  paletteId?: string | null;
  imageUrl?: string | null;
  content?: string | null;
  data?: Record<string, unknown>;
}

export interface UpdateBoardItemInput {
  itemId: string;
  boardId: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number | null;
  zIndex?: number;
  rotation?: number;
  locked?: boolean;
  imageUrl?: string | null;
  content?: string | null;
  data?: Record<string, unknown>;
}

export interface BoardLayoutPosition {
  id: string;
  x: number;
  y: number;
  z_index: number;
  rotation: number;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * All boards on a proposal (with item counts), ordered by sort_order then
 * created_at. RLS scopes rows to the proposal designer (or, for non-draft
 * proposals, the linked client).
 */
export function useBoards(proposalId: string | null | undefined) {
  return useQuery({
    queryKey: ['boards', proposalId ?? null],
    enabled: !!proposalId,
    queryFn: async (): Promise<ProposalBoardSummary[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_boards')
        .select('*, proposal_board_items(count)')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((row) => {
        const { proposal_board_items: counts, ...board } = row;
        return {
          ...board,
          item_count: counts?.[0]?.count ?? 0,
        } as ProposalBoardSummary;
      });
    },
  });
}

/**
 * A single board with its items inlined, ordered by z_index (bottom → top).
 */
export function useBoard(boardId: string | null | undefined) {
  return useQuery({
    queryKey: ['board', boardId ?? null],
    enabled: !!boardId,
    queryFn: async (): Promise<BoardWithItems | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_boards')
        .select('*, proposal_board_items(*)')
        .eq('id', boardId)
        .order('z_index', { ascending: true, referencedTable: 'proposal_board_items' })
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const { proposal_board_items: items, ...board } = data;
      return {
        ...(board as ProposalBoard),
        items: (items ?? []) as ProposalBoardItem[],
      };
    },
  });
}

/**
 * Create or update a board. If `boardId` is provided, the row is updated;
 * otherwise a new row is inserted (a `name` is then required).
 */
export function useUpsertBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertBoardInput): Promise<ProposalBoard> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      if (input.boardId) {
        // Update path — only set fields that were explicitly provided.
        const updates: Record<string, unknown> = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.scopeRoomId !== undefined) updates.scope_room_id = input.scopeRoomId;
        if (input.coverImageUrl !== undefined) updates.cover_image_url = input.coverImageUrl;
        if (input.canvasWidth !== undefined) updates.canvas_width = input.canvasWidth;
        if (input.canvasHeight !== undefined) updates.canvas_height = input.canvasHeight;
        if (input.backgroundColor !== undefined) updates.background_color = input.backgroundColor;
        if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder;

        const { data, error } = await supabase
          .from('proposal_boards')
          .update(updates)
          .eq('id', input.boardId)
          .select()
          .single();

        if (error) throw error;
        return data as ProposalBoard;
      }

      // Insert path.
      if (!input.name) throw new Error('Board name is required');

      const row = {
        proposal_id: input.proposalId,
        name: input.name,
        scope_room_id: input.scopeRoomId ?? null,
        cover_image_url: input.coverImageUrl ?? null,
        ...(input.canvasWidth !== undefined ? { canvas_width: input.canvasWidth } : {}),
        ...(input.canvasHeight !== undefined ? { canvas_height: input.canvasHeight } : {}),
        ...(input.backgroundColor !== undefined
          ? { background_color: input.backgroundColor }
          : {}),
        sort_order: input.sortOrder ?? 0,
      };

      const { data, error } = await supabase
        .from('proposal_boards')
        .insert(row)
        .select()
        .single();

      if (error) throw error;
      return data as ProposalBoard;
    },
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: ['boards', board.proposal_id] });
      queryClient.invalidateQueries({ queryKey: ['board', board.id] });
    },
  });
}

/**
 * Delete a board. ON DELETE CASCADE removes its items too.
 */
export function useDeleteBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      boardId,
      proposalId: _proposalId,
    }: {
      boardId: string;
      proposalId: string;
    }): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_boards').delete().eq('id', boardId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['boards', variables.proposalId] });
      queryClient.invalidateQueries({ queryKey: ['board', variables.boardId] });
    },
  });
}

/**
 * Add a single item to a board.
 */
export function useAddBoardItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddBoardItemInput): Promise<ProposalBoardItem> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const row = {
        board_id: input.boardId,
        type: input.type,
        x: input.x ?? 0,
        y: input.y ?? 0,
        ...(input.width !== undefined ? { width: input.width } : {}),
        height: input.height ?? null,
        z_index: input.zIndex ?? 0,
        rotation: input.rotation ?? 0,
        locked: input.locked ?? false,
        product_id: input.productId ?? null,
        capture_id: input.captureId ?? null,
        palette_id: input.paletteId ?? null,
        image_url: input.imageUrl ?? null,
        content: input.content ?? null,
        data: input.data ?? {},
      };

      const { data, error } = await supabase
        .from('proposal_board_items')
        .insert(row)
        .select()
        .single();

      if (error) throw error;
      return data as ProposalBoardItem;
    },
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ['board', item.board_id] });
      // Item counts on the list view — we don't know the proposal id from
      // the item row, so invalidate the broader prefix.
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
  });
}

/**
 * Update a single board item (position, stacking, content, …). Only fields
 * explicitly provided are written.
 */
export function useUpdateBoardItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateBoardItemInput): Promise<ProposalBoardItem> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const updates: Record<string, unknown> = {};
      if (input.x !== undefined) updates.x = input.x;
      if (input.y !== undefined) updates.y = input.y;
      if (input.width !== undefined) updates.width = input.width;
      if (input.height !== undefined) updates.height = input.height;
      if (input.zIndex !== undefined) updates.z_index = input.zIndex;
      if (input.rotation !== undefined) updates.rotation = input.rotation;
      if (input.locked !== undefined) updates.locked = input.locked;
      if (input.imageUrl !== undefined) updates.image_url = input.imageUrl;
      if (input.content !== undefined) updates.content = input.content;
      if (input.data !== undefined) updates.data = input.data;

      const { data, error } = await supabase
        .from('proposal_board_items')
        .update(updates)
        .eq('id', input.itemId)
        .select()
        .single();

      if (error) throw error;
      return data as ProposalBoardItem;
    },
    onSuccess: (_item, variables) => {
      queryClient.invalidateQueries({ queryKey: ['board', variables.boardId] });
    },
  });
}

/**
 * Delete a single board item.
 */
export function useDeleteBoardItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      boardId: _boardId,
    }: {
      itemId: string;
      boardId: string;
    }): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_board_items').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['board', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
  });
}

/**
 * Persist a full canvas layout in one round trip: a single batch upsert of
 * `{id, x, y, z_index, rotation}` rows (onConflict: id). All ids must be
 * existing items — RLS confines the write to boards on the designer's own
 * proposals, and the conflict-update path only touches the provided columns.
 */
export function useSaveBoardLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      boardId: _boardId,
      positions,
    }: {
      boardId: string;
      positions: BoardLayoutPosition[];
    }): Promise<void> => {
      if (positions.length === 0) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('proposal_board_items')
        .upsert(
          positions.map((p) => ({
            id: p.id,
            x: p.x,
            y: p.y,
            z_index: p.z_index,
            rotation: p.rotation,
          })),
          { onConflict: 'id' }
        );

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['board', variables.boardId] });
    },
  });
}

/**
 * Boards snapshotted onto an activated project (read-mostly; items are
 * embedded as JSONB — see migration 00179).
 */
export function useProjectBoards(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-boards', projectId ?? null],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectBoard[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_boards')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ProjectBoard[];
    },
  });
}
