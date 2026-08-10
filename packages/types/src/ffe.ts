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

export type FfeDuplicateMode = 'reuse' | 'separate' | 'fill_placeholder';

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
  assignmentScope: FfeAssignmentScope;
  projectRoomId?: string | null;
  boardId?: string | null;
  designDisposition?: FfeDesignDisposition;
  duplicateMode: FfeDuplicateMode;
  placeholderFfeItemId?: string | null;
  selectionFfeItemId?: string | null;
  roleKey?: string | null;
  configurationId?: string | null;
  idempotencyKey: string;
}

export interface PlaceProductInProjectResult {
  outcome: FfePlacementOutcome;
  selectionId: string;
  selectionThreadId: string;
  placementId: string | null;
}

export interface CreateProjectBoardRequest {
  projectId: string;
  name: string;
  projectRoomId?: string | null;
  starterIntent?: 'concept' | 'selections' | 'materials' | 'blank';
  idempotencyKey: string;
}

export interface CreateNamedProjectNeedRequest {
  projectId: string;
  name: string;
  assignmentScope: FfeAssignmentScope;
  projectRoomId?: string | null;
  designDisposition?: FfeDesignDisposition;
  needKind?: 'placeholder' | 'allowance' | 'manual_product';
  quantity?: number;
  idempotencyKey: string;
}

export interface TriageProjectFfeItemsRequest {
  projectId: string;
  selectionIds: string[];
  assignmentScope: FfeAssignmentScope;
  projectRoomId?: string | null;
  designDisposition?: FfeDesignDisposition;
  idempotencyKey: string;
}

export interface PromoteBoardReferenceRequest {
  projectId: string;
  boardId: string;
  placementId: string;
  assignmentScope: FfeAssignmentScope;
  projectRoomId?: string | null;
  designDisposition?: FfeDesignDisposition;
  duplicateMode: FfeDuplicateMode;
  idempotencyKey: string;
}

export interface ArchiveProjectSelectionRequest {
  projectId: string;
  selectionId: string;
  reason?: string | null;
  idempotencyKey: string;
}

export interface SupersedeProjectSelectionRequest {
  projectId: string;
  selectionId: string;
  replacementProductId?: string | null;
  replacementCaptureId?: string | null;
  replacePlacementIds: string[];
  reason?: string | null;
  idempotencyKey: string;
}

export interface PublishProjectReviewRequest {
  projectId: string;
  editionId?: string | null;
  selectionIds: string[];
  boardIds: string[];
  priceVisibility: 'show_client_price' | 'hide_price';
  idempotencyKey: string;
}

export interface PublishProjectReviewResult {
  editionId: string;
  editionNumber: number;
  status: 'published';
  deliveryStatus: 'not_requested' | 'queued' | 'failed';
}
