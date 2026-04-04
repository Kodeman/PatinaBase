/**
 * Project v2 Types
 *
 * Enhanced project types for projects activated from signed proposals.
 * These complement the base Project type in project.ts with scope-aware fields.
 */

// ============================================================================
// FF&E PIPELINE STATUS
// ============================================================================

export type FFEPipelineStatus =
  | 'specified'
  | 'quoted'
  | 'approved'
  | 'ordered'
  | 'production'
  | 'shipped'
  | 'delivered'
  | 'installed';

export const FFE_PIPELINE_STATUS_VALUES: readonly FFEPipelineStatus[] = [
  'specified',
  'quoted',
  'approved',
  'ordered',
  'production',
  'shipped',
  'delivered',
  'installed',
] as const;

export type ProjectPhaseStatus = 'pending' | 'in_progress' | 'completed' | 'delayed';

export const PROJECT_PHASE_STATUS_VALUES: readonly ProjectPhaseStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'delayed',
] as const;

export type PaymentMilestoneStatus = 'pending' | 'outstanding' | 'paid';

// ============================================================================
// PROJECT ROOM (activated from ProposalScopeRoom)
// ============================================================================

export interface ProjectRoom {
  id: string;
  projectId: string;
  sourceScopeRoomId: string | null;
  roomId: string | null;
  name: string;
  roomType: string | null;
  dimensions: string | null;
  floorAreaSqft: number | null;
  budgetCents: number;
  committedCents: number;
  actualCents: number;
  ffeCategories: string[];
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PROJECT FF&E ITEM (activated from ProposalItem)
// ============================================================================

export interface ProjectFFEItem {
  id: string;
  projectId: string;
  projectRoomId: string | null;
  sourceProposalItemId: string | null;
  productId: string | null;
  name: string;
  ffeCategory: string | null;
  itemType: 'fixed' | 'allowance' | 'tbd';
  status: FFEPipelineStatus;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  vendorName: string | null;
  vendorId: string | null;
  poNumber: string | null;
  eta: string | null;
  blocked: boolean;
  blockedReason: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  // Joined data
  room?: Pick<ProjectRoom, 'id' | 'name'>;
  product?: {
    id: string;
    name: string;
    images: string[] | null;
    brand: string | null;
  };
}

// ============================================================================
// PROJECT PHASE (activated from ProposalPhase)
// ============================================================================

export interface ProjectPhaseRecord {
  id: string;
  projectId: string;
  sourceProposalPhaseId: string | null;
  name: string;
  phaseKey: string | null;
  status: ProjectPhaseStatus;
  startDate: string | null;
  targetEndDate: string | null;
  completedAt: string | null;
  durationWeeks: number | null;
  feeCents: number;
  revisionLimit: number;
  revisionsUsed: number;
  gateCondition: string | null;
  deliverables: Array<{ label: string; type?: string }>;
  progress: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PROJECT PAYMENT MILESTONE
// ============================================================================

export interface ProjectPaymentMilestone {
  id: string;
  projectId: string;
  phaseId: string | null;
  label: string;
  percentage: number;
  amountCents: number;
  triggerCondition: string | null;
  status: PaymentMilestoneStatus;
  dueDate: string | null;
  paidAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PROJECT V2 (enhanced Project with scope-aware fields)
// ============================================================================

export interface ProjectV2 {
  id: string;
  proposalId: string | null;
  designerId: string | null;
  clientId: string | null;
  name: string;
  status: string;
  budgetCents: number;
  committedCents: number;
  actualCents: number;
  designFeeCents: number;
  startDate: string | null;
  targetEndDate: string | null;
  currentPhase: string | null;
  scopeBoundaries: Array<{ description: string; category?: string }>;
  changeOrderTerms: {
    processDescription?: string;
    hourlyRateCents?: number;
    minimumFeeCents?: number;
    approvalRequired?: boolean;
  };
  briefDocumentUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined data
  designer?: { id: string; full_name: string | null; email: string };
  client?: { id: string; full_name: string | null; email: string };
  proposal?: { id: string; title: string; signed_at: string | null };
}

// ============================================================================
// PROJECT FINANCIALS (computed aggregate)
// ============================================================================

export interface ProjectFinancials {
  budgetCents: number;
  committedCents: number;
  actualCents: number;
  designFeeCents: number;
  varianceCents: number;
  byRoom: Array<{
    roomId: string;
    roomName: string;
    budgetCents: number;
    committedCents: number;
    actualCents: number;
  }>;
  byCategory: Array<{
    category: string;
    budgetCents: number;
    committedCents: number;
    actualCents: number;
  }>;
}
