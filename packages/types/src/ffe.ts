/**
 * FF&E (Furniture, Fixtures & Equipment) procurement lifecycle types.
 *
 * The 8 ordered stages match the `status` CHECK constraint on
 * `project_ffe_items` and are the canonical procurement lifecycle for
 * Patina FF&E items. They are referenced from:
 *   - apps/designer-portal — FFE Kanban board (per-project) and Procurement
 *     By Status view (cross-project)
 *   - help-system SurfaceKeys.DesignerPortal.Ffe.Stage.* — per-stage help copy
 *
 * Color/surface mapping lives per-view (see designer-portal FFE page and the
 * Procurement By Status view); only the key list and union type live here so
 * `@patina/types` stays free of UI / help-system dependencies.
 */

import type { MoodBoardItemSnapshot } from './mood-board';

/** The 8 ordered FF&E procurement stage keys. */
export type FFEStageKey =
  | 'specified'
  | 'quoted'
  | 'approved'
  | 'ordered'
  | 'production'
  | 'shipped'
  | 'delivered'
  | 'installed';

/**
 * Canonical ordered list of FF&E stage keys. Use this anywhere you need to
 * iterate stages in pipeline order (e.g., rendering a flow chart, summing
 * per-stage counts).
 */
export const FFE_STAGE_KEYS: readonly FFEStageKey[] = [
  'specified',
  'quoted',
  'approved',
  'ordered',
  'production',
  'shipped',
  'delivered',
  'installed',
] as const;

/** Studio-only state of a project selection. Procurement stays on FFEStageKey. */
export type FfeDesignDisposition =
  | 'candidate'
  | 'selected'
  | 'alternate'
  | 'not_selected'
  | 'superseded';

export type FfeAssignmentScope = 'room' | 'throughout' | 'unassigned';

export type FfeDuplicateMode = 'reuse' | 'create' | 'hold';

export type FfePlacementOutcome = 'created' | 'reused' | 'filled' | 'held';

/** `project_ffe_items.unit` (00729 CHECK project_ffe_items_unit_check). */
export type FfeLineUnit = 'each' | 'sq_ft' | 'lin_ft' | 'roll' | 'yard' | 'box' | 'hour' | 'lot';

/** `project_ffe_items.line_kind` (00729). Labor is created only by add_labor_line. */
export type FfeLineKind = 'goods' | 'labor';

/** `project_ffe_items.link_kind` (00729): set exactly when parent_ffe_item_id is. */
export type FfeLinkKind = 'com' | 'labor' | 'accessory';

/** The pre-order stage words (D1, Q3); `ffe_line_stage` (00736) computes the same. */
export type FfeLineStage = 'placeholder' | 'specced' | 'ready' | 'released';

/**
 * One room a line is placed in (`project_ffe_placements`, 00734). The line's
 * `project_room_id` stays its primary room. Named for the room: board x/y
 * placements and FfePlacementOutcome are a different thing.
 */
export interface FfeRoomPlacement {
  id: string;
  ffeItemId: string;
  projectRoomId: string;
  quantity: number;
  areaNote: string | null;
  sortOrder: number;
}

export interface SetLinePlacementsResult {
  placements: FfeRoomPlacement[];
  /** line quantity minus the placed sum. */
  wasteQuantity: number;
}

/** `batch_create_named_project_needs` (00730): 1–100 lines, all or nothing. */
export interface BatchCreateNamedProjectNeedsRequest {
  projectId: string;
  roomId: string | null;
  assignmentScope: FfeAssignmentScope;
  lines: Array<{ name: string; quantity?: number; unit?: FfeLineUnit; roughCents?: number | null }>;
  idempotencyKey: string;
}

/**
 * `set_project_ffe_line_build_fields` (00730). Only the keys present are
 * written; `roughCents: null` clears it. Quantity and unit refuse once the
 * line is released or on a PO.
 */
export interface SetFfeLineBuildFieldsRequest {
  name?: string;
  needLabel?: string;
  quantity?: number;
  unit?: FfeLineUnit;
  roughCents?: number | null;
}

/** `add_labor_line` (00732): a labor line on its piece. */
export interface AddLaborLineRequest {
  name: string;
  quantity?: number;
  unit?: FfeLineUnit;
  roughCents?: number | null;
  vendorId?: string | null;
  /** The client price per unit, whole cents (00737; sent as `p_unit_price_cents`). Above 0 it prices the line. */
  unitPriceCents?: number;
}

export interface ProjectFfeSelection {
  id: string;
  projectId: string;
  productId: string | null;
  captureId?: string | null;
  projectRoomId: string | null;
  name: string;
  quantity: number;
  status: FFEStageKey;
  designDisposition: FfeDesignDisposition;
  assignmentScope: FfeAssignmentScope;
  selectionThreadId: string;
  supersedesFfeItemId: string | null;
  readinessStatus?: string | null;
  missingRequiredFieldCount?: number;
  latestReviewVerdict?: 'approved' | 'rejected' | 'comment' | null;
  createdAt: string;
  unit?: FfeLineUnit;
  lineKind?: FfeLineKind;
  linkKind?: FfeLinkKind | null;
  /** Internal Rough $ (Q7). Never on a client payload. */
  roughCents?: number | null;
  /** The thread's need label; survives a fill. */
  needLabel?: string | null;
  /** Every room the line is placed in; `projectRoomId` stays the primary. */
  roomPlacements?: FfeRoomPlacement[];
  product?: {
    id: string;
    name: string;
    brand?: string | null;
    images?: string[] | null;
  } | null;
  room?: { id: string; name: string } | null;
}

export interface PlaceProductInProjectRequest {
  projectId: string;
  productId?: string | null;
  captureId?: string | null;
  name?: string | null;
  category?: string | null;
  quantity?: number;
  itemType?: 'fixed' | 'allowance' | 'tbd';
  budgetMinCents?: number | null;
  budgetMaxCents?: number | null;
  assignmentScope: FfeAssignmentScope;
  roomId?: string | null;
  boardId?: string | null;
  disposition?: Exclude<FfeDesignDisposition, 'superseded'>;
  duplicateMode: FfeDuplicateMode;
  placeholderSelectionId?: string | null;
  selectionReferenceId?: string | null;
  selectionThreadId?: string | null;
  configurationId?: string | null;
  roleConfigurationIdentity?: string | null;
  source?: string | null;
  sourceMetadata?: Record<string, unknown>;
  placement?: {
    x?: number;
    y?: number;
    width?: number;
    sectionId?: string | null;
  };
  unit?: FfeLineUnit;
  roughCents?: number | null;
  needLabel?: string | null;
  idempotencyKey: string;
}

export interface PlaceProductInProjectResult {
  outcome: FfePlacementOutcome;
  selectionId: string | null;
  threadId: string | null;
  placementId: string | null;
  itemType?: 'fixed' | 'allowance' | 'tbd';
  roleConfigurationIdentity?: string | null;
}

export interface CreateProjectBoardRequest {
  projectId: string;
  name: string;
  roomId?: string | null;
}

export interface CreateNamedProjectNeedRequest {
  projectId: string;
  name: string;
  category?: string | null;
  quantity?: number;
  itemType?: 'fixed' | 'allowance' | 'tbd';
  budgetMinCents?: number | null;
  budgetMaxCents?: number | null;
  assignmentScope: FfeAssignmentScope;
  roomId?: string | null;
  boardId?: string | null;
  disposition?: Exclude<FfeDesignDisposition, 'superseded'>;
  selectionThreadId?: string | null;
  source?: string | null;
  sourceMetadata?: Record<string, unknown>;
  placement?: PlaceProductInProjectRequest['placement'];
  unit?: FfeLineUnit;
  roughCents?: number | null;
  needLabel?: string | null;
  idempotencyKey: string;
}

export interface TriageProjectFfeItemsRequest {
  projectId: string;
  selectionIds: string[];
  assignmentScope: FfeAssignmentScope;
  roomId?: string | null;
  disposition?: Exclude<FfeDesignDisposition, 'superseded'>;
}

/** Stored on the selection's spec as `routing_source` by place_product_in_project_v2. */
export interface PromoteBoardReferenceSourceMetadata {
  sourceUrl?: string;
  priceCents?: number;
  vendorName?: string;
}

export interface PromoteBoardReferenceRequest {
  projectId: string;
  boardItemId: string;
  assignmentScope: FfeAssignmentScope;
  roomId?: string | null;
  /** Defaults to 'candidate'. */
  disposition?: Extract<FfeDesignDisposition, 'selected' | 'candidate'>;
  duplicateMode: FfeDuplicateMode;
  idempotencyKey: string;
  /** Line name for a pin with no product (the RPC requires one). */
  name?: string;
  productId?: string | null;
  sourceMetadata?: PromoteBoardReferenceSourceMetadata;
}

/** The pin-derived part of a promote request: name, product and source facts. */
export function promoteRequestFromPin(
  item: MoodBoardItemSnapshot,
): Pick<PromoteBoardReferenceRequest, 'name' | 'productId' | 'sourceMetadata'> {
  const data = item.data;
  const name = data?.name?.trim() || item.content?.trim() || undefined;
  const sourceMetadata: PromoteBoardReferenceSourceMetadata = {};
  const sourceUrl = data?.source_url?.trim();
  if (sourceUrl) sourceMetadata.sourceUrl = sourceUrl;
  if (typeof data?.price_cents === 'number' && Number.isFinite(data.price_cents)) {
    sourceMetadata.priceCents = data.price_cents;
  }
  const vendorName = data?.vendor_name?.trim();
  if (vendorName) sourceMetadata.vendorName = vendorName;
  return {
    ...(name ? { name } : {}),
    ...(item.productId ? { productId: item.productId } : {}),
    ...(Object.keys(sourceMetadata).length > 0 ? { sourceMetadata } : {}),
  };
}

export interface ArchiveProjectSelectionRequest {
  projectId: string;
  selectionId: string;
  reason: string;
}

export interface SupersedeProjectSelectionRequest {
  projectId: string;
  selectionId: string;
  productId?: string | null;
  name?: string | null;
  placementIds: string[];
}

export interface PublishProjectReviewItem {
  selectionId: string;
  clientFields?: Record<string, unknown>;
  mediaAssetIds?: string[];
  sortOrder?: number;
}

export interface PublishProjectReviewRequest {
  projectId: string;
  title?: string | null;
  items: PublishProjectReviewItem[];
  boardIds: string[];
  clientPriceMode: 'hide' | 'unit' | 'line_total';
}

export interface PublishProjectReviewResult {
  editionId: string;
  editionNumber: number;
  status: 'published';
  snapshotHash: string;
  itemCount: number;
}

/**
 * READY FOR LEAH (00742, D18, Q13, W4): an internal review act — the first
 * hire hands a room back to the lead designer for review. Who and when,
 * nothing else; never touches project_ffe_items and never read client-side.
 */
export interface RoomHandback {
  id: string;
  projectRoomId: string;
  handedBackBy: string;
  handedBackAt: string;
}

/**
 * A group heading inside a room (00751, D6, Q9, W5): the shower's
 * components. No money, no stage and no acts of its own; `projectRoomId`
 * is null for the unassigned pile.
 */
export interface ProjectLineGroup {
  id: string;
  projectId: string;
  projectRoomId: string | null;
  name: string;
  sortOrder: number;
}

/** `set_line_group` result (00751, W5): the group after the move. */
export interface SetLineGroupResult {
  groupId: string | null;
  ffeItemIds: string[];
  deletedGroupIds: string[];
}

/** `merge_studio_product` result (00753, D11, Q11, S5, W5). */
export interface MergeStudioProductResult {
  fromId: string;
  intoId: string;
  lines: number;
  boardItems: number;
  projectProducts: number;
  earlierMerges: number;
}

/**
 * One finish on a room's paint and finish schedule (00760, D16, Q10, W6): a
 * swatch element `{surface, product, brand, brand_code, sheen, hex,
 * sort_order}` on the room's `project_palettes` row. `hex` is the swatch.
 */
export interface RoomFinish {
  surface: string;
  product: string | null;
  brand: string | null;
  brandCode: string | null;
  sheen: string | null;
  hex: string | null;
  sortOrder: number;
}
