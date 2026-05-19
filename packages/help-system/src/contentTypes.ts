/**
 * Content types for the @patina/help-system.
 *
 * Discriminated union on `contentType` — each variant maps 1:1 to a Sanity
 * `helpContent` document with that `contentType` value. TypeScript narrows
 * the union when you call `useHelpContent('my-key', 'tooltip', 'designer')`.
 */

export type Persona = 'designer' | 'maker' | 'consumer' | 'admin' | 'all'

export type HelpContentType =
  | 'tooltip'
  | 'fieldHelper'
  | 'emptyState'
  | 'learnMore'
  | 'coachmark'
  | 'helpArticle'
  | 'welcomeModal'
  | 'video'

/** Discriminated union by contentType — payload shape per spec Section 7.2.x */
export type HelpContent =
  | TooltipContent
  | FieldHelperContent
  | EmptyStateContent
  | LearnMoreContent
  | CoachmarkContent
  | HelpArticleContent
  | WelcomeModalContent
  | VideoContent

export interface TooltipContent {
  surfaceKey: string
  persona: Persona
  contentType: 'tooltip'
  eyebrow?: string
  body: string
}

export interface FieldHelperContent {
  surfaceKey: string
  persona: Persona
  contentType: 'fieldHelper'
  body: string
  variant?: 'default' | 'error' | 'success'
}

export interface EmptyStateContent {
  surfaceKey: string
  persona: Persona
  contentType: 'emptyState'
  icon?: string
  heading: string
  description: string
  primaryActionLabel?: string
  secondaryActionLabel?: string
  secondaryActionArticleKey?: string
}

export interface LearnMoreContent {
  surfaceKey: string
  persona: Persona
  contentType: 'learnMore'
  label?: string
  body: string
}

export interface CoachmarkContent {
  surfaceKey: string
  persona: Persona
  contentType: 'coachmark'
  heading: string
  body: string
  ctaLabel?: string
}

export interface HelpArticleContent {
  surfaceKey: string
  persona: Persona
  contentType: 'helpArticle'
  eyebrow?: string
  title: string
  oneSentenceAnswer: string
  body: unknown[] // portable-text blocks — typed loosely; consumer renders with @portabletext/react
  wordCount?: number
  readingTimeMinutes?: number
  lastUpdated?: string
  videoUrl?: string
}

/**
 * Layer 3 (Proactive) — first-signin welcome modal copy.
 * Spec §4.8: title + body + exactly two CTAs ("Take the tour" / "Jump in").
 * The CTA labels are content-driven so each persona variant can phrase its own
 * orientation copy, but the action wiring (start tour / skip) is fixed.
 */
export interface WelcomeModalContent {
  surfaceKey: string
  persona: Persona
  contentType: 'welcomeModal'
  title: string
  body: string
  primaryCtaLabel: string
  secondaryCtaLabel?: string
}

/**
 * Layer 4 (Reference) — video walkthrough payload (spec §4 — Reference).
 *
 * Open question §16: hosting choice (Sanity CDN vs Mux vs YouTube) deferred.
 * For Sprint 3 we treat `src` as an opaque URL — typically a Sanity asset CDN
 * URL but the component does not care. Captions are a separate `.vtt` track
 * URL; transcript is rendered as a string (consumer may also pass a React
 * node directly via the component prop, bypassing CMS).
 */
export interface VideoContent {
  surfaceKey: string
  persona: Persona
  contentType: 'video'
  /** Direct media URL (Sanity CDN, Mux playback URL, or YouTube embed). */
  src: string
  /** Optional poster image displayed before play. */
  posterUrl?: string
  /** Optional WebVTT captions URL. */
  captionsUrl?: string
  /** Optional transcript text. */
  transcript?: string
  /** Optional human-readable title (for analytics + a11y label fallback). */
  title?: string
}

/** Type-narrowing map from contentType discriminator to its content shape */
export type ContentTypeMap = {
  tooltip: TooltipContent
  fieldHelper: FieldHelperContent
  emptyState: EmptyStateContent
  learnMore: LearnMoreContent
  coachmark: CoachmarkContent
  helpArticle: HelpArticleContent
  welcomeModal: WelcomeModalContent
  video: VideoContent
}
