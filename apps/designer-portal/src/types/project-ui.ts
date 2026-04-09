/**
 * UI-specific types for the Opus project management screens.
 * These complement the backend types from @patina/types with
 * display-layer concerns (phase colors, budget line items, etc.)
 */

// ── Phase Configuration (re-exported from shared package) ──

import type { PhaseSlug } from '@patina/types';

/** @deprecated Use PhaseSlug from @patina/types directly */
export type ProjectPhase = PhaseSlug;

export {
  type PhaseSlug,
  ALL_PHASE_SLUGS as ALL_PHASES,
  PHASE_DISPLAY_CONFIG,
  type PhaseDisplayConfig,
  type PhaseStatus,
  PHASE_STATUS_DISPLAY,
  getPhaseLabel,
  calculateProjectProgress,
} from '@patina/types';

// Legacy alias — maps PhaseDisplayConfig to the old PhaseConfig shape
import type { PhaseDisplayConfig } from '@patina/types';
export type PhaseConfig = PhaseDisplayConfig & { typicalWeeks: string };

// Re-export the config under the old name for backwards compatibility
import { PHASE_DISPLAY_CONFIG } from '@patina/types';
export const PHASE_CONFIG = Object.fromEntries(
  Object.entries(PHASE_DISPLAY_CONFIG).map(([key, config]) => [
    key,
    { ...config, typicalWeeks: config.typicalDuration },
  ])
) as Record<import('@patina/types').PhaseSlug, PhaseConfig>;

// ── Budget & Financials ──

export interface BudgetLineItem {
  id: string;
  category: string;
  label: string;
  budgeted: number;
  actual: number;
}

export interface PaymentMilestone {
  id: string;
  title: string;
  percentage: number;
  amount: number;
  status: 'paid' | 'outstanding' | 'pending';
  date?: string;
  note?: string;
}

export interface DesignerEarnings {
  designFee: number;
  commissions: number;
  commissionRate: number;
  productTotal: number;
}

// ── Project List ──

export interface ProjectListMetrics {
  activeValue: number;
  activeCount: number;
  avgTimeline: number;
  invoicedMTD: number;
  invoicedChange: number;
}

// ── Closure ──

export interface ClosureItem {
  key: string;
  label: string;
  completed: boolean;
  date?: string;
}

export interface PortfolioSnapshot {
  headline: string;
  description: string;
  value: number;
  duration: string;
  rooms: string[];
  styleTags: string[];
}

// ── Mock Timeline Segment (for mock data layer) ──

export interface MockTimelineSegment {
  id: string;
  phase: ProjectPhase;
  status: 'completed' | 'in_progress' | 'pending';
  startDate?: string;
  endDate?: string;
  progress: number;
}

// ── Mock Task ──

export type TaskIndicator = 'decision' | 'blocked' | 'deliverable' | 'gate';

export interface MockTask {
  id: string;
  projectId: string;
  phase: ProjectPhase;
  title: string;
  description?: string;
  status: 'todo' | 'done' | 'blocked';
  dueDate?: string;
  completedAt?: string;
  indicators?: TaskIndicator[];
  indicatorText?: string;
}

// ── Mock Document ──

export type DocumentCategory = 'contract' | 'drawing' | 'photo' | 'spec';

export interface MockDocument {
  id: string;
  projectId: string;
  title: string;
  type: 'pdf' | 'img' | 'doc' | 'xls' | 'dwg' | 'png' | 'xlsx';
  category?: DocumentCategory;
  date: string;
  size: string;
  status?: string;
  version?: string;
}

// ── Mock Activity ──

export interface MockActivity {
  id: string;
  projectId: string;
  actorName: string;
  title: string;
  timestamp: string;
}

// ── Room Scope ──

export interface MockRoom {
  id: string;
  projectId: string;
  name: string;
  dimensions: string;
  notes: string;
  budget: number;
  itemCount: number;
  orderedCount: number;
  progress: number;
  itemNames: string[];
}

// ── FF&E Schedule ──

export type FFEStatus =
  | 'specified'
  | 'quoted'
  | 'approved'
  | 'ordered'
  | 'production'
  | 'shipped'
  | 'delivered'
  | 'installed';

export type FFEItemType = 'fixed' | 'allowance' | 'tbd';

export interface MockFFEItem {
  id: string;
  projectId: string;
  roomId: string;
  roomName: string;
  name: string;
  vendor: string;
  poNumber?: string;
  qty: number | string;
  unitPrice: number;
  status: FFEStatus;
  itemType?: FFEItemType;
  budgetMin?: number;
  budgetMax?: number;
  ffeCategory?: string;
  eta?: string;
  blocked?: boolean;
  blockedReason?: string;
}

// ── Expanded Financials ──

export interface FinancialLineItem {
  id: string;
  category: string;
  label: string;
  budget: number;
  committed: number;
  actual: number;
  variance: number;
}

// ── Time Tracking ──

export interface TimeEntry {
  phase: ProjectPhase;
  hoursSpent: number;
  hoursEstimated: number;
}

export interface MockTimeTracking {
  entries: TimeEntry[];
  totalSpent: number;
  totalEstimated: number;
  effectiveRate: number;
}

// ── Phase Approval ──

export type ApprovalStatus = 'pending' | 'needs_discussion' | 'approved' | 'rejected' | 'cancelled';

export interface PhaseApproval {
  id: string;
  phaseKey: string;
  status: ApprovalStatus;
  type: string;
  requestedAt: string;
  decidedAt?: string;
  comment?: string;
}

// ── Key Metrics (Zone 2 aggregate) ──

export interface ProjectKeyMetrics {
  progress: number;
  weekNumber: number;
  totalWeeks: number;
  budgetTotal: number;
  budgetStatus: string;
  committed: number;
  committedPct: number;
  invoiced: number;
  outstanding: number;
  ffeTotal: number;
  ffeOrdered: number;
  decisionsOpen: number;
  decisionsOverdue: number;
  hoursSpent: number;
  hoursEstimated: number;
}
