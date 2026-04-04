/**
 * CRM v2 Type Definitions
 * Unified client relationship management types for all services
 * Includes Client Profile, Lifecycle, Health Scoring, Touchpoints, and Insights
 */

import { UUID, PaginatedResponse, Timestamps } from './common';
import { ApiResponse } from './api';

// ============================================================================
// CLIENT PROFILE & LIFECYCLE TYPES
// ============================================================================

/**
 * ClientProfileV2: Extended client profile with CRM v2 fields
 * Combines user account with property, financial, household, and engagement data
 */
export interface ClientProfileV2 extends Timestamps {
  id: UUID;
  userId: UUID;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;

  // Lifecycle
  currentStage: ClientStage;
  segment?: ClientSegment;
  ownerId?: UUID;
  ownerName?: string;
  ownerEmail?: string;
  status: 'active' | 'archived' | 'prospect';

  // Property information
  property?: PropertyInfo;

  // Household members
  householdMembers?: HouseholdMember[];

  // Financial information
  financial?: FinancialInfo;

  // Current metrics
  healthScore?: {
    score: number; // 0-100
    tier: HealthScoreTier;
    trend?: 'improving' | 'stable' | 'declining';
  };
  engagement?: {
    totalTouchpoints: number;
    lastTouchpointAt?: string; // ISO 8601
    approvalRate: number; // 0-1
    engagementTier: 'low' | 'medium' | 'high';
  };

  // CRM metadata
  crmProfileVersion: number;
  customFields?: Record<string, unknown>;
}

/**
 * PropertyInfo: Client's primary property details
 */
export interface PropertyInfo {
  id: UUID;
  type: 'residential' | 'commercial' | 'hospitality' | 'other';
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  squareFeet?: number;
  rooms?: number;
  bathrooms?: number;
  constructionStatus?: 'new_construction' | 'renovation' | 'maintenance';
  yearBuilt?: number;
  styles: string[]; // Design styles
  features: string[]; // Notable features
}

/**
 * HouseholdMember: Decision maker or influencer in client's household
 */
export interface HouseholdMember {
  id: UUID;
  name: string;
  email?: string;
  phone?: string;
  role: 'primary_decision_maker' | 'influencer' | 'budget_holder' | 'other';
  communicationPreference: 'email' | 'phone' | 'text' | 'mail';
  decisionInfluence: number; // 0-100 percentage
}

/**
 * FinancialInfo: Budget and payment information
 */
export interface FinancialInfo {
  id: UUID;
  budgetBand: BudgetBand;
  budgetMin?: number;
  budgetMax?: number;
  currency: string; // ISO 4217
  paymentTerms?: 'net_30' | 'net_60' | 'deposit_plus_installments' | 'full_upfront';
  creditLimit?: number;
}

/**
 * Budget bands for segmentation
 */
export type BudgetBand =
  | 'under_25k'
  | '25k_50k'
  | '50k_100k'
  | '100k_250k'
  | '250k_500k'
  | '500k_plus';

/**
 * Client lifecycle stages
 */
export type ClientStage = 'lead' | 'proposal' | 'active' | 'completed' | 'nurture';

/**
 * Client business segment
 */
export type ClientSegment = 'residential' | 'commercial' | 'hospitality';

/**
 * Customer360View: Unified view of client across all services
 */
export interface Customer360View {
  client: ClientProfileV2;
  activeProjects: ProjectSummary[];
  orders: OrderSummary[];
  communications: CommunicationsSummary;
  styleProfile?: StyleProfileSummary;
  predictiveInsights: PredictiveInsights;
}

export interface ProjectSummary {
  id: UUID;
  name: string;
  status: string;
  stage: string;
  budget: number;
  spend: number;
  owner: string;
  startDate: string; // ISO 8601 date
  targetEndDate: string; // ISO 8601 date
  nextMilestone?: string; // ISO 8601 datetime
}

export interface OrderSummary {
  id: UUID;
  status: string;
  total: number;
  createdAt: string; // ISO 8601
  eta?: string; // ISO 8601 date
}

export interface CommunicationsSummary {
  activeThreads: number;
  unreadMessages: number;
  lastMessage?: string; // ISO 8601 datetime
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface StyleProfileSummary {
  preferences: string[];
  lastUpdated: string; // ISO 8601
  confidence: number; // 0-1
}

export interface PredictiveInsights {
  healthScore: HealthScoreSummary;
  nextBestAction?: string;
  upsellOpportunity?: string;
  engagementWindow?: 'now' | 'this_week' | 'this_month';
}

export interface HealthScoreSummary {
  score: number; // 0-100
  tier: HealthScoreTier;
  trend?: 'improving' | 'stable' | 'declining';
  nextReviewDate?: string; // ISO 8601 datetime
}

/**
 * Health score tier classification
 */
export type HealthScoreTier = 'low' | 'medium' | 'high';

// ============================================================================
// HEALTH SCORING TYPES
// ============================================================================

/**
 * HealthScore: Comprehensive client health assessment
 */
export interface HealthScore extends Timestamps {
  id: UUID;
  clientId: UUID;
  score: number; // 0-100
  tier: HealthScoreTier;

  // Component scores
  components: {
    slaCompliance: HealthScoreComponent;
    sentiment: HealthScoreComponent;
    activity: HealthScoreComponent;
    orderVariance: HealthScoreComponent;
    approvalLatency: HealthScoreComponent;
  };

  // Risk assessment
  churnRiskScore: number; // 0-100
  churnProbability: number; // 0-1
  churnRiskFactors: string[];

  // Trends and history
  trend?: 'improving' | 'stable' | 'declining';
  previousScore?: number;
  historicalScores: Array<{
    date: string; // ISO 8601 date
    score: number;
    tier: HealthScoreTier;
  }>;

  // Audit
  calculatedBy: 'heuristic' | 'ml_model';
  calculatedAt: string; // ISO 8601 datetime
  overriddenAt?: string;
  overriddenBy?: UUID;
  overrideReason?: string;

  // Recommendations
  risks?: Array<{
    risk: string;
    probability: number;
    recommendation: string;
  }>;
}

export interface HealthScoreComponent {
  score: number; // 0-100
  weight: number; // 0-1
  detail: string;
  trend?: 'improving' | 'stable' | 'declining';
}

// ============================================================================
// TOUCHPOINT TYPES
// ============================================================================

/**
 * Touchpoint: Record of client interaction (call, meeting, email, etc)
 */
export interface Touchpoint extends Timestamps {
  id: UUID;
  clientId: UUID;
  type: TouchpointType;
  channel: TouchpointChannel;
  date: string; // ISO 8601 datetime
  duration?: string; // ISO 8601 duration
  subject?: string;
  notes?: string;
  sentiment?: SentimentScore;

  // Participants
  participants: Array<{
    id: UUID;
    name: string;
    role: 'designer' | 'client' | 'decision_maker' | 'other';
  }>;
  createdBy?: {
    id: UUID;
    name: string;
  };

  // Engagement
  clientResponseRequired: boolean;
  outcome?: string;
  artifacts: Array<{
    id: UUID;
    type: string;
    name: string;
    url: string;
  }>;

  // Links
  linkedProjects: UUID[];
  linkedThreads: UUID[];
  linkedApprovals: UUID[];
}

export type TouchpointType =
  | 'call'
  | 'meeting'
  | 'email'
  | 'portal_activity'
  | 'approval'
  | 'upload'
  | 'note';

export type TouchpointChannel = 'phone' | 'zoom' | 'email' | 'in_person' | 'portal' | 'sms';

export type SentimentScore = 'positive' | 'neutral' | 'negative';

/**
 * CreateTouchpointRequest: Payload for logging new touchpoint
 */
export interface CreateTouchpointRequest {
  type: TouchpointType;
  channel: TouchpointChannel;
  date: string; // ISO 8601 datetime
  duration?: string; // ISO 8601 duration
  subject?: string;
  notes?: string;
  sentiment?: SentimentScore;
  participants?: Array<{
    id?: UUID;
    name?: string;
    role?: 'designer' | 'client' | 'decision_maker' | 'other';
  }>;
  clientResponseRequired?: boolean;
  outcome?: string;
  artifacts?: Array<{
    id?: UUID;
    type: string;
    name: string;
    url: string;
  }>;
}

// ============================================================================
// ENGAGEMENT TYPES
// ============================================================================

/**
 * EngagementMetrics: Aggregate engagement tracking per client
 */
export interface EngagementMetrics {
  clientId: UUID;
  totalTouchpoints: number;
  lastTouchpointAt?: string; // ISO 8601 datetime
  avgTouchpointInterval?: number; // Days between touchpoints

  messageCount: number;
  unreadMessageCount: number;
  avgResponseTimeHours?: number;
  lastMessageAt?: string; // ISO 8601 datetime
  messagesSentiment?: SentimentScore;

  approvalRate: number; // 0-1
  approvalCount: number;
  rejectionCount: number;
  totalApprovalsRequested: number;
  pendingApprovalsCount: number;
  avgApprovalDays?: number;

  portalLastLoginAt?: string; // ISO 8601 datetime
  portalLoginCount: number;
  daysInactive?: number;
  contentInteractions: Record<string, unknown>;

  touchpointTrend?: 'increasing' | 'stable' | 'decreasing';
  engagementScore: number; // 0-100
  engagementTier: 'low' | 'medium' | 'high';

  updatedAt: string; // ISO 8601 datetime
}

// ============================================================================
// RECOMMENDATION TYPES
// ============================================================================

/**
 * Recommendation: AI-powered suggestion for upsell, next action, or content
 */
export interface Recommendation extends Timestamps {
  id: UUID;
  clientId: UUID;
  type: RecommendationType;
  title: string;
  description?: string;

  // Confidence and timing
  confidence: number; // 0-1
  suggestedTiming?: 'immediate' | 'this_week' | 'this_month' | 'flexible';

  // Related entity
  relatedEntity?: {
    type: 'product' | 'project' | 'campaign';
    id: UUID;
    name: string;
  };

  // Action and reasoning
  suggestedAction?: string;
  reasoning?: string;

  // Impact prediction
  estimatedLift?: {
    metric: string;
    expectedValue: number;
  };

  // Status and feedback
  status: RecommendationStatus;
  confirmedAt?: string;
  dismissedAt?: string;
  actionedAt?: string;
  dismissalReason?: string;
  actionNotes?: string;
  userFeedback?: 'confirmed' | 'dismissed' | 'actioned';
  feedbackAt?: string;
}

export type RecommendationType = 'upsell' | 'next_action' | 'content' | 'timing';
export type RecommendationStatus = 'pending' | 'confirmed' | 'dismissed' | 'actioned';

/**
 * RecommendationFeedback: User feedback on recommendation
 */
export interface RecommendationFeedback {
  status: 'confirmed' | 'dismissed' | 'actioned';
  notes?: string;
}

// ============================================================================
// RISK & ALERT TYPES
// ============================================================================

/**
 * RiskAlert: High-priority alert for client attention
 */
export interface RiskAlert extends Timestamps {
  id: UUID;
  clientId: UUID;
  clientName: string;
  severity: RiskAlertSeverity;
  type: RiskAlertType;
  title: string;
  description: string;

  // Detection
  detectedAt: string; // ISO 8601 datetime
  detectedBy?: 'heuristic' | 'ml_model' | 'manual';
  detectedReason?: string;

  // Context
  relatedEntity?: {
    type: 'project' | 'order' | 'approval';
    id: UUID;
  };

  // Actions
  suggestedActions: string[];
  assignedTo?: {
    id: UUID;
    name: string;
  };
  resolvedAt?: string;
  resolutionNotes?: string;

  // Escalation
  escalatedAt?: string;
  escalatedTo?: UUID;
}

export type RiskAlertSeverity = 'critical' | 'high' | 'medium';
export type RiskAlertType =
  | 'churn'
  | 'sla_breach'
  | 'sentiment'
  | 'approval_delay'
  | 'engagement_drop';

// ============================================================================
// INSIGHTS & ANALYTICS TYPES
// ============================================================================

/**
 * PipelineVelocityMetrics: Analytics on client flow through lifecycle stages
 */
export interface PipelineVelocityMetrics {
  timeRange: string;
  data: Array<{
    stage: ClientStage;
    clientCount: number;
    avgDuration: string; // ISO 8601 duration
    medianDuration: string; // ISO 8601 duration
    conversionRate: number; // 0-1
    slaCompliance: number; // 0-1
    bottleneck: boolean;
    notes?: string;
  }>;
}

/**
 * ClientSegmentAnalysis: Segment breakdown with metrics
 */
export interface ClientSegmentAnalysis {
  dimension: 'type' | 'budget' | 'health' | 'engagement' | 'ltv';
  segments: Array<{
    name: string;
    clientCount: number;
    avgHealthScore: number;
    avgOrderValue: number;
    churnRate: number;
    ltv: number;
    activeProjects: number;
    engagementIndex: number;
  }>;
}

/**
 * HealthTrendsResponse: Time-series health score trends
 */
export interface HealthTrendsResponse {
  timeRange: string;
  granularity: 'daily' | 'weekly' | 'monthly';
  data: Array<{
    period: string; // ISO 8601 date
    avgScore: number;
    medianScore: number;
    distribution: {
      low: number;
      medium: number;
      high: number;
    };
    anomalies?: Array<{
      clientId: UUID;
      change: number;
      severity: string;
    }>;
  }>;
}

// ============================================================================
// CLIENT LIFECYCLE TYPES
// ============================================================================

/**
 * StageTransitionRequest: Payload for moving client through lifecycle stages
 */
export interface StageTransitionRequest {
  newStage: ClientStage;
  reason?: string;
  notes?: string;
  force?: boolean;
}

/**
 * StageTransitionResponse: Result of stage transition
 */
export interface StageTransitionResponse {
  clientId: UUID;
  previousStage: ClientStage;
  newStage: ClientStage;
  transitionedAt: string; // ISO 8601 datetime
  durationInStage: string; // ISO 8601 duration in previous stage
  nextMilestone?: string; // ISO 8601 datetime
}

/**
 * ClientActivityLog: Immutable audit trail of client changes
 */
export interface ClientActivityLog extends Timestamps {
  id: UUID;
  clientId: UUID;
  action: string;
  actorId?: UUID;
  actorName?: string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changedFields: string[];
  source?: 'api' | 'portal' | 'import' | 'system';
  ipAddress?: string;
}

// ============================================================================
// WEBHOOK & EVENT TYPES
// ============================================================================

/**
 * WebhookEventEnvelope: Standard event format for all CRM events
 */
export interface WebhookEventEnvelope<T = unknown> {
  eventId: UUID;
  eventType: WebhookEventType;
  timestamp: string; // ISO 8601 datetime
  version: string; // Event schema version
  clientId?: UUID;
  aggregateId: UUID;
  aggregateType: string;
  payload: T;
  metadata?: {
    traceId: UUID;
    correlationId?: UUID;
    userId?: UUID;
    source?: string;
    environment?: 'development' | 'staging' | 'production';
  };
}

export type WebhookEventType =
  | 'client.created'
  | 'client.updated'
  | 'client.archived'
  | 'stage.transitioned'
  | 'health_score.updated'
  | 'health_score.alert'
  | 'touchpoint.created'
  | 'recommendation.generated';

/**
 * ClientCreatedEvent: Fired when new client is created
 */
export interface ClientCreatedEvent {
  clientId: UUID;
  email: string;
  firstName: string;
  lastName: string;
  segment?: ClientSegment;
  source?: string;
}

/**
 * StageTransitionedEvent: Fired when client moves through lifecycle stage
 */
export interface StageTransitionedEvent {
  clientId: UUID;
  previousStage: ClientStage;
  newStage: ClientStage;
  reason?: string;
  ownerId?: UUID;
}

/**
 * HealthScoreUpdatedEvent: Fired when health score is recalculated
 */
export interface HealthScoreUpdatedEvent {
  clientId: UUID;
  previousScore: number;
  newScore: number;
  previousTier: HealthScoreTier;
  newTier: HealthScoreTier;
  significantChange: boolean;
}

/**
 * TouchpointCreatedEvent: Fired when new touchpoint is logged
 */
export interface TouchpointCreatedEvent {
  clientId: UUID;
  touchpointId: UUID;
  type: TouchpointType;
  channel: TouchpointChannel;
  date: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * CreateClientRequest: Payload for creating new client
 */
export interface CreateClientRequest {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  source?: 'referral' | 'website' | 'designer_portal' | 'import';
  referralSource?: string;
  marketingConsent?: boolean;
  property?: PropertyInfo;
  household?: HouseholdMember[];
  financial?: FinancialInfo;
  customFields?: Record<string, unknown>;
}

/**
 * UpdateClientRequest: Payload for updating client
 */
export interface UpdateClientRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  property?: Partial<PropertyInfo>;
  household?: HouseholdMember[];
  financial?: Partial<FinancialInfo>;
  status?: 'active' | 'archived' | 'prospect';
  notes?: string;
}

/**
 * Standard CRM API responses
 */
export type ClientResponse = ApiResponse<ClientProfileV2>;
export type ClientListResponse = PaginatedResponse<ClientProfileV2>;
export type HealthScoreResponse = ApiResponse<HealthScore>;
export type TouchpointResponse = ApiResponse<Touchpoint>;
export type TouchpointListResponse = PaginatedResponse<Touchpoint>;
export type RecommendationListResponse = ApiResponse<{
  data: Recommendation[];
  generatedAt: string;
  nextRefresh: string;
}>;
