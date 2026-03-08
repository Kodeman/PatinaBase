// ═══════════════════════════════════════════════════════════════════════════
// TEACHING WORKFLOW TYPES
// Style attribution, client matching, validation, and designer stats
// ═══════════════════════════════════════════════════════════════════════════

import type { UUID } from './index';

// ─── Style Spectrum ───────────────────────────────────────────────────────

export type SpectrumDimension =
  | 'warmth'
  | 'complexity'
  | 'formality'
  | 'timelessness'
  | 'boldness'
  | 'craftsmanship';

export interface ProductStyleSpectrum {
  id: UUID;
  productId: UUID;
  warmth: number | null;
  complexity: number | null;
  formality: number | null;
  timelessness: number | null;
  boldness: number | null;
  craftsmanship: number | null;
  assignedBy: UUID;
  createdAt: string;
  updatedAt: string;
}

export interface SpectrumValues {
  warmth: number | null;
  complexity: number | null;
  formality: number | null;
  timelessness: number | null;
  boldness: number | null;
  craftsmanship: number | null;
}

export interface SpectrumCalibrationProduct {
  id: UUID;
  spectrumDimension: SpectrumDimension;
  position: number; // -1, 0, or 1
  productId: UUID;
  createdAt: string;
}

// ─── Style Archetype (Enhanced Style) ─────────────────────────────────────

export interface StyleArchetype {
  id: UUID;
  name: string;
  parentId: UUID | null;
  description: string | null;
  visualMarkers: string[];
  isArchetype: boolean;
  displayOrder: number | null;
  colorHex: string | null;
  iconName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductStyleEnhanced {
  id: UUID;
  productId: UUID;
  styleId: UUID;
  confidence: number;
  isPrimary: boolean;
  source: StyleSource;
  assignedBy: UUID;
  createdAt: string;
  style?: StyleArchetype;
}

export type StyleSource = 'manual' | 'ml_predicted' | 'validated';

// ─── Client Archetypes ────────────────────────────────────────────────────

export interface ClientArchetype {
  id: UUID;
  name: string;
  description: string | null;
  visualCues: string[];
  typicalBudgetRange: BudgetRangeData | null;
  displayOrder: number | null;
  createdAt: string;
}

export interface BudgetRangeData {
  min: number;
  max: number;
  currency: string;
}

// ─── Appeal Signals ───────────────────────────────────────────────────────

export type AppealCategory = 'visual' | 'functional' | 'emotional' | 'lifestyle';

export interface AppealSignal {
  id: UUID;
  name: string;
  category: AppealCategory;
  description: string | null;
  createdAt: string;
}

export interface ProductAppealSignal {
  id: UUID;
  productId: UUID;
  appealSignalId: UUID;
  assignedBy: UUID;
  createdAt: string;
  appealSignal?: AppealSignal;
}

// ─── Product-Client Matching ──────────────────────────────────────────────

export interface ProductClientMatch {
  id: UUID;
  productId: UUID;
  archetypeId: UUID;
  matchStrength: number;
  isAvoidance: boolean;
  notes: string | null;
  assignedBy: UUID;
  createdAt: string;
  archetype?: ClientArchetype;
}

export interface ProductClientMatchInput {
  archetypeId: UUID;
  matchStrength?: number;
  isAvoidance?: boolean;
  notes?: string;
}

// ─── Material Compatibility ───────────────────────────────────────────────

export type MaterialCompatibilityLevel = 'excellent' | 'good' | 'caution' | 'avoid';

export interface MaterialCompatibility {
  id: UUID;
  materialA: string;
  materialB: string;
  compatibility: MaterialCompatibilityLevel;
  notes: string | null;
  createdAt: string;
}

// ─── Teaching Session ─────────────────────────────────────────────────────

export type TeachingMode = 'embedded' | 'quick_tags' | 'deep_analysis' | 'validation';

export interface TeachingSession {
  id: UUID;
  designerId: UUID;
  mode: TeachingMode;
  startedAt: string;
  completedAt: string | null;
  productsTaught: number;
  durationSeconds: number | null;
}

export interface TeachingSessionInput {
  mode: TeachingMode;
}

// ─── Teaching Queue ───────────────────────────────────────────────────────

export type TeachingPriority = 'high' | 'normal' | 'low';
export type TeachingStatus = 'pending' | 'in_progress' | 'needs_validation' | 'validated' | 'conflict';

export interface TeachingQueueItem {
  id: UUID;
  productId: UUID;
  priority: TeachingPriority;
  status: TeachingStatus;
  assignedTo: UUID | null;
  assignedAt: string | null;
  requiresDeepAnalysis: boolean;
  completenessScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeachingQueueItemWithProduct extends TeachingQueueItem {
  product: {
    id: UUID;
    name: string;
    images: string[];
    priceRetail: number | null;
  };
}

export interface TeachingQueueFilter {
  status?: TeachingStatus[];
  priority?: TeachingPriority[];
  assignedTo?: UUID;
  requiresDeepAnalysis?: boolean;
}

// ─── Validation ───────────────────────────────────────────────────────────

export type ValidationVote = 'confirm' | 'adjust' | 'flag';

export interface TeachingValidation {
  id: UUID;
  productId: UUID;
  validatorId: UUID;
  vote: ValidationVote;
  adjustments: ValidationAdjustments | null;
  flagReason: string | null;
  createdAt: string;
}

export interface ValidationAdjustments {
  primaryStyleId?: UUID;
  secondaryStyleId?: UUID;
  spectrum?: Partial<SpectrumValues>;
  clientMatches?: ProductClientMatchInput[];
  appealSignalIds?: UUID[];
  notes?: string;
}

export interface ValidationInput {
  vote: ValidationVote;
  adjustments?: ValidationAdjustments;
  flagReason?: string;
}

// ─── Designer Teaching Stats ──────────────────────────────────────────────

export interface DesignerTeachingStats {
  id: UUID;
  designerId: UUID;
  productsTaught: number;
  validationsCompleted: number;
  accuracyScore: number;
  consensusRate: number;
  totalTeachingMinutes: number;
  badges: Badge[];
  matchImpactCount: number;
  updatedAt: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  iconName: string;
  earnedAt: string;
}

export type BadgeType =
  | 'first_steps'        // Taught first 10 products
  | 'style_expert'       // 50+ products with 90%+ accuracy
  | 'validation_hero'    // 100+ validations
  | 'consensus_builder'  // 95%+ consensus rate
  | 'marathon_teacher'   // 10+ hours teaching time
  | 'impact_maker';      // Classifications led to 100+ matches

// ─── Teaching Impact ──────────────────────────────────────────────────────

export interface TeachingImpact {
  productId: UUID;
  productName: string;
  matchCount: number;
  lastMatchAt: string;
}

// ─── Full Teaching Data for a Product ─────────────────────────────────────

export interface ProductTeachingData {
  productId: UUID;

  // Style attribution
  primaryStyle: StyleArchetype | null;
  secondaryStyle: StyleArchetype | null;
  spectrum: SpectrumValues | null;

  // Client matching
  idealClients: ProductClientMatch[];
  avoidanceClients: ProductClientMatch[];

  // Appeal signals
  appealSignals: ProductAppealSignal[];

  // Validation status
  queueStatus: TeachingStatus;
  validationCount: number;
  consensusReached: boolean;

  // Meta
  completenessScore: number;
  lastUpdated: string;
}

export interface ProductTeachingInput {
  primaryStyleId?: UUID;
  secondaryStyleId?: UUID;
  spectrum?: Partial<SpectrumValues>;
  idealClientIds?: UUID[];
  avoidanceClientIds?: UUID[];
  appealSignalIds?: UUID[];
  notes?: string;
}
