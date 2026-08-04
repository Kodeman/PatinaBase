import type { UUID } from './common';

export type ProductConfigurationMode =
  | 'standard'
  | 'variant'
  | 'configured'
  | 'custom';

export type ProductConfigurationPricingStrategy =
  | 'base_plus_adjustments'
  | 'component_sum';

export type ProductComponentHandedness = 'none' | 'left' | 'right' | 'either';

export type ProductOptionSelectionType = 'single' | 'multiple';

export interface ProductOptionValue {
  id: UUID;
  groupId: UUID;
  code: string;
  label: string;
  description?: string | null;
  swatch?: Record<string, unknown> | null;
  media?: Record<string, unknown>[];
  retailPriceDeltaCents: number;
  tradePriceDeltaCents: number;
  leadTimeDeltaWeeks: number;
  /** 00413 — the value accepts customer's-own-material (COM/COL). */
  allowsCom?: boolean;
  metadata: Record<string, unknown>;
  position: number;
  isActive: boolean;
}

export interface ProductOptionGroup {
  id: UUID;
  productId: UUID;
  code: string;
  name: string;
  description?: string | null;
  selectionType: ProductOptionSelectionType;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  position: number;
  values: ProductOptionValue[];
}

export interface ProductVariantDefinition {
  id: UUID;
  productId: UUID;
  code: string;
  name: string;
  sku?: string | null;
  vendorSku?: string | null;
  status: 'draft' | 'active' | 'discontinued';
  retailPriceCents?: number | null;
  tradePriceCents?: number | null;
  leadTimeWeeks?: number | null;
  dimensions?: Record<string, unknown> | null;
  weight?: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  isDefault: boolean;
  optionValueIds: UUID[];
}

export interface ProductComponentDefinition {
  id: UUID;
  productId: UUID;
  code: string;
  name: string;
  description?: string | null;
  componentType: 'module' | 'part' | 'service' | 'custom';
  handedness: ProductComponentHandedness;
  minQuantity: number;
  maxQuantity?: number | null;
  defaultQuantity: number;
  retailPriceCents: number;
  tradePriceCents: number;
  leadTimeWeeks: number;
  dimensions?: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  position: number;
  isActive: boolean;
}

export type ProductConfigurationRuleType =
  | 'compatibility'
  | 'requirement'
  | 'exclusion'
  | 'pricing'
  | 'lead_time'
  | 'dimension';

export interface ProductConfigurationRule {
  id: UUID;
  productId: UUID;
  code: string;
  name: string;
  ruleType: ProductConfigurationRuleType;
  condition: Record<string, unknown>;
  effect: Record<string, unknown>;
  message?: string | null;
  priority: number;
  isActive: boolean;
}

export interface ProductConfigurationDefinition {
  productId: UUID;
  productName?: string;
  mode: ProductConfigurationMode;
  pricingStrategy: ProductConfigurationPricingStrategy;
  revision: number;
  baseRetailPriceCents?: number | null;
  baseTradePriceCents?: number | null;
  baseLeadTimeWeeks?: number | null;
  baseDimensions?: Record<string, unknown> | null;
  summary?: ProductConfigurationSummary;
  optionGroups: ProductOptionGroup[];
  variants: ProductVariantDefinition[];
  components: ProductComponentDefinition[];
  rules: ProductConfigurationRule[];
}

export interface ProductConfigurationSummary {
  mode: ProductConfigurationMode;
  pricingStrategy: ProductConfigurationPricingStrategy;
  groupCount: number;
  valueCount: number;
  activeVariantCount: number;
  activeComponentCount: number;
  primaryGroupName?: string | null;
  primaryGroupValueCount: number;
  minRetailPriceCents?: number | null;
  maxRetailPriceCents?: number | null;
  minTradePriceCents?: number | null;
  maxTradePriceCents?: number | null;
  minLeadTimeWeeks?: number | null;
  maxLeadTimeWeeks?: number | null;
  priceOnRequest: boolean;
}

/**
 * One chosen option value, exactly as `evaluate_product_configuration` writes
 * it into the snapshot (00403, extended by 00413). The delta keys are the
 * value's own contribution — they are NOT the resolved price — and `allowsCom`
 * marks the value as a COM/COL slot the designer may fill with their own
 * fabric. This is the ONE selection vocabulary: picker → decisions → spec → PO.
 */
export interface ProductConfigurationSelection {
  optionGroupId: UUID;
  optionValueId: UUID;
  groupCode: string;
  valueCode: string;
  groupName: string;
  valueLabel: string;
  retailPriceDeltaCents: number;
  tradePriceDeltaCents: number;
  leadTimeDeltaWeeks: number;
  /** 00413 — the value accepts customer's-own-material. */
  allowsCom?: boolean;
}

export interface ProductConfigurationComponentSelection {
  componentId: UUID;
  code: string;
  name: string;
  quantity: number;
  handedness?: 'left' | 'right' | null;
  retailPriceCents: number;
  tradePriceCents: number;
  leadTimeWeeks?: number;
  dimensions?: Record<string, unknown> | null;
}

/**
 * The customer's-own-material fabric actually specified on a configuration
 * version (00413 `product_configurations.com_details`). Merged into the
 * snapshot BEFORE hashing, so it is part of the immutable commercial truth and
 * reaches the vendor PO.
 */
export interface ProductConfigurationComDetails {
  optionValueId?: UUID | null;
  fabricName?: string | null;
  mill?: string | null;
  pattern?: string | null;
  yardage?: number | string | null;
  railroaded?: boolean | null;
  shipTo?: string | null;
  sidemark?: string | null;
  secondLeadTimeWeeks?: number | null;
  notes?: string | null;
}

export interface ProductConfigurationSnapshot {
  productId: UUID;
  productName: string;
  configurationMode: ProductConfigurationMode;
  pricingStrategy: ProductConfigurationPricingStrategy;
  schemaRevision: number;
  variant: ProductVariantDefinition | null;
  selections: ProductConfigurationSelection[];
  components: ProductConfigurationComponentSelection[];
  retailPriceCents: number | null;
  tradePriceCents: number | null;
  leadTimeWeeks: number | null;
  dimensions: Record<string, unknown> | null;
  /** Present only when COM was specified on the configuration (00413). */
  comDetails?: ProductConfigurationComDetails | null;
  capturedAt: string;
}

export interface ProductConfigurationEvaluation {
  valid: boolean;
  complete: boolean;
  violations: string[];
  warnings: string[];
  normalizedSelection: Record<string, string[]>;
  componentQuantities: Record<string, number>;
  /** Per-component code → chosen quantity/handedness, keyed by component code. */
  componentState: Record<
    string,
    { quantity: number; handedness: 'left' | 'right' | null }
  >;
  matchedVariant: ProductVariantDefinition | null;
  retailPriceCents: number | null;
  tradePriceCents: number | null;
  leadTimeWeeks: number | null;
  dimensions: Record<string, unknown> | null;
  schemaRevision: number;
  snapshot: ProductConfigurationSnapshot;
}

export interface CustomCommissionMeasurement {
  label: string;
  value: number;
  unit: 'in' | 'ft' | 'mm' | 'cm' | 'm';
  source?: string;
  verifiedAt?: string;
}

export interface CustomCommissionAttachment {
  id?: UUID;
  name: string;
  url: string;
  mediaType?: string;
  revision?: string;
  uploadedAt?: string;
}

export interface CustomCommissionBrief {
  summary: string;
  intent?: string;
  siteConditions?: string;
  measurements?: CustomCommissionMeasurement[];
  requirements?: string[];
  materials?: string[];
  finish?: string;
  fabricatorVendorId?: UUID;
  fabricatorName?: string;
  budgetCents?: number;
  allowanceCents?: number;
  priceOnRequest?: boolean;
  targetDate?: string;
  drawings?: CustomCommissionAttachment[];
  notes?: string;
  designerApproval?: {
    status: 'pending' | 'approved' | 'rejected';
    approvedBy?: UUID;
    approvedAt?: string;
    note?: string;
  };
  clientApproval?: {
    status: 'not_required' | 'pending' | 'approved' | 'rejected';
    approvedBy?: UUID;
    approvedAt?: string;
    note?: string;
  };
}

export type CustomCommissionRevisionStatus =
  | 'draft'
  | 'submitted'
  | 'quoted'
  | 'client_review'
  | 'approved'
  | 'issued'
  | 'rejected'
  | 'superseded';

export interface CustomCommissionQuote {
  vendorId?: UUID | null;
  quoteNumber?: string | null;
  retailPriceCents?: number | null;
  tradePriceCents?: number | null;
  currency?: string;
  leadTimeWeeks?: number | null;
  validUntil?: string | null;
  receivedAt?: string | null;
}

export interface CustomCommissionRevision {
  id: UUID;
  configurationId: UUID;
  productId: UUID;
  configurationVersion: number;
  name: string | null;
  projectId: UUID | null;
  snapshot: ProductConfigurationSnapshot;
  snapshotHash: string;
  revisionNumber: number;
  previousRevisionId?: UUID | null;
  status: CustomCommissionRevisionStatus;
  brief: CustomCommissionBrief;
  drawings: CustomCommissionAttachment[];
  quote: CustomCommissionQuote;
  provenance: Record<string, unknown>;
  transitionNote?: string | null;
  createdBy?: UUID | null;
  approvedBy?: UUID | null;
  submittedAt?: string | null;
  quotedAt?: string | null;
  approvedAt?: string | null;
  issuedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CustomCommissionMilestoneType =
  | 'submittal'
  | 'receiving'
  | 'installed';

export type CustomCommissionMilestoneStatus =
  | 'pending'
  | 'approved'
  | 'received'
  | 'installed'
  | 'rejected';

export interface CustomCommissionMilestoneEvent {
  id: UUID;
  eventNumber: number;
  fromStatus?: CustomCommissionMilestoneStatus | null;
  toStatus: CustomCommissionMilestoneStatus;
  evidence: Record<string, unknown>;
  artifacts: CustomCommissionAttachment[];
  note?: string | null;
  actorId?: UUID | null;
  createdAt: string;
}

export interface CustomCommissionMilestone {
  id: UUID;
  configurationId: UUID;
  revisionId: UUID;
  projectId: UUID;
  milestoneType: CustomCommissionMilestoneType;
  status: CustomCommissionMilestoneStatus;
  evidence: Record<string, unknown>;
  artifacts: CustomCommissionAttachment[];
  createdBy?: UUID | null;
  completedBy?: UUID | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  sourceChanged: boolean;
  currentSchemaRevision: number;
  events: CustomCommissionMilestoneEvent[];
}

export interface RecordCustomCommissionMilestoneInput {
  configurationId: UUID;
  milestoneType: CustomCommissionMilestoneType;
  status: CustomCommissionMilestoneStatus;
  evidence: Record<string, unknown>;
  artifacts?: CustomCommissionAttachment[];
  note?: string;
}

export interface SavedProductConfiguration {
  id: UUID;
  configurationKey: UUID;
  productId: UUID;
  productVariantId?: UUID | null;
  previousConfigurationId?: UUID | null;
  projectId?: UUID | null;
  ffeItemId?: UUID | null;
  ownerUserId: UUID;
  studioId?: UUID | null;
  version: number;
  schemaRevision: number;
  currentSchemaRevision?: number;
  sourceChanged?: boolean;
  status: 'saved' | 'approved' | 'issued' | 'superseded' | 'archived';
  name?: string | null;
  notes?: string | null;
  customBrief?: CustomCommissionBrief | null;
  evaluation: ProductConfigurationEvaluation;
  snapshot: ProductConfigurationSnapshot;
  snapshotHash: string;
  isLibraryTemplate: boolean;
  approvedAt?: string | null;
  issuedAt?: string | null;
  promotedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluateProductConfigurationInput {
  productId: UUID;
  variantId?: UUID | null;
  optionValueIds: UUID[];
  components: Array<{
    componentId: UUID;
    quantity: number;
    handedness?: 'left' | 'right' | null;
  }>;
}

export interface SaveProductConfigurationInput {
  productId: UUID;
  configurationId?: UUID;
  expectedVersion?: number;
  projectId?: UUID;
  ffeItemId?: UUID;
  name?: string;
  notes?: string;
  variantId?: UUID | null;
  selections: Record<string, UUID[]>;
  components: Array<{
    componentId: UUID;
    quantity: number;
    handedness?: 'left' | 'right' | null;
  }>;
  customBrief?: CustomCommissionBrief;
}

export interface PlaceProductConfigurationInput {
  projectId: UUID;
  configurationId: UUID;
  roomId?: UUID;
  slotId?: UUID;
  category?: string;
  source?: Record<string, unknown>;
}

export interface InstantiateProductConfigurationTemplateInput {
  templateConfigurationId: UUID;
  projectId: UUID;
  name?: string;
}

export interface ReviseProjectFFEConfigurationInput {
  projectId: UUID;
  ffeItemId: UUID;
  expectedConfigurationId: UUID;
  expectedConfigurationVersion: number;
  expectedSnapshotHash: string;
  newConfigurationId: UUID;
  expectedNewVersion: number;
}

export interface ReviseProjectFFEConfigurationResult {
  projectId: UUID;
  ffeItemId: UUID;
  specId: UUID;
  configurationId: UUID;
  configurationVersion: number;
  configurationSnapshotHash: string;
  status: 'specified';
  requiresApproval: true;
}

export interface UpsertProductConfigurationDefinitionInput {
  mode: ProductConfigurationMode;
  pricingStrategy: ProductConfigurationPricingStrategy;
  expectedRevision?: number;
  optionGroups: Array<
    Omit<ProductOptionGroup, 'id' | 'productId' | 'values'> & {
      id?: UUID;
      values: Array<Omit<ProductOptionValue, 'id' | 'groupId'> & { id?: UUID }>;
    }
  >;
  variants: Array<Omit<ProductVariantDefinition, 'id' | 'productId'> & { id?: UUID }>;
  components: Array<Omit<ProductComponentDefinition, 'id' | 'productId'> & { id?: UUID }>;
  rules: Array<Omit<ProductConfigurationRule, 'id' | 'productId'> & { id?: UUID }>;
}

export interface ApproveProductConfigurationInput {
  configurationId: UUID;
  expectedVersion?: number;
}

export interface PromoteConfigurationToLibraryInput {
  configurationId: UUID;
  name?: string;
}

export interface ProductConfigurationMutationResult {
  configuration: SavedProductConfiguration;
  forkedFromConfigurationId?: UUID | null;
  customRevision?: CustomCommissionRevision | null;
}

export interface CreateCustomCommissionRevisionInput {
  configurationId: UUID;
  brief: CustomCommissionBrief;
  drawings?: CustomCommissionAttachment[];
  quote?: CustomCommissionQuote;
  provenance?: Record<string, unknown>;
}

export interface TransitionCustomCommissionRevisionInput {
  revisionId: UUID;
  targetStatus: CustomCommissionRevisionStatus;
  note?: string;
  quote?: CustomCommissionQuote;
  approval?: {
    designerApproved?: boolean;
    clientApproved?: boolean;
  };
}

export interface PrepareConfigurationQuoteRequestInput {
  configurationId: UUID;
  vendorId: UUID;
  scope?: string;
  timeline?: string;
  message?: string;
}

export interface PreparedConfigurationQuoteRequest {
  id: UUID;
  configurationId: UUID;
  projectId: UUID;
  vendorId: UUID;
  designerId: UUID;
  status: 'draft';
  configurationSnapshot: ProductConfigurationSnapshot;
  configurationSnapshotHash: string;
  scope?: string | null;
  timeline?: string | null;
  message?: string | null;
  createdAt: string;
  updatedAt: string;
}
