import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardOwnerRef } from '@patina/types';
import { createBrowserClient } from '../client';
import {
  invalidateProposalClientQueries,
  PROPOSAL_CLIENT_MUTATION_KEY,
} from '../lib/proposal-client-query-invalidation';

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

export type BoardStatus = 'active' | 'archived';

/** Legacy string inputs remain proposal-scoped for existing consumers. */
export type BoardOwnerInput = BoardOwnerRef | string | null | undefined;

export function normalizeBoardOwner(owner: BoardOwnerInput): BoardOwnerRef | null {
  if (!owner) return null;
  return typeof owner === 'string' ? { kind: 'proposal', id: owner } : owner;
}

export const boardOwnerQueryKeys = {
  list: (owner: BoardOwnerRef) =>
    owner.kind === 'proposal'
      ? (['boards', owner.id] as const)
      : (['project-owned-boards', owner.id] as const),
  withItems: (owner: BoardOwnerRef) =>
    owner.kind === 'proposal'
      ? (['boards-with-items', owner.id] as const)
      : (['project-owned-boards-with-items', owner.id] as const),
};

interface BoardOwnerMutationInput {
  owner?: BoardOwnerRef;
  proposalId?: string;
  projectId?: string;
}

function mutationOwner(input: BoardOwnerMutationInput): BoardOwnerRef | null {
  if (input.owner) return input.owner;
  if (input.projectId) return { kind: 'project', id: input.projectId };
  if (input.proposalId) return { kind: 'proposal', id: input.proposalId };
  return null;
}

/**
 * A named section on a board (00264). Persisted as an ordered array in
 * proposal_boards.sections — the same {id, name, color?} shape BoardCanvas's
 * `sections` prop accepts. Items belong to a section via a `section_id` key
 * inside each item's `data` JSONB (there is NO section_id column on
 * proposal_board_items). `color` is optional and may be omitted.
 */
export interface BoardSection {
  id: string;
  name: string;
  color?: string;
}

export interface ProposalBoard {
  id: string;
  /**
   * Owner leg — EXACTLY ONE of proposal_id / project_id is set (00272
   * chk_proposal_boards_owner). proposal_id for a proposal-stage board;
   * project_id for a live board "continued in the project" past signing (B8).
   */
  proposal_id: string | null;
  project_id: string | null;
  name: string;
  scope_room_id: string | null;
  cover_image_url: string | null;
  canvas_width: number;
  canvas_height: number;
  background_color: string;
  sort_order: number;
  // 00264. Older rows (pre-migration reads via `as any`) may lack these; the
  // hooks below coerce to safe defaults ([] / 'active') so consumers never
  // branch on undefined.
  sections: BoardSection[];
  status: BoardStatus;
  created_at: string;
  updated_at: string;
}

export interface ProposalBoardSummary extends ProposalBoard {
  item_count: number;
  /**
   * Effective thumbnail source when `cover_image_url` is unset: the image_url
   * of the lowest-z image item on the board, else null. Derived in useBoards
   * (the board list) so the chip can show cover → first-image → monogram
   * without a second fetch.
   */
  cover_fallback_url: string | null;
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

/**
 * One embedded item inside project_boards.items (JSONB). Written by the
 * activation RPC (migration 00180) via jsonb_build_object — note it carries
 * NO `id` or `locked` fields (renderers should key by array index), and the
 * array is pre-ordered by z_index then created_at.
 */
export interface ProjectBoardItem {
  type: BoardItemType;
  x: number;
  y: number;
  width: number;
  height: number | null;
  z_index: number;
  rotation: number;
  product_id: string | null;
  image_url: string | null;
  content: string | null;
  data: Record<string, unknown>;
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
  sections: BoardSection[];
  items: ProjectBoardItem[];
  sort_order: number;
  created_at: string;
}

export interface UpsertBoardInput {
  owner?: BoardOwnerRef;
  /**
   * Owner on the INSERT path — pass EXACTLY ONE of proposalId / projectId
   * (00272). On the UPDATE path (boardId set) the owner is immutable and
   * neither is needed. Kept optional so the project-owned surface (B8) can
   * pass projectId without a dummy proposalId.
   */
  proposalId?: string;
  projectId?: string;
  boardId?: string;
  name?: string;
  scopeRoomId?: string | null;
  coverImageUrl?: string | null;
  canvasWidth?: number;
  canvasHeight?: number;
  backgroundColor?: string;
  sortOrder?: number;
  sections?: BoardSection[];
  status?: BoardStatus;
}

export interface AddBoardItemInput {
  /** Stable id for delete undo/restoration; omitted for ordinary creates. */
  itemId?: string;
  boardId: string;
  owner?: BoardOwnerRef;
  proposalId?: string;
  projectId?: string;
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
  type?: BoardItemType;
  proposalId?: string;
  projectId?: string;
  owner?: BoardOwnerRef;
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

export interface BoardLayoutPosition {
  id: string;
  /**
   * Sent so the upsert's INSERT-path RLS WITH CHECK (which joins through
   * board_id to the designer's proposal) can evaluate — without it Postgres
   * rejects the whole statement even though every row takes the update path.
   */
  board_id: string;
  type: BoardItemType;
  x: number;
  y: number;
  width: number;
  height: number | null;
  z_index: number;
  rotation: number;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * All boards on a proposal (BOTH active and archived — the builder filters by
 * status client-side), ordered by sort_order then created_at. A compact item
 * projection (type/image_url/z_index only — no `data` JSONB) rides along to
 * derive item_count and the fallback cover in one round trip. RLS scopes rows
 * to the proposal designer (or, for non-draft proposals, the linked client).
 */
export function useBoards(ownerInput: BoardOwnerInput) {
  const owner = normalizeBoardOwner(ownerInput);
  return useQuery({
    queryKey: owner ? boardOwnerQueryKeys.list(owner) : ['boards', null],
    enabled: !!owner,
    queryFn: async (): Promise<ProposalBoardSummary[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_boards')
        .select('*, proposal_board_items(type, image_url, z_index)')
        .eq(owner!.kind === 'proposal' ? 'proposal_id' : 'project_id', owner!.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((row) => {
        const { proposal_board_items: items, ...board } = row;
        return summarizeBoard(board, (items ?? []) as BoardCoverItem[]);
      });
    },
  });
}

/** Minimal item projection useBoards pulls for count + cover derivation. */
interface BoardCoverItem {
  type: BoardItemType;
  image_url: string | null;
  z_index: number;
}

/**
 * Fold a board row + its compact items into a ProposalBoardSummary. The
 * fallback cover is the lowest-z image item's url (matching the bottom→top
 * render order); sections/status default defensively for pre-00264 rows. Pure
 * — exported for the unit test.
 */
export function summarizeBoard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  board: any,
  items: BoardCoverItem[],
): ProposalBoardSummary {
  const firstImage = items
    .filter((i) => i.type === 'image' && !!i.image_url)
    .sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0))[0];
  return {
    ...(board as ProposalBoard),
    // Owner legs default to null for pre-00272 reads via `as any`.
    proposal_id: (board?.proposal_id ?? null) as string | null,
    project_id: (board?.project_id ?? null) as string | null,
    sections: (board?.sections ?? []) as BoardSection[],
    status: (board?.status ?? 'active') as BoardStatus,
    item_count: items.length,
    cover_fallback_url: firstImage?.image_url ?? null,
  };
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
        proposal_id: board.proposal_id ?? null,
        project_id: board.project_id ?? null,
        sections: board.sections ?? [],
        status: board.status ?? 'active',
        items: (items ?? []) as ProposalBoardItem[],
      };
    },
  });
}

/**
 * Every ACTIVE board on a proposal WITH its items inlined, in one round trip —
 * boards ordered by (sort_order, created_at), items by z_index (bottom → top).
 * Powers the read-only document surfaces (client proposal, designer preview,
 * drafting mirror) that render the whole board section at once via the shared
 * BoardsBlock, rather than the editor's per-board `useBoard`. Archived boards
 * (00264) are excluded HERE so the client copy never shows one — this is the
 * single choke point every shared-render caller flows through. RLS scopes rows
 * to the proposal designer (or, for non-draft proposals, the linked client).
 */
export function useBoardsWithItems(ownerInput: BoardOwnerInput) {
  const owner = normalizeBoardOwner(ownerInput);
  return useQuery({
    queryKey: owner ? boardOwnerQueryKeys.withItems(owner) : ['boards-with-items', null],
    enabled: !!owner,
    queryFn: async (): Promise<BoardWithItems[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_boards')
        .select('*, proposal_board_items(*)')
        .eq(owner!.kind === 'proposal' ? 'proposal_id' : 'project_id', owner!.id)
        .eq('status', 'active')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .order('z_index', { ascending: true, referencedTable: 'proposal_board_items' });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((row) => {
        const { proposal_board_items: items, ...board } = row;
        return {
          ...(board as ProposalBoard),
          proposal_id: board.proposal_id ?? null,
          project_id: board.project_id ?? null,
          sections: board.sections ?? [],
          status: board.status ?? 'active',
          items: (items ?? []) as ProposalBoardItem[],
        };
      });
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
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
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
        if (input.sections !== undefined) updates.sections = input.sections;
        if (input.status !== undefined) updates.status = input.status;

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
      const owner = mutationOwner(input);
      if (!owner) {
        throw new Error('A board needs an owner (proposalId or projectId)');
      }

      const row = {
        // Exactly-one-of owner (00272). project_id path is the B8 project board.
        ...(owner.kind === 'project'
          ? { project_id: owner.id }
          : { proposal_id: owner.id }),
        name: input.name,
        scope_room_id: input.scopeRoomId ?? null,
        cover_image_url: input.coverImageUrl ?? null,
        ...(input.canvasWidth !== undefined ? { canvas_width: input.canvasWidth } : {}),
        ...(input.canvasHeight !== undefined ? { canvas_height: input.canvasHeight } : {}),
        ...(input.backgroundColor !== undefined
          ? { background_color: input.backgroundColor }
          : {}),
        sort_order: input.sortOrder ?? 0,
        ...(input.sections !== undefined ? { sections: input.sections } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      };

      const { data, error } = await supabase
        .from('proposal_boards')
        .insert(row)
        .select()
        .single();

      if (error) throw error;
      return data as ProposalBoard;
    },
    onSuccess: async (board) => {
      // Refresh whichever owner list the board belongs to (00272).
      const owner: BoardOwnerRef | null = board.project_id
        ? { kind: 'project', id: board.project_id }
        : board.proposal_id
          ? { kind: 'proposal', id: board.proposal_id }
          : null;
      if (owner) {
        queryClient.invalidateQueries({ queryKey: boardOwnerQueryKeys.list(owner) });
        queryClient.invalidateQueries({ queryKey: boardOwnerQueryKeys.withItems(owner) });
      }
      if (owner?.kind === 'proposal') {
        await invalidateProposalClientQueries(queryClient, owner.id);
      }
      queryClient.invalidateQueries({ queryKey: ['board', board.id] });
    },
  });
}

/**
 * Duplicate a board: copies the row (name + " (Copy)", same scope_room,
 * sections, dims, background, cover) and every item (fresh ids). The 00389 RPC
 * validates the complete proposal relationship graph and performs the board +
 * item copy in one transaction, so an item failure cannot leave a ghost board.
 * Lands at the end of the board order.
 */
export function useDuplicateBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async ({
      proposalId,
      boardId,
    }: {
      proposalId: string;
      boardId: string;
    }): Promise<ProposalBoard> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('duplicate_proposal_board', {
        p_proposal_id: proposalId,
        p_board_id: boardId,
      });
      if (error) throw error;
      return data as ProposalBoard;
    },
    // Reconcile every mounted client projection after either outcome. The RPC
    // is atomic; invalidating on failure still clears any optimistic/mounted
    // state without implying a partial database write exists.
    onSettled: async (_board, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['boards', variables.proposalId] });
      queryClient.invalidateQueries({
        queryKey: ['boards-with-items', variables.proposalId],
      });
      await invalidateProposalClientQueries(queryClient, variables.proposalId);
    },
  });
}

/**
 * Delete a board. ON DELETE CASCADE removes its items too.
 */
export function useDeleteBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async ({
      boardId,
      proposalId: _proposalId,
      projectId: _projectId,
      owner: _owner,
    }: {
      boardId: string;
      proposalId?: string;
      projectId?: string;
      owner?: BoardOwnerRef;
    }): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_boards').delete().eq('id', boardId);
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      const owner = mutationOwner(variables);
      if (owner) {
        queryClient.invalidateQueries({ queryKey: boardOwnerQueryKeys.list(owner) });
        queryClient.invalidateQueries({ queryKey: boardOwnerQueryKeys.withItems(owner) });
      } else {
        queryClient.invalidateQueries({ queryKey: ['boards'] });
        queryClient.invalidateQueries({ queryKey: ['project-owned-boards'] });
      }
      queryClient.invalidateQueries({ queryKey: ['board', variables.boardId] });
      if (owner?.kind === 'proposal') {
        await invalidateProposalClientQueries(queryClient, owner.id);
      }
    },
  });
}

/**
 * Add a single item to a board.
 */
export function useAddBoardItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async (input: AddBoardItemInput): Promise<ProposalBoardItem> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const row = {
        ...(input.itemId ? { id: input.itemId } : {}),
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
    onSuccess: async (item, variables) => {
      queryClient.invalidateQueries({ queryKey: ['board', item.board_id] });
      const owner = mutationOwner(variables);
      if (owner) {
        queryClient.invalidateQueries({ queryKey: boardOwnerQueryKeys.list(owner) });
        queryClient.invalidateQueries({ queryKey: boardOwnerQueryKeys.withItems(owner) });
      } else {
        // Legacy callers may not know the owner at the mutation boundary.
        queryClient.invalidateQueries({ queryKey: ['boards'] });
        queryClient.invalidateQueries({ queryKey: ['project-owned-boards'] });
      }
      if (owner?.kind === 'proposal') {
        await invalidateProposalClientQueries(queryClient, owner.id);
      }
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
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async (input: UpdateBoardItemInput): Promise<ProposalBoardItem> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const updates: Record<string, unknown> = {};
      if (input.type !== undefined) updates.type = input.type;
      if (input.x !== undefined) updates.x = input.x;
      if (input.y !== undefined) updates.y = input.y;
      if (input.width !== undefined) updates.width = input.width;
      if (input.height !== undefined) updates.height = input.height;
      if (input.zIndex !== undefined) updates.z_index = input.zIndex;
      if (input.rotation !== undefined) updates.rotation = input.rotation;
      if (input.locked !== undefined) updates.locked = input.locked;
      if (input.productId !== undefined) updates.product_id = input.productId;
      if (input.captureId !== undefined) updates.capture_id = input.captureId;
      if (input.paletteId !== undefined) updates.palette_id = input.paletteId;
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
    onSuccess: async (_item, variables) => {
      queryClient.invalidateQueries({ queryKey: ['board', variables.boardId] });
      const owner = mutationOwner(variables);
      if (owner) {
        queryClient.invalidateQueries({ queryKey: boardOwnerQueryKeys.withItems(owner) });
      }
      if (owner?.kind === 'proposal') {
        await invalidateProposalClientQueries(queryClient, owner.id);
      }
    },
  });
}

/**
 * Delete a single board item.
 */
export function useDeleteBoardItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async ({
      itemId,
      boardId: _boardId,
      proposalId: _proposalId,
      projectId: _projectId,
      owner: _owner,
    }: {
      itemId: string;
      boardId: string;
      proposalId?: string;
      projectId?: string;
      owner?: BoardOwnerRef;
    }): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_board_items').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['board', variables.boardId] });
      const owner = mutationOwner(variables);
      if (owner) {
        queryClient.invalidateQueries({ queryKey: boardOwnerQueryKeys.list(owner) });
        queryClient.invalidateQueries({ queryKey: boardOwnerQueryKeys.withItems(owner) });
      } else {
        queryClient.invalidateQueries({ queryKey: ['boards'] });
        queryClient.invalidateQueries({ queryKey: ['project-owned-boards'] });
      }
      if (owner?.kind === 'proposal') {
        await invalidateProposalClientQueries(queryClient, owner.id);
      }
    },
  });
}

/**
 * Persist a full canvas layout in one round trip: a single batch upsert of
 * `{id, board_id, type, x, y, z_index, rotation}` rows (onConflict: id). All
 * ids must be existing items, so every row takes the conflict-update path and
 * only the layout columns change. board_id/type ride along solely because
 * Postgres evaluates the INSERT-path RLS WITH CHECK (board → designer's
 * proposal) on the proposed row before resolving the conflict.
 */
export function useSaveBoardLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async ({
      boardId: _boardId,
      proposalId: _proposalId,
      projectId: _projectId,
      owner: _owner,
      positions,
    }: {
      boardId: string;
      proposalId?: string;
      projectId?: string;
      owner?: BoardOwnerRef;
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
            board_id: p.board_id,
            type: p.type,
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
            z_index: p.z_index,
            rotation: p.rotation,
          })),
          { onConflict: 'id' }
        );

      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['board', variables.boardId] });
      const owner = mutationOwner(variables);
      if (owner) {
        queryClient.invalidateQueries({ queryKey: boardOwnerQueryKeys.withItems(owner) });
      }
      if (owner?.kind === 'proposal') {
        await invalidateProposalClientQueries(queryClient, owner.id);
      }
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
      return ((data ?? []) as ProjectBoard[]).map((board) => ({
        ...board,
        sections: board.sections ?? [],
      }));
    },
  });
}

/**
 * LIVE, editable boards owned by an activated project (B8, 00272) — the boards
 * a designer has "continued in the project", NOT the frozen project_boards
 * snapshot. Same shape/derivation as useBoards, keyed on project_id. Powers the
 * project-surface boards builder. RLS scopes rows to the project designer (or,
 * read-only, the project client).
 */
export function useProjectOwnedBoards(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-owned-boards', projectId ?? null],
    enabled: !!projectId,
    queryFn: async (): Promise<ProposalBoardSummary[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_boards')
        .select('*, proposal_board_items(type, image_url, z_index)')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((row) => {
        const { proposal_board_items: items, ...board } = row;
        return summarizeBoard(board, (items ?? []) as BoardCoverItem[]);
      });
    },
  });
}

/**
 * "Continue this board in the project" (B8, 00273): clone a FROZEN
 * project_boards snapshot row into a LIVE, editable project-owned board (+
 * items), preserving sections. Returns the new board's id. The signed snapshot
 * stays untouched as the record.
 */
export function useContinueBoardInProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectBoardId,
      projectId: _projectId,
    }: {
      projectBoardId: string;
      /** Only used to scope invalidation. */
      projectId: string;
    }): Promise<string> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('continue_board_in_project', {
        p_project_board_id: projectBoardId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_newBoardId, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-owned-boards', variables.projectId] });
    },
  });
}
