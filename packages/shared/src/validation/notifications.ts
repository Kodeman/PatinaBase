import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const notificationTypeSchema = z.enum([
  'account_verification',
  'password_reset',
  'security_alert',
  'new_lead_designer',
  'lead_expiring',
  'lead_response',
  'client_confirmation',
  'client_message',
  'project_milestone',
  'commission_earned',
  'order_confirmation',
  'payment_receipt',
  'new_products',
  'teaching_reminder',
  'price_drop',
  'back_in_stock',
  'wishlist_update',
  'weekly_inspiration',
  'founding_circle_update',
  'product_launch',
  'seasonal_campaign',
  'maker_spotlight',
  'reengagement',
  'welcome_series',
  'designer_onboarding',
]);

export const notificationChannelSchema = z.enum(['email', 'push', 'in_app', 'sms']);

export const notificationStatusSchema = z.enum([
  'queued', 'sending', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'suppressed',
]);

export const notificationPrioritySchema = z.enum(['critical', 'high', 'normal', 'low']);

export const digestFrequencySchema = z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'never']);

// ─── Preference update schema ────────────────────────────────────────────

export const notificationPreferencesUpdateSchema = z.object({
  channels_email: z.boolean().optional(),
  channels_push: z.boolean().optional(),
  channels_in_app: z.boolean().optional(),
  channels_sms: z.boolean().optional(),

  type_new_lead: z.boolean().optional(),
  type_lead_expiring: z.boolean().optional(),
  type_lead_response: z.boolean().optional(),
  type_client_message: z.boolean().optional(),
  type_project_milestone: z.boolean().optional(),
  type_commission_earned: z.boolean().optional(),
  type_new_products: z.boolean().optional(),
  type_teaching_reminder: z.boolean().optional(),
  type_price_drop: z.boolean().optional(),
  type_back_in_stock: z.boolean().optional(),
  type_wishlist_update: z.boolean().optional(),
  type_weekly_inspiration: z.boolean().optional(),
  type_founding_circle: z.boolean().optional(),
  type_product_launch: z.boolean().optional(),
  type_seasonal_campaign: z.boolean().optional(),
  type_reengagement: z.boolean().optional(),

  digest_frequency: digestFrequencySchema.optional(),

  quiet_hours_enabled: z.boolean().optional(),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
  timezone: z.string().min(1).optional(),
});

export type NotificationPreferencesUpdate = z.infer<typeof notificationPreferencesUpdateSchema>;

// ─── Notification dispatch payload ───────────────────────────────────────

export const notificationDispatchSchema = z.object({
  user_id: z.string().uuid(),
  type: notificationTypeSchema,
  channel: notificationChannelSchema,
  template_id: z.string().min(1),
  data: z.record(z.unknown()),
  priority: notificationPrioritySchema.optional().default('normal'),
});

export type NotificationDispatchPayload = z.infer<typeof notificationDispatchSchema>;

// ─── Campaign schemas ────────────────────────────────────────────────────

export const campaignStatusSchema = z.enum(['draft', 'scheduled', 'sending', 'sent', 'cancelled', 'archived']);
export const audienceTypeSchema = z.enum(['all', 'segment', 'individual']);

export const campaignCreateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(200),
  preview_text: z.string().max(200).optional(),
  template_id: z.string().min(1),
  template_data: z.record(z.unknown()).optional().default({}),
  audience_type: audienceTypeSchema,
  audience_segment: z.record(z.unknown()).optional(),
  scheduled_for: z.string().datetime().optional(),
  // Extended fields
  content_json: z.record(z.unknown()).optional(),
  audience_segment_id: z.string().uuid().optional(),
  email_template_id: z.string().uuid().optional(),
  ab_enabled: z.boolean().optional(),
  ab_subject_b: z.string().max(200).optional(),
  ab_split_pct: z.number().int().min(10).max(90).optional(),
});

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;

export const campaignUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(200).optional(),
  preview_text: z.string().max(200).optional().nullable(),
  template_id: z.string().min(1).optional(),
  template_data: z.record(z.unknown()).optional(),
  audience_type: audienceTypeSchema.optional(),
  audience_segment: z.record(z.unknown()).optional().nullable(),
  status: campaignStatusSchema.optional(),
  scheduled_for: z.string().datetime().optional().nullable(),
  content_json: z.record(z.unknown()).optional(),
  audience_segment_id: z.string().uuid().optional().nullable(),
  email_template_id: z.string().uuid().optional().nullable(),
  ab_enabled: z.boolean().optional(),
  ab_subject_b: z.string().max(200).optional().nullable(),
  ab_split_pct: z.number().int().min(10).max(90).optional(),
});

export type CampaignUpdateInput = z.infer<typeof campaignUpdateSchema>;

// ─── Email template schemas ──────────────────────────────────────────────

export const emailTemplateCategorySchema = z.enum(['transactional', 'engagement', 'campaign', 'sequence']);

export const contentBlockTypeSchema = z.enum([
  'header', 'hero', 'text_block', 'divider', 'product_card',
  'product_grid', 'cta_button', 'notification', 'maker_spotlight', 'footer',
]);

export const contentBlockSchema = z.object({
  id: z.string(),
  type: contentBlockTypeSchema,
  props: z.record(z.unknown()),
});

// ─── Per-block prop schemas ─────────────────────────────────────────────

export const headerBlockPropsSchema = z.object({
  tagline: z.string(),
});

export const heroBlockPropsSchema = z.object({
  greeting: z.string(),
  headline: z.string(),
  subline: z.string(),
});

export const textBlockPropsSchema = z.object({
  text: z.string(),
  align: z.enum(['left', 'center', 'right']),
});

export const dividerBlockPropsSchema = z.object({
  variant: z.enum(['subtle', 'gold']),
});

export const productCardPropsSchema = z.object({
  image_url: z.string(),
  provenance: z.string(),
  product_name: z.string(),
  description: z.string(),
  price: z.string(),
  style_match: z.string(),
  product_url: z.string(),
});

export const productGridProductSchema = z.object({
  image_url: z.string(),
  provenance: z.string(),
  product_name: z.string(),
  description: z.string(),
  price: z.string(),
  style_match: z.string(),
  product_url: z.string(),
});

export const productGridPropsSchema = z.object({
  products: z.array(productGridProductSchema),
});

export const ctaButtonPropsSchema = z.object({
  text: z.string(),
  url: z.string(),
  supporting_text: z.string(),
  variant: z.enum(['primary', 'dark']),
});

export const notificationBlockPropsSchema = z.object({
  badge_label: z.string(),
  headline: z.string(),
  body: z.string(),
  details: z.array(z.object({ key: z.string(), value: z.string() })),
  cta_text: z.string(),
  cta_url: z.string(),
});

export const makerSpotlightPropsSchema = z.object({
  portrait_url: z.string(),
  maker_name: z.string(),
  story: z.string(),
  link_text: z.string(),
  link_url: z.string(),
});

export const footerBlockPropsSchema = z.object({
  nav_links: z.array(z.object({ label: z.string(), url: z.string() })),
  compliance_text: z.string(),
});

export const emailTemplateCreateSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  category: emailTemplateCategorySchema,
  subject_default: z.string().max(200).optional(),
  content_blocks: z.array(contentBlockSchema).optional().default([]),
  html_content: z.string().optional(),
  variables: z.array(z.string()).optional().default([]),
});

export type EmailTemplateCreateInput = z.infer<typeof emailTemplateCreateSchema>;

export const emailTemplateUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  category: emailTemplateCategorySchema.optional(),
  subject_default: z.string().max(200).optional().nullable(),
  content_blocks: z.array(contentBlockSchema).optional(),
  html_content: z.string().optional(),
  variables: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

export type EmailTemplateUpdateInput = z.infer<typeof emailTemplateUpdateSchema>;

// ─── Audience segment schemas ────────────────────────────────────────────

export const segmentOperatorSchema = z.enum([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'contains', 'not_contains', 'in', 'not_in',
  'is_set', 'is_not_set', 'older_than', 'newer_than',
]);

export const segmentFieldSchema = z.enum([
  'role', 'founding_circle', 'engagement_score', 'engagement_tier',
  'last_active_at', 'created_at', 'channels_email', 'city', 'state',
  'country', 'has_completed_quiz', 'has_active_project', 'total_orders',
  'total_spent', 'last_purchase_at',
]);

export const segmentRuleSchema = z.object({
  field: segmentFieldSchema,
  operator: segmentOperatorSchema,
  value: z.unknown(),
});

export const segmentRulesSchema = z.object({
  logic: z.enum(['and', 'or']),
  conditions: z.array(segmentRuleSchema),
});

export const audienceSegmentCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  rules: segmentRulesSchema,
});

export type AudienceSegmentCreateInput = z.infer<typeof audienceSegmentCreateSchema>;

export const audienceSegmentUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  rules: segmentRulesSchema.optional(),
});

export type AudienceSegmentUpdateInput = z.infer<typeof audienceSegmentUpdateSchema>;

// ─── Automation sequence schemas ─────────────────────────────────────────

export const sequenceStatusSchema = z.enum(['draft', 'active', 'paused', 'archived']);

export const sequenceTriggerTypeSchema = z.enum([
  'account_created', 'style_quiz_completed', 'consultation_completed',
  'purchase_completed', 'no_activity', 'abandoned_scan',
]);

export const sequenceTriggerConfigSchema = z.object({
  type: sequenceTriggerTypeSchema,
  conditions: z.array(segmentRuleSchema).optional().default([]),
});

export const sequenceStepTypeSchema = z.enum(['email', 'wait', 'condition', 'end']);

export const sequenceStepSchema = z.object({
  id: z.string(),
  type: sequenceStepTypeSchema,
  config: z.record(z.unknown()),
});

export const automatedSequenceCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  trigger_config: sequenceTriggerConfigSchema,
  steps_json: z.array(sequenceStepSchema).optional().default([]),
});

export type AutomatedSequenceCreateInput = z.infer<typeof automatedSequenceCreateSchema>;

export const automatedSequenceUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  trigger_config: sequenceTriggerConfigSchema.optional(),
  steps_json: z.array(sequenceStepSchema).optional(),
  status: sequenceStatusSchema.optional(),
});

export type AutomatedSequenceUpdateInput = z.infer<typeof automatedSequenceUpdateSchema>;

// ─── Resend webhook event schema ─────────────────────────────────────────

export const resendWebhookEventSchema = z.object({
  type: z.enum([
    'email.sent',
    'email.delivered',
    'email.opened',
    'email.clicked',
    'email.bounced',
    'email.complained',
  ]),
  data: z.object({
    email_id: z.string(),
    to: z.array(z.string()).optional(),
    from: z.string().optional(),
    created_at: z.string().optional(),
  }).passthrough(),
});

export type ResendWebhookEvent = z.infer<typeof resendWebhookEventSchema>;
