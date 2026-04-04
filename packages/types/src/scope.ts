/**
 * Scope Builder Types
 *
 * Types for the structured scope data that lives on proposals.
 * Built in the Scope Builder, carried over to the project on activation.
 */

// ============================================================================
// ITEM TYPE (Fixed / Allowance / TBD)
// ============================================================================

export type ScopeItemType = 'fixed' | 'allowance' | 'tbd';

export const SCOPE_ITEM_TYPE_VALUES: readonly ScopeItemType[] = [
  'fixed',
  'allowance',
  'tbd',
] as const;

// ============================================================================
// PROPOSAL SCOPE ROOM
// ============================================================================

export interface ProposalScopeRoom {
  id: string;
  proposalId: string;
  roomId: string | null;
  name: string;
  roomType: string | null;
  dimensions: string | null;
  floorAreaSqft: number | null;
  budgetCents: number;
  ffeCategories: string[];
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScopeRoomInput {
  proposalId: string;
  roomId?: string;
  name: string;
  roomType?: string;
  dimensions?: string;
  floorAreaSqft?: number;
  budgetCents?: number;
  ffeCategories?: string[];
  notes?: string;
}

export interface UpdateScopeRoomInput {
  name?: string;
  roomType?: string;
  dimensions?: string;
  floorAreaSqft?: number;
  budgetCents?: number;
  ffeCategories?: string[];
  notes?: string;
}

// ============================================================================
// PROPOSAL PHASE
// ============================================================================

export interface ProposalPhase {
  id: string;
  proposalId: string;
  name: string;
  phaseKey: string | null;
  durationWeeks: number | null;
  feeCents: number;
  revisionLimit: number;
  gateCondition: string | null;
  deliverables: Array<{ label: string; type?: string }>;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProposalPhaseInput {
  proposalId: string;
  name: string;
  phaseKey?: string;
  durationWeeks?: number;
  feeCents?: number;
  revisionLimit?: number;
  gateCondition?: string;
  deliverables?: Array<{ label: string; type?: string }>;
}

export interface UpdateProposalPhaseInput {
  name?: string;
  phaseKey?: string;
  durationWeeks?: number;
  feeCents?: number;
  revisionLimit?: number;
  gateCondition?: string;
  deliverables?: Array<{ label: string; type?: string }>;
}

// ============================================================================
// PROPOSAL EXCLUSION
// ============================================================================

export interface ProposalExclusion {
  id: string;
  proposalId: string;
  description: string;
  category: string | null;
  sortOrder: number;
  createdAt: string;
}

// ============================================================================
// PROPOSAL PAYMENT MILESTONE
// ============================================================================

export interface ProposalPaymentMilestone {
  id: string;
  proposalId: string;
  phaseId: string | null;
  label: string;
  percentage: number;
  amountCents: number;
  triggerCondition: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface CreatePaymentMilestoneInput {
  proposalId: string;
  phaseId?: string;
  label: string;
  percentage: number;
  amountCents?: number;
  triggerCondition?: string;
}

// ============================================================================
// PROPOSAL CHANGE ORDER TERMS
// ============================================================================

export interface ProposalChangeOrderTerms {
  id: string;
  proposalId: string;
  processDescription: string;
  hourlyRateCents: number;
  minimumFeeCents: number;
  approvalRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertChangeOrderTermsInput {
  proposalId: string;
  processDescription: string;
  hourlyRateCents?: number;
  minimumFeeCents?: number;
  approvalRequired?: boolean;
}

// ============================================================================
// SCOPE BUILDER AGGREGATE
// ============================================================================

export interface ScopeBuilderData {
  rooms: ProposalScopeRoom[];
  phases: ProposalPhase[];
  exclusions: ProposalExclusion[];
  paymentMilestones: ProposalPaymentMilestone[];
  changeOrderTerms: ProposalChangeOrderTerms | null;
  summary: {
    totalRooms: number;
    totalFFEItems: number;
    totalBudgetCents: number;
    totalDesignFeeCents: number;
    totalPhases: number;
    estimatedWeeks: number;
  };
}
