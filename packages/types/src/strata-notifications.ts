import type { UUID } from './common';

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * All notification types in the system.
 * Grouped by domain for readability.
 */
export type NotificationType =
  // Account & Security (always sent)
  | 'account_verification'
  | 'password_reset'
  | 'security_alert'
  // Lead Management (designer)
  | 'new_lead_designer'
  | 'lead_expiring'
  | 'lead_response'
  // Client Communication
  | 'client_confirmation'
  | 'client_message'
  | 'project_milestone'
  | 'commission_earned'
  // Orders & Payments
  | 'order_confirmation'
  | 'payment_receipt'
  // Catalog Intelligence
  | 'new_products'
  | 'teaching_reminder'
  // Consumer Engagement
  | 'price_drop'
  | 'back_in_stock'
  | 'wishlist_update'
  // Marketing & Campaigns
  | 'weekly_inspiration'
  | 'founding_circle_update'
  | 'product_launch'
  | 'seasonal_campaign'
  | 'maker_spotlight'
  | 'reengagement'
  // Sequences
  | 'welcome_series'
  | 'designer_onboarding';

export type NotificationChannel = 'email' | 'push' | 'in_app' | 'sms';

export type NotificationStatus =
  | 'queued'
  | 'sending'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'failed'
  | 'suppressed';

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

export type DigestFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'never';

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════

export interface NotificationPreferences {
  id: UUID;
  user_id: UUID;

  // Channel toggles
  channels_email: boolean;
  channels_push: boolean;
  channels_in_app: boolean;
  channels_sms: boolean;

  // Lead management
  type_new_lead: boolean;
  type_lead_expiring: boolean;
  type_lead_response: boolean;

  // Client communication
  type_client_message: boolean;
  type_project_milestone: boolean;
  type_commission_earned: boolean;

  // Catalog intelligence
  type_new_products: boolean;
  type_teaching_reminder: boolean;

  // Consumer
  type_price_drop: boolean;
  type_back_in_stock: boolean;
  type_wishlist_update: boolean;

  // Account (always on)
  type_account_security: boolean;
  type_order_confirmation: boolean;
  type_payment_receipt: boolean;

  // Marketing
  type_weekly_inspiration: boolean;
  type_founding_circle: boolean;
  type_product_launch: boolean;
  type_seasonal_campaign: boolean;
  type_reengagement: boolean;

  // Digest
  digest_frequency: DigestFrequency;

  // Quiet hours
  quiet_hours_enabled: boolean;
  quiet_hours_start: string; // HH:MM format
  quiet_hours_end: string;
  timezone: string;

  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION LOG
// ═══════════════════════════════════════════════════════════════════════════

export interface NotificationLog {
  id: UUID;
  user_id: UUID;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  provider_id: string | null;
  template_id: string | null;
  metadata: Record<string, unknown>;
  error: string | null;
  retry_count: number;
  opened_at: string | null;
  clicked_at: string | null;
  sent_at: string | null;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPATCH TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface NotifyOptions {
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  metadata?: Record<string, unknown>;
  deduplication_key?: string;
}

export interface NotificationResult {
  success: boolean;
  notification_id?: UUID;
  channel: NotificationChannel;
  error?: string;
}

export interface NotificationJob {
  user_id: UUID;
  type: NotificationType;
  channel: NotificationChannel;
  template_id: string;
  data: Record<string, unknown>;
  priority: NotificationPriority;
}

// ═══════════════════════════════════════════════════════════════════════════
// CAMPAIGN TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'archived';
export type AudienceType = 'all' | 'segment' | 'individual';

export interface Campaign {
  id: UUID;
  name: string;
  subject: string;
  preview_text: string | null;
  template_id: string;
  template_data: Record<string, unknown>;
  audience_type: AudienceType;
  audience_segment: Record<string, unknown> | null;
  status: CampaignStatus;
  scheduled_for: string | null;
  sent_at: string | null;
  total_recipients: number;
  created_by: UUID;
  created_at: string;
  updated_at: string;
  // Extended fields (00047)
  content_json: Record<string, unknown>;
  audience_segment_id: UUID | null;
  audience_snapshot: Record<string, unknown> | null;
  email_template_id: UUID | null;
  // A/B testing
  ab_enabled: boolean;
  ab_subject_b: string | null;
  ab_split_pct: number;
  ab_winner: 'a' | 'b' | null;
  ab_decided_at: string | null;
  // Inline counters
  sent_count: number;
  open_count: number;
  click_count: number;
  bounce_count: number;
  unsubscribe_count: number;
  // Joined
  campaign_analytics?: CampaignAnalytics;
}

export interface CampaignAnalytics {
  campaign_id: UUID;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  bounced: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type EmailTemplateCategory = 'transactional' | 'engagement' | 'campaign' | 'sequence';

export interface EmailTemplate {
  id: UUID;
  slug: string;
  name: string;
  description: string | null;
  category: EmailTemplateCategory;
  subject_default: string | null;
  content_blocks: ContentBlock[];
  html_content: string;
  variables: string[];
  thumbnail_url: string | null;
  is_active: boolean;
  created_by: UUID | null;
  created_at: string;
  updated_at: string;
}

export type ContentBlockType =
  | 'header'
  | 'hero'
  | 'text_block'
  | 'divider'
  | 'product_card'
  | 'product_grid'
  | 'cta_button'
  | 'notification'
  | 'maker_spotlight'
  | 'footer';

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  props: Record<string, unknown>;
}

// ─── Typed Block Props ──────────────────────────────────────────────────

export interface HeaderBlockProps {
  tagline: string;
}

export interface HeroBlockProps {
  greeting: string;
  headline: string;
  subline: string;
}

export interface TextBlockProps {
  text: string;
  align: 'left' | 'center' | 'right';
}

export interface DividerBlockProps {
  variant: 'subtle' | 'gold';
}

export interface ProductCardProps {
  image_url: string;
  provenance: string;
  product_name: string;
  description: string;
  price: string;
  style_match: string;
  product_url: string;
}

export interface ProductGridProduct {
  image_url: string;
  provenance: string;
  product_name: string;
  description: string;
  price: string;
  style_match: string;
  product_url: string;
}

export interface ProductGridProps {
  products: ProductGridProduct[];
}

export interface CtaButtonProps {
  text: string;
  url: string;
  supporting_text: string;
  variant: 'primary' | 'dark';
}

export interface NotificationBlockProps {
  badge_label: string;
  headline: string;
  body: string;
  details: Array<{ key: string; value: string }>;
  cta_text: string;
  cta_url: string;
}

export interface MakerSpotlightProps {
  portrait_url: string;
  maker_name: string;
  story: string;
  link_text: string;
  link_url: string;
}

export interface FooterBlockProps {
  nav_links: Array<{ label: string; url: string }>;
  compliance_text: string;
}

// ─── Discriminated Union ────────────────────────────────────────────────

export type TypedContentBlock =
  | { id: string; type: 'header'; props: HeaderBlockProps }
  | { id: string; type: 'hero'; props: HeroBlockProps }
  | { id: string; type: 'text_block'; props: TextBlockProps }
  | { id: string; type: 'divider'; props: DividerBlockProps }
  | { id: string; type: 'product_card'; props: ProductCardProps }
  | { id: string; type: 'product_grid'; props: ProductGridProps }
  | { id: string; type: 'cta_button'; props: CtaButtonProps }
  | { id: string; type: 'notification'; props: NotificationBlockProps }
  | { id: string; type: 'maker_spotlight'; props: MakerSpotlightProps }
  | { id: string; type: 'footer'; props: FooterBlockProps };

// ═══════════════════════════════════════════════════════════════════════════
// AUDIENCE SEGMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SegmentOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'not_contains'
  | 'in' | 'not_in'
  | 'is_set' | 'is_not_set'
  | 'older_than' | 'newer_than';

export type SegmentField =
  | 'role'
  | 'founding_circle'
  | 'engagement_score'
  | 'engagement_tier'
  | 'last_active_at'
  | 'created_at'
  | 'channels_email'
  | 'city'
  | 'state'
  | 'country'
  | 'has_completed_quiz'
  | 'has_active_project'
  | 'total_orders'
  | 'total_spent'
  | 'last_purchase_at';

export interface SegmentRule {
  field: SegmentField;
  operator: SegmentOperator;
  value: unknown;
}

export interface SegmentRules {
  logic: 'and' | 'or';
  conditions: SegmentRule[];
}

export interface AudienceSegment {
  id: UUID;
  name: string;
  description: string | null;
  rules: SegmentRules;
  estimated_size: number;
  is_preset: boolean;
  created_by: UUID | null;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTOMATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SequenceStatus = 'draft' | 'active' | 'paused' | 'archived';

export type SequenceTriggerType =
  | 'account_created'
  | 'style_quiz_completed'
  | 'consultation_completed'
  | 'purchase_completed'
  | 'no_activity'
  | 'abandoned_scan';

export interface SequenceTriggerConfig {
  type: SequenceTriggerType;
  conditions: SegmentRule[];
}

export type SequenceStepType = 'email' | 'wait' | 'condition' | 'end';

export interface SequenceStep {
  id: string;
  type: SequenceStepType;
  config: Record<string, unknown>;
}

export interface AutomatedSequence {
  id: UUID;
  name: string;
  description: string | null;
  trigger_event: string;
  emails: SequenceEmail[];
  status: SequenceStatus;
  created_by: UUID | null;
  created_at: string;
  updated_at: string;
  // Extended fields (00048)
  trigger_config: SequenceTriggerConfig;
  steps_json: SequenceStep[];
  total_enrolled: number;
  total_completed: number;
  total_emails_sent: number;
}

export interface SequenceEmail {
  step: number;
  template_id: string;
  delay_days: number;
  subject: string;
}

export interface SequenceStepHistory {
  step: number;
  type: SequenceStepType;
  completed_at: string;
  result: 'sent' | 'skipped' | 'branched_yes' | 'branched_no';
}

export interface SequenceEnrollment {
  id: UUID;
  sequence_id: UUID;
  user_id: UUID;
  current_step: number;
  next_send_at: string | null;
  next_step_at: string | null;
  step_history: SequenceStepHistory[];
  status: 'active' | 'completed' | 'unsubscribed';
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAPS & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps NotificationType → preference column name.
 * Account/transactional types are always enabled (not in this map).
 */
export const NOTIFICATION_TYPE_TO_PREFERENCE: Partial<Record<NotificationType, keyof NotificationPreferences>> = {
  new_lead_designer: 'type_new_lead',
  lead_expiring: 'type_lead_expiring',
  lead_response: 'type_lead_response',
  client_message: 'type_client_message',
  project_milestone: 'type_project_milestone',
  commission_earned: 'type_commission_earned',
  new_products: 'type_new_products',
  teaching_reminder: 'type_teaching_reminder',
  price_drop: 'type_price_drop',
  back_in_stock: 'type_back_in_stock',
  wishlist_update: 'type_wishlist_update',
  weekly_inspiration: 'type_weekly_inspiration',
  founding_circle_update: 'type_founding_circle',
  product_launch: 'type_product_launch',
  seasonal_campaign: 'type_seasonal_campaign',
  reengagement: 'type_reengagement',
};

/** Transactional types that bypass preference checks and quiet hours. */
export const TRANSACTIONAL_TYPES: NotificationType[] = [
  'account_verification',
  'password_reset',
  'security_alert',
  'order_confirmation',
  'payment_receipt',
];
