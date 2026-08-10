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
  idempotencyKey: string;
}

export interface TriageProjectFfeItemsRequest {
  projectId: string;
  selectionIds: string[];
  assignmentScope: FfeAssignmentScope;
  roomId?: string | null;
  disposition?: Exclude<FfeDesignDisposition, 'superseded'>;
}

export interface PromoteBoardReferenceRequest {
  projectId: string;
  boardItemId: string;
  assignmentScope: FfeAssignmentScope;
  roomId?: string | null;
  disposition?: Exclude<FfeDesignDisposition, 'superseded'>;
  duplicateMode: FfeDuplicateMode;
  idempotencyKey: string;
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
