// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS TYPES
// Cross-platform engagement tracking for PostHog integration
// ═══════════════════════════════════════════════════════════════════════════

import type { UUID } from './common';

// ─── Platform & Tier ─────────────────────────────────────────────────────

export type AnalyticsPlatform = 'website' | 'extension' | 'portal' | 'ios' | 'planning';

export type EngagementTier = 'minimal' | 'low' | 'medium' | 'high';

// ─── Event Names Per Surface ─────────────────────────────────────────────

export type WebsiteEventName =
  | 'page_view'
  | 'cta_click'
  | 'waitlist_signup'
  | 'content_engagement';

export type ExtensionEventName =
  | 'extension_opened'
  | 'extraction_started'
  | 'extraction_completed'
  | 'extraction_failed'
  | 'product_saved'
  | 'vendor_saved'
  | 'capture_time'
  | 'field_edited'
  | 'mode_switch'
  | 'duplicate_detected';

export type PortalEventName =
  | 'login'
  | 'signup'
  | 'logout'
  | 'product_create'
  | 'product_view'
  | 'product_update'
  | 'project_create'
  | 'project_view'
  | 'client_create'
  | 'client_view'
  | 'client_interaction'
  | 'vendor_search'
  | 'vendor_filter_change'
  | 'vendor_save'
  | 'vendor_view'
  | 'companion_open'
  | 'companion_close'
  | 'companion_query'
  | 'command_palette_open'
  | 'teaching_session_start'
  | 'teaching_session_complete'
  | 'nav_cta_click';

export type IOSEventName =
  | 'app_open'
  | 'app_background'
  | 'room_scan_started'
  | 'room_scan_completed'
  | 'room_scan_abandoned'
  | 'feature_detected'
  | 'ar_view'
  | 'screen_view';

export type PlanningEventName =
  | 'feature_vote'
  | 'feedback_submit';

export type AnalyticsEventName =
  | WebsiteEventName
  | ExtensionEventName
  | PortalEventName
  | IOSEventName
  | PlanningEventName;

// ─── Engagement Event ────────────────────────────────────────────────────

export interface EngagementEvent {
  id: UUID;
  userId: UUID;
  posthogEventId: string | null;
  eventName: AnalyticsEventName;
  eventProperties: Record<string, unknown> | null;
  platform: AnalyticsPlatform;
  createdAt: string;
}

// ─── Engagement Score ────────────────────────────────────────────────────

export interface EngagementScore {
  id: UUID;
  email: string;
  role: string;
  currentScore: number;
  lastActiveAt: string | null;
  engagementTier: EngagementTier;
}

// ─── Attribution ─────────────────────────────────────────────────────────

export interface TouchPoint {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrer: string;
  landingPage: string;
  timestamp: string;
}

export interface AttributionData {
  firstTouch: TouchPoint | null;
  lastTouch: TouchPoint | null;
  touchCount: number;
}

// ─── Waitlist ────────────────────────────────────────────────────────────

export interface WaitlistEntry {
  id: UUID;
  email: string;
  source: string;
  role: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrer: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  signupPage: string | null;
  ctaText: string | null;
  posthogDistinctId: string | null;
  firstTouchAttribution: TouchPoint | null;
  lastTouchAttribution: TouchPoint | null;
  createdAt: string;
  updatedAt: string;
  convertedAt: string | null;
  authUserId: UUID | null;
}

export interface WaitlistCreateInput {
  email: string;
  source: string;
  role?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
  signupPage?: string;
  ctaText?: string;
  posthogDistinctId?: string;
  firstTouchAttribution?: TouchPoint;
  lastTouchAttribution?: TouchPoint;
}

// ─── Consent ─────────────────────────────────────────────────────────────

export interface ConsentPreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}

// ─── PostHog Config ──────────────────────────────────────────────────────

export interface PostHogConfig {
  apiKey: string;
  host: string;
  debug?: boolean;
}

// ─── Funnel ──────────────────────────────────────────────────────────────

export interface FunnelStep {
  step: string;
  stepOrder: number;
  usersAtStep: number;
  usersAtPreviousStep: number | null;
  conversionRatePercent: number | null;
}
