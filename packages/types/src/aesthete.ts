/**
 * Aesthete Engine Types (AI Recommendations, Rules, Teaching)
 */

export type RuleScope = 'user' | 'designer' | 'collection' | 'category' | 'global';
export type RuleEffect = 'boost' | 'bury' | 'block';
export type RuleStatus = 'draft' | 'in_review' | 'staging' | 'production' | 'archived';
export type TeachingActionType = 'approve' | 'reject' | 'replace_with' | 'similar_to' | 'hide';
export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

export interface Rule {
  id: string;
  scope: RuleScope;
  scopeId?: string;
  name: string;
  description?: string;
  predicate: Record<string, unknown>; // Rule conditions
  effect: RuleEffect;
  weight: number;
  status: RuleStatus;
  version: number;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  activatedAt?: Date;
}

export interface TeachingAction {
  id: string;
  actorId: string;
  actorType: 'designer' | 'client' | 'admin';
  type: TeachingActionType;
  productId: string;
  altProductId?: string;
  context?: Record<string, unknown>;
  reason?: string;
  weight: number;
  applied: boolean;
  ts: Date;
  metadata?: Record<string, unknown>;
}

export interface RecommendationCache {
  id: string;
  key: string; // Hash of profile/category/context
  items: RecommendationItem[];
  model?: string;
  confidence?: number;
  expiresAt?: Date;
  hitCount: number;
  lastHitAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecommendationItem {
  productId: string;
  score: number;
  reason?: string;
}

export interface RecommendationRequest {
  id: string;
  userId?: string;
  profileId?: string;
  context: Record<string, unknown>;
  results?: RecommendationItem[];
  model: string;
  latencyMs?: number;
  cacheHit: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface Experiment {
  id: string;
  name: string;
  description?: string;
  hypothesis?: string;
  status: ExperimentStatus;
  variants: ExperimentVariant[];
  allocation: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  startedAt?: Date;
  endedAt?: Date;
  results?: Record<string, unknown>;
  winner?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExperimentVariant {
  id: string;
  name: string;
  weight: number;
  config: Record<string, unknown>;
}

export interface ExperimentAssignment {
  id: string;
  experimentId: string;
  userId: string;
  variantId: string;
  assignedAt: Date;
}

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  rollout?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelMetrics {
  id: string;
  modelId: string;
  metric: 'precision' | 'recall' | 'ndcg' | 'mrr' | 'diversity' | 'novelty';
  value: number;
  context?: Record<string, unknown>;
  window: {
    start: Date;
    end: Date;
  };
  createdAt: Date;
}

// DTOs
export interface CreateRuleDTO {
  scope: RuleScope;
  scopeId?: string;
  name: string;
  description?: string;
  predicate: Record<string, unknown>;
  effect: RuleEffect;
  weight?: number;
}

export interface RecordTeachingActionDTO {
  actorId: string;
  actorType: 'designer' | 'client' | 'admin';
  type: TeachingActionType;
  productId: string;
  altProductId?: string;
  context?: Record<string, unknown>;
  reason?: string;
}

export interface GetRecommendationsRequest {
  userId?: string;
  profileId?: string;
  category?: string;
  limit?: number;
  filters?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface GetRecommendationsResponse {
  items: RecommendationItem[];
  model: string;
  confidence?: number;
  cacheHit: boolean;
  metadata?: Record<string, unknown>;
}
