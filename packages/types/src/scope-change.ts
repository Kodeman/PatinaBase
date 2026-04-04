/**
 * Scope Change Authorization Types
 *
 * When a client requests changes after proposal signing,
 * a Scope Change Authorization captures the impact and requires approval.
 */

export type ScopeChangeStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'approved'
  | 'declined'
  | 'cancelled';

export const SCOPE_CHANGE_STATUS_VALUES: readonly ScopeChangeStatus[] = [
  'draft',
  'sent',
  'viewed',
  'approved',
  'declined',
  'cancelled',
] as const;

export interface ScopeChangeNewRoom {
  name: string;
  roomType?: string;
  dimensions?: string;
  budgetCents: number;
  ffeCategories: string[];
}

export interface ScopeChangeNewFFEItem {
  name: string;
  ffeCategory?: string;
  itemType: 'fixed' | 'allowance' | 'tbd';
  unitPriceCents?: number;
  quantity: number;
  roomName?: string;
}

export interface ScopeChangeRequest {
  id: string;
  projectId: string;
  proposalId: string | null;
  requestedBy: string;
  title: string;
  description: string;
  additionalFfeBudgetCents: number;
  additionalDesignFeeCents: number;
  timelineImpactWeeks: number;
  newTotalBudgetCents: number;
  newRooms: ScopeChangeNewRoom[];
  newFfeItems: ScopeChangeNewFFEItem[];
  status: ScopeChangeStatus;
  sentAt: string | null;
  viewedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedIp: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScopeChangeInput {
  projectId: string;
  proposalId?: string;
  title: string;
  description: string;
  additionalFfeBudgetCents?: number;
  additionalDesignFeeCents?: number;
  timelineImpactWeeks?: number;
  newTotalBudgetCents?: number;
  newRooms?: ScopeChangeNewRoom[];
  newFfeItems?: ScopeChangeNewFFEItem[];
}

export interface ApproveScopeChangeInput {
  requestId: string;
  approvedByName: string;
  approvedIp?: string;
}
