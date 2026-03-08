import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Platform & Tier ─────────────────────────────────────────────────────

export const analyticsPlatformSchema = z.enum([
  'website',
  'extension',
  'portal',
  'ios',
  'planning',
]);

export const engagementTierSchema = z.enum(['minimal', 'low', 'medium', 'high']);

// ─── Event Names ─────────────────────────────────────────────────────────

export const websiteEventNameSchema = z.enum([
  'page_view',
  'cta_click',
  'waitlist_signup',
  'content_engagement',
]);

export const extensionEventNameSchema = z.enum([
  'extension_opened',
  'extraction_started',
  'extraction_completed',
  'extraction_failed',
  'product_saved',
  'vendor_saved',
  'capture_time',
  'field_edited',
  'mode_switch',
  'duplicate_detected',
]);

export const portalEventNameSchema = z.enum([
  'login',
  'signup',
  'logout',
  'product_create',
  'product_view',
  'product_update',
  'project_create',
  'project_view',
  'client_create',
  'client_view',
  'client_interaction',
  'vendor_search',
  'vendor_filter_change',
  'vendor_save',
  'vendor_view',
  'companion_open',
  'companion_close',
  'companion_query',
  'command_palette_open',
  'teaching_session_start',
  'teaching_session_complete',
  'nav_cta_click',
]);

export const iosEventNameSchema = z.enum([
  'app_open',
  'app_background',
  'room_scan_started',
  'room_scan_completed',
  'room_scan_abandoned',
  'feature_detected',
  'ar_view',
  'screen_view',
]);

export const planningEventNameSchema = z.enum([
  'feature_vote',
  'feedback_submit',
]);

export const analyticsEventNameSchema = z.union([
  websiteEventNameSchema,
  extensionEventNameSchema,
  portalEventNameSchema,
  iosEventNameSchema,
  planningEventNameSchema,
]);

// ─── UTM Params ──────────────────────────────────────────────────────────

export const utmParamsSchema = z.object({
  utmSource: z.string().nullable().optional(),
  utmMedium: z.string().nullable().optional(),
  utmCampaign: z.string().nullable().optional(),
  utmContent: z.string().nullable().optional(),
  utmTerm: z.string().nullable().optional(),
});

// ─── Touch Point ─────────────────────────────────────────────────────────

export const touchPointSchema = z.object({
  utmSource: z.string().nullable(),
  utmMedium: z.string().nullable(),
  utmCampaign: z.string().nullable(),
  utmContent: z.string().nullable(),
  utmTerm: z.string().nullable(),
  referrer: z.string(),
  landingPage: z.string(),
  timestamp: z.string().datetime(),
});

// ─── Attribution Data ────────────────────────────────────────────────────

export const attributionDataSchema = z.object({
  firstTouch: touchPointSchema.nullable(),
  lastTouch: touchPointSchema.nullable(),
  touchCount: z.number().int().min(0),
});

// ─── Engagement Event ────────────────────────────────────────────────────

export const engagementEventSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  posthogEventId: z.string().nullable(),
  eventName: z.string(),
  eventProperties: z.record(z.unknown()).nullable(),
  platform: analyticsPlatformSchema,
  createdAt: z.string().datetime(),
});

// ─── Waitlist Create ─────────────────────────────────────────────────────

export const waitlistCreateSchema = z.object({
  email: z.string().email(),
  source: z.string().min(1),
  role: z.enum(['designer', 'consumer', 'unknown']).optional().default('unknown'),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  utmTerm: z.string().optional(),
  referrer: z.string().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  signupPage: z.string().optional(),
  ctaText: z.string().optional(),
  posthogDistinctId: z.string().optional(),
  firstTouchAttribution: touchPointSchema.optional(),
  lastTouchAttribution: touchPointSchema.optional(),
});

// ─── Consent Preferences ────────────────────────────────────────────────

export const consentPreferencesSchema = z.object({
  necessary: z.literal(true),
  analytics: z.boolean(),
  marketing: z.boolean(),
  preferences: z.boolean(),
});

// ─── PostHog Config ──────────────────────────────────────────────────────

export const posthogConfigSchema = z.object({
  apiKey: z.string().min(1),
  host: z.string().url(),
  debug: z.boolean().optional(),
});

// ─── Type Exports ────────────────────────────────────────────────────────

export type AnalyticsPlatformZ = z.infer<typeof analyticsPlatformSchema>;
export type EngagementTierZ = z.infer<typeof engagementTierSchema>;
export type TouchPointZ = z.infer<typeof touchPointSchema>;
export type AttributionDataZ = z.infer<typeof attributionDataSchema>;
export type WaitlistCreateZ = z.infer<typeof waitlistCreateSchema>;
export type ConsentPreferencesZ = z.infer<typeof consentPreferencesSchema>;
export type PostHogConfigZ = z.infer<typeof posthogConfigSchema>;
