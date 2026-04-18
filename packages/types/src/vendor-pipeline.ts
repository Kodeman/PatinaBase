// ============================================================================
// Vendor Pipeline Types
// Shared between admin-portal and Claude Cowork integration.
// Exported under `VendorPipeline` namespace from the package index because
// `Vendor` already exists in `./catalog`.
// ============================================================================

export type VendorStage =
  | 'discovery'
  | 'qualification'
  | 'outreach'
  | 'negotiation'
  | 'onboarding'
  | 'live'
  | 'paused'
  | 'rejected';

export type TriageLevel = 'green' | 'yellow' | 'orange' | 'red';

export type CoworkTaskType =
  | 'prospect_scan'
  | 'auto_score'
  | 'generate_brief'
  | 'draft_email'
  | 'ingest_feed'
  | 'normalize_data'
  | 'image_audit'
  | 'feed_sync'
  | 'rescore';

export type CoworkTaskStatus =
  | 'pending'
  | 'picked_up'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ScoreDimension = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type ScoredBy = 'cowork' | 'kody' | 'leah';

export interface Vendor {
  id: string;
  name: string;
  slug: string;
  website_url: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string;
  year_established: number | null;

  product_categories: string[];
  price_range_low: number | null;
  price_range_high: number | null;
  company_size: string | null;

  stage: VendorStage;
  stage_changed_at: string;

  total_score: number | null;
  triage_level: TriageLevel | null;
  has_hard_veto: boolean;
  veto_reason: string | null;

  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  primary_contact_role: string | null;

  trade_account_status: string | null;
  trade_discount_pct: number | null;
  payment_terms: string | null;
  drop_ship_capable: boolean | null;

  data_format: string | null;
  feed_url: string | null;
  feed_frequency: string | null;
  last_feed_sync_at: string | null;

  scored_by_kody: boolean;
  scored_by_leah: boolean;
  awaiting_leah_review: boolean;

  notes: string | null;
  leah_notes: string | null;
  source: string | null;

  created_at: string;
  updated_at: string;
}

export interface VendorScore {
  id: string;
  vendor_id: string;
  dimension: ScoreDimension;
  dimension_name: string;
  weight: number;
  raw_score: number | null;
  weighted_score: number | null;
  scored_by: ScoredBy;
  scored_at: string;
  evidence: string | null;
  data_sources: string[] | null;
}

export interface CoworkTask {
  id: string;
  task_type: CoworkTaskType;
  vendor_id: string | null;
  status: CoworkTaskStatus;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown>;
  output_files: string[] | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  picked_up_at: string | null;
  completed_at: string | null;
  is_recurring: boolean;
  cron_expression: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface VendorWithScores extends Vendor {
  scores: VendorScore[];
}

export interface VendorWithActivity extends VendorWithScores {
  cowork_tasks: CoworkTask[];
}

export interface PipelineMetrics {
  total_vendors: number;
  by_triage: Record<TriageLevel, number>;
  by_stage: Record<VendorStage, number>;
  awaiting_leah: number;
  active_cowork_tasks: number;
  live_partners: number;
}

export interface RubricDimensionDef {
  dimension: ScoreDimension;
  name: string;
  weight: number;
  owner: 'kody' | 'leah';
}

export const RUBRIC_DIMENSIONS: readonly RubricDimensionDef[] = [
  { dimension: 1, name: 'Drop-Ship Readiness', weight: 15, owner: 'kody' },
  { dimension: 2, name: 'Data Quality', weight: 15, owner: 'kody' },
  { dimension: 3, name: 'Margin Viability', weight: 15, owner: 'kody' },
  { dimension: 4, name: 'Channel Conflict', weight: 10, owner: 'kody' },
  { dimension: 5, name: 'Brand Alignment', weight: 12, owner: 'leah' },
  { dimension: 6, name: 'Category Coverage', weight: 10, owner: 'leah' },
  { dimension: 7, name: 'Sustainability & Craft', weight: 8, owner: 'leah' },
  { dimension: 8, name: 'Relationship Warmth', weight: 15, owner: 'leah' },
] as const;

export const TRIAGE_THRESHOLDS = {
  green: 400,
  yellow: 300,
  orange: 200,
  red: 0,
} as const;

export function computeTriageLevel(score: number): TriageLevel {
  if (score >= TRIAGE_THRESHOLDS.green) return 'green';
  if (score >= TRIAGE_THRESHOLDS.yellow) return 'yellow';
  if (score >= TRIAGE_THRESHOLDS.orange) return 'orange';
  return 'red';
}

export const VENDOR_STAGES: readonly VendorStage[] = [
  'discovery',
  'qualification',
  'outreach',
  'negotiation',
  'onboarding',
  'live',
  'paused',
  'rejected',
] as const;

export const ONBOARDING_PHASES: readonly VendorStage[] = [
  'discovery',
  'qualification',
  'outreach',
  'negotiation',
  'onboarding',
  'live',
] as const;
