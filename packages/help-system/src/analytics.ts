/**
 * @patina/help-system · Analytics taxonomy — THE TAXONOMY OF RECORD.
 *
 * Every analytics event the help system fires is named here, once. Components
 * import `HELP_EVENTS.*` rather than repeating raw string literals, and all
 * capture calls route through the single guarded `safeCapture` helper so that
 * analytics can NEVER crash the host UI (spec §13.4).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Conventions (spec §10.1 + Sprint 2 R11):
 *   • Event names are dot-namespaced: `help.<domain>.<verb>` (lowercase).
 *   • Property keys are snake_case (`surface_key`, `duration_ms`, `tour_key`).
 *   • Payloads are documented inline beside each constant. When you add or
 *     change an event, update the payload note here in the SAME change — this
 *     file is the contract the content team, the funnel dashboards, and the
 *     PostHog insights all read against.
 *
 * Persona / surface-key semantics live in `contentTypes.ts` and `surfaceKeys.ts`.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Payload reference (the shape each event is fired with today):
 *
 *   Layer 1 · Ambient
 *     empty_state.shown            { surface_key, persona? }
 *     empty_state.cta_clicked      { surface_key, action }
 *     field_helper.shown           { surface_key }
 *     section_intro.shown          { surface_key }
 *     smart_default.applied        { surface_key, field? }
 *     smart_default.overridden     { surface_key, field? }
 *
 *   Layer 2 · Reactive
 *     tooltip.shown                { surface_key, trigger? }
 *     tooltip.dismissed            { surface_key }
 *     learnmore.expanded           { surface_key }
 *     learnmore.collapsed          { surface_key }
 *     panel.opened                 { surface_key }
 *     panel.closed                 { surface_key, duration_ms }
 *
 *   Layer 3 · Proactive
 *     coachmark.shown              { surface_key }
 *     coachmark.dismissed          { surface_key }
 *     feature_announcement.shown   { announcement_key }
 *     feature_announcement.dismissed { announcement_key }
 *     welcome_modal.shown          { surface_key, persona, first_signin: true }
 *     welcome_modal.action         { surface_key, persona, action: 'start_tour' | 'skip' | 'dismiss' }
 *     tour.started                 { tour_key, total_steps, replay?: true }
 *     tour.step_advanced           { tour_key, step_number, step_surface_key }
 *     tour.step_viewed             { tour_key, step_number, step_surface_key }   ← covers step 0
 *     tour.completed               { tour_key, duration_ms, steps_viewed }
 *     tour.abandoned               { tour_key, at_step, total_steps }
 *     tour.replayed                { tour_key }                                  ← ⌘K / Help replay entry
 *
 *   Layer 4 · Reference
 *     article.opened               { article_id, surface_key, source }
 *     article.scrolled_to_end      { article_id, surface_key }
 *     article.feedback_given       { article_id, surface_key, helpful }
 *     related_article.clicked      { from_surface_key, to_surface_key, to_article_id }
 *     search.performed             { query_length, result_count }
 *     search.result_clicked        { query_length, surface_key }
 *     video.started                { surface_key }
 *     video.completed              { surface_key }
 *     help_center.viewed           { source }                                    ← /help shell (portal-fired)
 */

/**
 * Named constants for every help-system analytics event. Kept flat so a call
 * site reads `HELP_EVENTS.TOUR_STARTED` with no nesting, and grouped by the
 * four-layer architecture in comments for humans.
 */
export const HELP_EVENTS = {
  // ─── Layer 1 · Ambient ──────────────────────────────────────────────────
  EMPTY_STATE_SHOWN: 'help.empty_state.shown',
  EMPTY_STATE_CTA_CLICKED: 'help.empty_state.cta_clicked',
  FIELD_HELPER_SHOWN: 'help.field_helper.shown',
  SECTION_INTRO_SHOWN: 'help.section_intro.shown',
  SMART_DEFAULT_APPLIED: 'help.smart_default.applied',
  SMART_DEFAULT_OVERRIDDEN: 'help.smart_default.overridden',

  // ─── Layer 2 · Reactive ─────────────────────────────────────────────────
  TOOLTIP_SHOWN: 'help.tooltip.shown',
  TOOLTIP_DISMISSED: 'help.tooltip.dismissed',
  LEARNMORE_EXPANDED: 'help.learnmore.expanded',
  LEARNMORE_COLLAPSED: 'help.learnmore.collapsed',
  PANEL_OPENED: 'help.panel.opened',
  PANEL_CLOSED: 'help.panel.closed',

  // ─── Layer 3 · Proactive ────────────────────────────────────────────────
  COACHMARK_SHOWN: 'help.coachmark.shown',
  COACHMARK_DISMISSED: 'help.coachmark.dismissed',
  FEATURE_ANNOUNCEMENT_SHOWN: 'help.feature_announcement.shown',
  FEATURE_ANNOUNCEMENT_DISMISSED: 'help.feature_announcement.dismissed',
  WELCOME_MODAL_SHOWN: 'help.welcome_modal.shown',
  WELCOME_MODAL_ACTION: 'help.welcome_modal.action',
  TOUR_STARTED: 'help.tour.started',
  TOUR_STEP_ADVANCED: 'help.tour.step_advanced',
  /** New (help-desk Wave 0) — fires per step INCLUDING step 0, from the viewed-steps effect. */
  TOUR_STEP_VIEWED: 'help.tour.step_viewed',
  TOUR_COMPLETED: 'help.tour.completed',
  TOUR_ABANDONED: 'help.tour.abandoned',
  /** New (help-desk Wave 0) — fires when a completed/abandoned tour is replayed. */
  TOUR_REPLAYED: 'help.tour.replayed',

  // ─── Layer 4 · Reference ────────────────────────────────────────────────
  ARTICLE_OPENED: 'help.article.opened',
  ARTICLE_SCROLLED_TO_END: 'help.article.scrolled_to_end',
  ARTICLE_FEEDBACK_GIVEN: 'help.article.feedback_given',
  RELATED_ARTICLE_CLICKED: 'help.related_article.clicked',
  SEARCH_PERFORMED: 'help.search.performed',
  SEARCH_RESULT_CLICKED: 'help.search.result_clicked',
  VIDEO_STARTED: 'help.video.started',
  VIDEO_COMPLETED: 'help.video.completed',
  /** The /help Center shell mount (fired by the designer portal help pages). */
  HELP_CENTER_VIEWED: 'help.help_center.viewed',
} as const

/** A union of every event name in the taxonomy. */
export type HelpEventName = (typeof HELP_EVENTS)[keyof typeof HELP_EVENTS]

// ─── PostHog capture — the single guarded entry point ─────────────────────────

type PostHogLike = {
  capture?: (event: string, props?: Record<string, unknown>) => void
}

/**
 * Fire an analytics event through `window.posthog` when present. SSR-safe,
 * never throws — a missing PostHog (SSR, ad-blocker, dev without the key) or a
 * capture error is swallowed so help-system analytics can never crash the host
 * app (spec §13.4). This is the shared implementation every help-system
 * component uses; there is intentionally no other capture path in the package.
 *
 * @param event  A `HELP_EVENTS.*` constant (or any `help.*` string).
 * @param props  snake_case property bag. Optional — a bare event is valid.
 */
export function safeCapture(event: string, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  try {
    const ph = (window as unknown as { posthog?: PostHogLike }).posthog
    ph?.capture?.(event, props)
  } catch {
    // analytics must never crash the UI
  }
}
