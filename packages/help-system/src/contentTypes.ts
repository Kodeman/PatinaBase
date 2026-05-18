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

/** Discriminated union by contentType — payload shape per spec Section 7.2.x */
export type HelpContent =
  | TooltipContent
  | FieldHelperContent
  | EmptyStateContent
  | LearnMoreContent
  | CoachmarkContent
  | HelpArticleContent

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

/** Type-narrowing map from contentType discriminator to its content shape */
export type ContentTypeMap = {
  tooltip: TooltipContent
  fieldHelper: FieldHelperContent
  emptyState: EmptyStateContent
  learnMore: LearnMoreContent
  coachmark: CoachmarkContent
  helpArticle: HelpArticleContent
}
