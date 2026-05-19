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

export { SurfaceKeys, SURFACE_KEY_REGEX, isSurfaceKey } from './surfaceKeys';
export type { SurfaceKey } from './surfaceKeys';

// ─── Content types ────────────────────────────────────────────────────────────
export type {
  Persona,
  HelpContentType,
  HelpContent,
  TooltipContent,
  FieldHelperContent,
  EmptyStateContent,
  LearnMoreContent,
  CoachmarkContent,
  HelpArticleContent,
  WelcomeModalContent,
  VideoContent,
  ContentTypeMap,
} from './contentTypes';

// ─── Sanity client (exported so portals can swap it out in A6) ────────────────
export { getSanityClient } from './sanityClient';

// ─── Data hooks ───────────────────────────────────────────────────────────────
export { useHelpContent } from './hooks/useHelpContent';

// ─── Providers ────────────────────────────────────────────────────────────────
export { SurfaceKeyProvider, useSurfaceKey, useSetSurfaceKey } from './providers';
export type { SurfaceKeyProviderProps } from './providers';

// ─── Layer 1 · Ambient components ─────────────────────────────────────────────
export { FieldLabel } from './ambient/FieldLabel';
export type { FieldLabelProps } from './ambient/FieldLabel';
export { FieldHelper } from './ambient/FieldHelper';
export type { FieldHelperProps } from './ambient/FieldHelper';
export { EmptyState } from './ambient/EmptyState';
export type { EmptyStateProps, EmptyStateSize } from './ambient/EmptyState';
export { SmartDefault } from './ambient/SmartDefault';
export type { SmartDefaultAPI, SmartDefaultProps } from './ambient/SmartDefault';
export { SectionIntro } from './ambient/SectionIntro';
export type { SectionIntroProps } from './ambient/SectionIntro';

// ─── Layer 2 · Reactive components ────────────────────────────────────────────
export { Tooltip } from './reactive/Tooltip';
export type { TooltipProps } from './reactive/Tooltip';
export { InfoIcon } from './reactive/InfoIcon';
export type { InfoIconProps } from './reactive/InfoIcon';
export { StrataInfoIcon } from './reactive/StrataInfoIcon';
export type { StrataInfoIconProps } from './reactive/StrataInfoIcon';
export { LearnMore } from './reactive/LearnMore';
export type { LearnMoreProps } from './reactive/LearnMore';
export { ContextualHelpPanel } from './reactive/ContextualHelpPanel';
export type { ContextualHelpPanelProps } from './reactive/ContextualHelpPanel';

// ─── Layer 3 · Proactive components ──────────────────────────────────────────
export { Coachmark } from './proactive/Coachmark';
export type { CoachmarkProps } from './proactive/Coachmark';
export { WelcomeModal } from './proactive/WelcomeModal';
export type { WelcomeModalProps } from './proactive/WelcomeModal';
export { TourController } from './proactive/TourController';
export type {
  TourControllerProps,
  TourControllerAPI,
  CoachmarkStep,
} from './proactive/TourController';
export {
  getTourState,
  setTourState,
  clearTourState,
  TOUR_STATE_STORAGE_PREFIX,
} from './proactive/TourController';
export type { TourState } from './proactive/TourController';
export { FeatureAnnouncementCoachmark } from './proactive/FeatureAnnouncementCoachmark';
export type { FeatureAnnouncementCoachmarkProps } from './proactive/FeatureAnnouncementCoachmark';
export {
  getFeatureAnnouncementState,
  setFeatureAnnouncementState,
  clearFeatureAnnouncementState,
} from './proactive/FeatureAnnouncementCoachmark';
export type { FeatureAnnouncementState } from './proactive/FeatureAnnouncementCoachmark';

// ─── Layer 4 · Reference components ──────────────────────────────────────────
export { VideoPlayer } from './reference/VideoPlayer';
export type { VideoPlayerProps } from './reference/VideoPlayer';
