/**
 * @patina/help-system
 *
 * Patina's in-context Help & Guidance System — a four-layer architecture
 * that makes the platform feel approachable from the first click and reliable
 * on the thousandth, without interrupting the work users came to do.
 *
 * Four Layers:
 *
 * Layer 1 · Ambient (always present, never intrusive)
 *   The interface itself — smart defaults, empty states, microcopy, field
 *   labels, structural hierarchy. Carries ~70% of guidance load.
 *   Components: EmptyState, FieldHelper, FieldLabel, SmartDefault, SectionIntro
 *
 * Layer 2 · Reactive (appears when summoned)
 *   User pulls help toward them. Hover to reveal, click to expand. Never pushes.
 *   Components: Tooltip, InfoIcon, StrataInfoIcon, LearnMore, ContextualHelpPanel
 *
 * Layer 3 · Proactive (system-initiated, rare)
 *   System reaches out only when it has high signal. Always dismissable forever.
 *   Components: Coachmark, TourController, FeatureAnnouncementCoachmark
 *
 * Layer 4 · Reference (structured knowledge on demand)
 *   Deep content the user seeks out. Fully optional, never blocking.
 *   Components: HelpArticle, GlossaryTerm, VideoGuide, HelpSearchModal, HelpCenterIndex
 *
 * All help copy lives in Sanity CMS and is fetched by surface key.
 * No content is hardcoded in components.
 *
 * Components ship in subsequent task streams (B, C, D, E).
 * See: docs/prds/Guide/patina-help-guidance-engineering-handoff.md
 */

export const HELP_SYSTEM_VERSION = '0.1.0';
